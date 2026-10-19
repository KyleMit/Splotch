// Prerenders the React Native web export's first frame into its index.html, the way Expo Router's
// static output does (web.output "static"): Metro bundles a render module for Node
// (`environment: node`), the build evaluates it, React Native Web renders the root and its style
// sheet, and Expo's hydration flag tells the web launcher to hydrate that markup instead of
// rendering over it. This app has one screen and no router, so it uses that pipeline's parts
// directly: the bundle request Expo's own out-of-band bundler builds (export:embed, which
// expo-updates uses) and Expo Router's hydration flag.
//
// The drawing screen lays out from the window in JavaScript and themes from the visitor's saved or
// system choice, so one markup cannot fit every visitor. The shell carries one inert <template>
// per size class, orientation and theme; its boot script clones the one that fits into the root
// before first paint, and the client hydrates it with that variant's viewport, then relayouts to
// its own (platform/firstFrame.web.ts).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LARGE_TABLET_MIN_SIDE_PX, TABLET_MIN_SIDE_PX } from '../../web/src/lib/breakpoints.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { DRAWING_PATHS } from '../../experiments/native-architecture/src/platform/appSurfacePolicy.ts';
import {
  FIRST_FRAME_VIEWPORT_ATTRIBUTE,
  formatFirstFrameViewport,
} from '../../experiments/native-architecture/src/platform/firstFrameViewport.ts';
import { SOUND_SETTINGS_KEY } from '../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { BRUSH_SETTINGS_KEY } from '../../experiments/native-architecture/src/platform/brushPreferences.web.ts';
import { STORAGE_KEYS } from '../../web/src/lib/storageKeys.ts';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const require = createRequire(import.meta.url);
const NATIVE_APP_DIR = join(ROOT, 'experiments/native-architecture');
export const FIRST_FRAME_ENTRY = 'src/prerenderFirstFrame.tsx';
const EMPTY_ROOT = '<div id="root"></div>';
const FIRST_FRAME_TEMPLATE_PREFIX = 'first-frame-';
// The records whose saved choices change the drawing screen's first frame. None exists until a
// visitor changes something; the frames are rendered from the defaults, so a visitor with any of
// them gets today's render instead of a frame that would change as the settings load.
export const FIRST_FRAME_SETTINGS_KEYS = [
  SOUND_SETTINGS_KEY,
  BRUSH_SETTINGS_KEY,
  STORAGE_KEYS.drawerOpen,
];
// The element listing the scripts the boot script loads, in order, once the first frame has painted.
export const STARTUP_SCRIPTS_ELEMENT_ID = 'startup-scripts';
// A first contentful paint that has not been reported by then is not coming soon (a stalled style
// sheet, or a browser without Paint Timing); the bundle loads anyway rather than wait on it.
const FIRST_PAINT_FALLBACK_MS = 2000;
const EXPO_SCRIPT = /<script src="([^"]+)" defer><\/script>/g;
const STARTUP_SCRIPTS_ELEMENT = new RegExp(
  `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">([^<]*)</script>`
);
export const FIRST_FRAME_THEMES = ['light', 'dark'];

// One viewport per size class and orientation the drawing screen lays out differently: the
// Lighthouse phone and tablet profiles (tools/page-load/run-lighthouse-ci.mjs), their rotations,
// and a 13-inch iPad. A visitor on another viewport of the same class hydrates the nearest and
// relayouts once.
export const FIRST_FRAME_VIEWPORTS = [
  { width: 412, height: 915, scale: 2.625 },
  { width: 915, height: 412, scale: 2.625 },
  { width: 744, height: 1133, scale: 2 },
  { width: 1133, height: 744, scale: 2 },
  { width: 1024, height: 1366, scale: 2 },
  { width: 1366, height: 1024, scale: 2 },
];

export function sizeClass({ width, height }) {
  const shorter = Math.min(width, height);
  return shorter < TABLET_MIN_SIDE_PX ? 0 : shorter < LARGE_TABLET_MIN_SIDE_PX ? 1 : 2;
}

export function variantKey(viewport, theme) {
  return `${sizeClass(viewport)}${viewport.width > viewport.height ? 'l' : 'p'}${theme}`;
}

function expoBundleRequestFactory() {
  return require('@expo/cli/build/src/export/embed/exportEmbedAsync.js')
    .createMetroServerAndBundleRequestAsync;
}

export function hydrationFlagScriptContents() {
  return require('@expo/router-server/build/utils/html.js').getHydrationFlagScriptContents();
}

// Expo's SSR loader turns the bundle's final run call into its exports the same way.
function asCommonJsModule(bundle) {
  return bundle.replace(/^(__r\(.*\);)$/gm, 'module.exports = $1');
}

export async function bundleFirstFrameRenderer() {
  const { server, bundleRequest } = await expoBundleRequestFactory()(NATIVE_APP_DIR, {
    entryFile: FIRST_FRAME_ENTRY,
    platform: 'web',
    dev: false,
    minify: false,
    resetCache: false,
  });
  try {
    const { code } = await server.build({
      ...bundleRequest,
      customTransformOptions: { ...bundleRequest.customTransformOptions, environment: 'node' },
      customResolverOptions: { ...bundleRequest.customResolverOptions, environment: 'node' },
    });
    return asCommonJsModule(code);
  } finally {
    await server.end();
  }
}

// The icons' SvgXml parses its markup with the browser's DOMParser (platform/svg.web.ts). The build
// lends the render a standards parser, and only that: no window or document, so every other module
// still takes its server branch.
async function lendXmlParser() {
  const { Window } = await import('happy-dom');
  const { DOMParser, Element, Node } = new Window();
  Object.assign(globalThis, { DOMParser, Element, Node });
}

function evaluateRenderer(source) {
  const directory = mkdtempSync(join(tmpdir(), 'native-web-prerender-'));
  const filename = join(directory, 'first-frame.js');
  writeFileSync(filename, source);
  try {
    const module = new Module(filename);
    module.filename = filename;
    module.paths = Module._nodeModulePaths(NATIVE_APP_DIR);
    module._compile(source, filename);
    return module.exports;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// React Native Web's server sheet holds every style any evaluated module created. The shell keeps
// the rules its markup uses and the sheet's group markers, which the browser's sheet reads back
// when it adopts the element; it inserts the rest as their modules load, as without a prerender.
export function criticalSheetText(textContent, markup) {
  const used = new Set(
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/))
  );
  return textContent
    .split('\n')
    .filter((rule) => {
      const classes = [...rule.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
      return classes.length === 0 || classes.some((name) => used.has(name));
    })
    .join('\n');
}

export function preloadedImages(markup) {
  return [...new Set([...markup.matchAll(/url\(&quot;(\/[^&]+)&quot;\)/g)].map((m) => m[1]))];
}

export function startupScriptList(indexHtml) {
  const list = STARTUP_SCRIPTS_ELEMENT.exec(indexHtml);
  return list ? JSON.parse(list[1]) : [];
}

// Runs on the parser's way past the root: picks the variant for this window and theme, clones it
// into the root, and flags Expo's launcher to hydrate. Off the drawing paths, for a visitor with
// saved choices, or without a fitting variant, it leaves the root empty and the app renders as
// before.
//
// It then loads the bundle, in order, once the browser reports the cloned frame's first contentful
// paint (at once when nothing was cloned, or the page is hidden and will not paint). A bundle requested with the
// document shares the connection with the frame's style sheet and paper texture on a slow network,
// and Lighthouse's simulation counts every request started before the observed paint toward
// Largest Contentful Paint.
export function firstFrameBootScript(variants) {
  const table = Object.fromEntries(variants.map(({ key, id }) => [key, id]));
  return [
    '(function(){var painted=false;try{',
    `if(${JSON.stringify(DRAWING_PATHS)}.includes(location.pathname)&&${JSON.stringify(FIRST_FRAME_SETTINGS_KEYS)}.every(function(k){return localStorage.getItem(k)===null})){`,
    'var w=innerWidth,h=innerHeight,s=Math.min(w,h);',
    `var c=s<${TABLET_MIN_SIDE_PX}?0:s<${LARGE_TABLET_MIN_SIDE_PX}?1:2;`,
    `var t=document.documentElement.getAttribute(${JSON.stringify(BOOT_THEME_ATTRIBUTE)});`,
    "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';",
    `var f=document.getElementById(${JSON.stringify(table)}[c+(w>h?'l':'p')+t]);`,
    'if(f){',
    "var r=document.getElementById('root');",
    'r.appendChild(f.content.cloneNode(true));',
    `r.setAttribute(${JSON.stringify(FIRST_FRAME_VIEWPORT_ATTRIBUTE)},f.getAttribute(${JSON.stringify(FIRST_FRAME_VIEWPORT_ATTRIBUTE)}));`,
    hydrationFlagScriptContents(),
    "painted=document.visibilityState==='visible';",
    '}}}catch(e){}',
    'function load(){',
    `var l=JSON.parse(document.getElementById(${JSON.stringify(STARTUP_SCRIPTS_ELEMENT_ID)}).textContent);`,
    "for(var i=0;i<l.length;i++){var x=document.createElement('script');x.src=l[i];x.async=false;document.body.appendChild(x)}}",
    'if(!painted)return load();',
    'var done=false;function go(){if(!done){done=true;load()}}',
    "try{new PerformanceObserver(function(l,o){if(l.getEntriesByName('first-contentful-paint').length){o.disconnect();setTimeout(go)}}).observe({type:'paint',buffered:true})}catch(e){go()}",
    `setTimeout(go,${FIRST_PAINT_FALLBACK_MS});`,
    '})();',
  ].join('');
}

export function renderFirstFrames(prerenderFirstFrame) {
  const variants = FIRST_FRAME_VIEWPORTS.flatMap((viewport) =>
    FIRST_FRAME_THEMES.map((appearance) => {
      const { html } = prerenderFirstFrame({ viewport, appearance });
      const key = variantKey(viewport, appearance);
      return { key, id: `${FIRST_FRAME_TEMPLATE_PREFIX}${key}`, viewport, html };
    })
  );
  const { sheet } = prerenderFirstFrame({
    viewport: FIRST_FRAME_VIEWPORTS[0],
    appearance: 'light',
  });
  return { variants, sheet };
}

export function withFirstFrames(indexHtml, { variants, sheet }) {
  if (!indexHtml.includes(EMPTY_ROOT)) throw new Error('The export has no empty root to fill.');
  if (!indexHtml.includes('<head>')) throw new Error('The export has no <head> to extend.');
  const markup = variants.map(({ html }) => html).join('');
  const style = `<style id="${sheet.id}">${criticalSheetText(sheet.textContent, markup)}</style>`;
  const preloads = preloadedImages(markup).map(
    (href) => `<link rel="preload" as="image" href="${href}" fetchpriority="high">`
  );
  const templates = variants.map(
    ({ id, viewport, html }) =>
      `<template id="${id}" ${FIRST_FRAME_VIEWPORT_ATTRIBUTE}="${formatFirstFrameViewport(viewport)}">${html}</template>`
  );
  const scripts = [...indexHtml.matchAll(EXPO_SCRIPT)].map((match) => match[1]);
  if (scripts.length === 0) throw new Error('The export loads no deferred script to hold back.');
  return indexHtml
    .replace('<head>', `<head>\n${style}\n${preloads.join('\n')}`)
    .replace(EXPO_SCRIPT, '')
    .replace(
      EMPTY_ROOT,
      [
        EMPTY_ROOT,
        ...templates,
        `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify(scripts)}</script>`,
        `<script>${firstFrameBootScript(variants)}</script>`,
      ].join('\n')
    );
}

export async function prerenderNativeWeb(indexPath) {
  await lendXmlParser();
  const { prerenderFirstFrame } = evaluateRenderer(await bundleFirstFrameRenderer());
  const frames = renderFirstFrames(prerenderFirstFrame);
  writeFileSync(indexPath, withFirstFrames(readFileSync(indexPath, 'utf8'), frames));
  return frames;
}

if (isMain(import.meta.url))
  runMain(async () => {
    const indexPath = process.argv[2] ?? join(NATIVE_APP_DIR, 'dist/web/index.html');
    const { variants } = await prerenderNativeWeb(indexPath);
    console.log(`[native-web-prerender] ${indexPath}: ${variants.length} first-frame variants`);
  });
