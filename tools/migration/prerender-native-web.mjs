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
import { dirname, extname, join } from 'node:path';
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
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
  EARLY_POINTERS_GLOBAL,
  PAPER_INPUT_TEST_ID,
  PAPER_TEXTURE_PROPERTY,
} from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import { PALETTE_COLORS } from '../../experiments/native-architecture/src/drawing/palette.ts';
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
// Expo links its extracted style sheet render-blocking. The frame is inlined in its place, as the
// shipping drawing route inlines its CSS (ADR-0176): otherwise first paint waits one more round trip.
const EXPO_STYLESHEET =
  /<link rel="preload" href="([^"]+\.css)" as="style">\s*<link rel="stylesheet" href="\1">/g;
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

const IMAGE_TYPES = { '.webp': 'image/webp', '.png': 'image/png' };
const PAPER_TEXTURE_FALLBACK = new RegExp(
  `var\\(${PAPER_TEXTURE_PROPERTY}, url\\(&quot;(/[^&]+)&quot;\\)\\)`
);

// The paper texture is the frame's largest paint. Requested on its own it held Largest Contentful
// Paint a round trip behind first paint, so the shell carries it once, as a custom property the
// paper reads (PaperTexture.web.tsx), and check-native-web-startup.mjs allows exactly this image.
export function paperTextureRule(markup, readExportFile) {
  const href = PAPER_TEXTURE_FALLBACK.exec(markup)?.[1];
  if (!href) throw new Error('The first frame paints no paper texture to inline.');
  const type = IMAGE_TYPES[extname(href)];
  if (!type) throw new Error(`The paper texture is not an image this shell inlines: ${href}`);
  const data = readExportFile(href).toString('base64');
  return `:root{${PAPER_TEXTURE_PROPERTY}:url("data:${type};base64,${data}")}`;
}

// What a press on a control does before its handler attaches: the button squishes while held and
// wiggles "not yet" when it lands. A touch on the paper before the engine listens throws a little
// burst of paint instead. Reduce Motion keeps both still.
const PRESS_SCALE = 0.94;
const REDUCED_PRESS_OPACITY = 0.7;
export const NOT_YET_WIGGLE_MS = 320;
const NOT_YET_WIGGLE_PX = 4;
const REDUCED_NOT_YET_OPACITY = 0.5;
export const BURST_DOTS = 6;
export const BURST_MS = 520;
const BURST_DOT_PX = 12;
const BURST_REACH_PX = 40;
const REDUCED_BURST_REACH_PX = 20;
const BURST_END_SCALE = 0.4;
// Above every layer the app paints: the burst answers the touch wherever it lands.
const BURST_LAYER = 2147483647;
export const BURST_CLASS = 'first-frame-burst';
const BURST_ANGLE_PROPERTY = '--first-frame-burst-angle';

export function firstFrameFeedbackCss() {
  const pending = `html:not([${CONTROLS_LIVE_ATTRIBUTE}]) #root button:active`;
  const dot = `.${BURST_CLASS} i`;
  const half = BURST_DOT_PX / 2;
  return [
    `${pending}{scale:${PRESS_SCALE}}`,
    `.${BURST_CLASS}{position:fixed;width:0;height:0;pointer-events:none;z-index:${BURST_LAYER}}`,
    `${dot}{position:absolute;left:-${half}px;top:-${half}px;width:${BURST_DOT_PX}px;height:${BURST_DOT_PX}px;border-radius:50%;animation:first-frame-burst ${BURST_MS}ms ease-out forwards}`,
    `@keyframes first-frame-burst{from{transform:rotate(var(${BURST_ANGLE_PROPERTY})) translateX(0) scale(1);opacity:1}to{transform:rotate(var(${BURST_ANGLE_PROPERTY})) translateX(${BURST_REACH_PX}px) scale(${BURST_END_SCALE});opacity:0}}`,
    '@media (prefers-reduced-motion:reduce){',
    `${pending}{scale:none;opacity:${REDUCED_PRESS_OPACITY}}`,
    `${dot}{transform:rotate(var(${BURST_ANGLE_PROPERTY})) translateX(${REDUCED_BURST_REACH_PX}px);animation-name:first-frame-burst-still}`,
    '@keyframes first-frame-burst-still{from{opacity:1}to{opacity:0}}',
    '}',
  ].join('');
}

function burstColors() {
  const step = PALETTE_COLORS.length / BURST_DOTS;
  return Array.from({ length: BURST_DOTS }, (_, dot) => PALETTE_COLORS[Math.floor(dot * step)].hex);
}

// Runs once a frame is cloned, before any app code. It never draws: a pointer down on the paper is
// only remembered (where it is, under EARLY_POINTERS_GLOBAL) for the engine to take over. Presses on
// controls are kept from the app until its controls listen, so one cannot act late.
function earlyInputScript() {
  const paper = `[data-testid=${JSON.stringify(PAPER_INPUT_TEST_ID)}]`;
  // Squished through the wiggle as well: a touch press does not always match :active.
  const wiggle = [0, -NOT_YET_WIGGLE_PX, NOT_YET_WIGGLE_PX, -NOT_YET_WIGGLE_PX / 2, 0].map(
    (px, frame, frames) =>
      `{translate:'${px}px',scale:${frame === 0 || frame === frames.length - 1 ? 1 : PRESS_SCALE}}`
  );
  return [
    '(function(){',
    `var P=window[${JSON.stringify(EARLY_POINTERS_GLOBAL)}]={},d=document.documentElement;`,
    'function live(a){return d.hasAttribute(a)}',
    "function still(){return matchMedia('(prefers-reduced-motion: reduce)').matches}",
    `function control(e){var t=e.target;return t&&t.closest&&!live(${JSON.stringify(CONTROLS_LIVE_ATTRIBUTE)})&&t.closest('#root button')}`,
    `var C=${JSON.stringify(burstColors())};`,
    'function burst(x,y){var b=document.createElement("div");',
    `b.className=${JSON.stringify(BURST_CLASS)};b.style.left=x+"px";b.style.top=y+"px";`,
    `for(var i=0;i<C.length;i++){var s=document.createElement("i");s.style.setProperty(${JSON.stringify(BURST_ANGLE_PROPERTY)},i*${360 / BURST_DOTS}+"deg");s.style.background=C[i];b.appendChild(s)}`,
    `document.body.appendChild(b);setTimeout(function(){b.remove()},${BURST_MS})}`,
    'addEventListener("pointerdown",function(e){var c=control(e);',
    `if(c){e.stopPropagation();c.animate(still()?[{opacity:1},{opacity:${REDUCED_NOT_YET_OPACITY}},{opacity:1}]:[${wiggle.join(',')}],${NOT_YET_WIGGLE_MS});return}`,
    `if(live(${JSON.stringify(DRAWING_LIVE_ATTRIBUTE)})||!e.target.closest||!e.target.closest(${JSON.stringify(paper)}))return;`,
    'P[e.pointerId]={pointerId:e.pointerId,pointerType:e.pointerType,pageX:e.pageX,pageY:e.pageY,clientX:e.clientX,clientY:e.clientY};',
    'burst(e.clientX,e.clientY)},true);',
    'addEventListener("pointermove",function(e){var p=P[e.pointerId];if(p){p.pageX=e.pageX;p.pageY=e.pageY;p.clientX=e.clientX;p.clientY=e.clientY}},true);',
    '["pointerup","pointercancel"].forEach(function(n){addEventListener(n,function(e){delete P[e.pointerId]},true)});',
    '["pointerup","click","mousedown","mouseup","touchstart","touchend"].forEach(function(n){addEventListener(n,function(e){if(control(e))e.stopPropagation()},true)});',
    '})();',
  ].join('');
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
    earlyInputScript(),
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

export function withFirstFrames(indexHtml, { variants, sheet }, readExportFile) {
  if (!indexHtml.includes(EMPTY_ROOT)) throw new Error('The export has no empty root to fill.');
  if (!indexHtml.includes('<head>')) throw new Error('The export has no <head> to extend.');
  const markup = variants.map(({ html }) => html).join('');
  const style = `<style id="${sheet.id}">${criticalSheetText(sheet.textContent, markup)}</style>`;
  const shellStyle = `<style>${paperTextureRule(markup, readExportFile)}${firstFrameFeedbackCss()}</style>`;
  const templates = variants.map(
    ({ id, viewport, html }) =>
      `<template id="${id}" ${FIRST_FRAME_VIEWPORT_ATTRIBUTE}="${formatFirstFrameViewport(viewport)}">${html}</template>`
  );
  const scripts = [...indexHtml.matchAll(EXPO_SCRIPT)].map((match) => match[1]);
  if (scripts.length === 0) throw new Error('The export loads no deferred script to hold back.');
  if (indexHtml.search(EXPO_STYLESHEET) < 0)
    throw new Error('The export links no style sheet to inline.');
  return indexHtml
    .replace(
      EXPO_STYLESHEET,
      (_, href) => `<style>${readExportFile(href).toString('utf8')}</style>`
    )
    .replace('<head>', `<head>\n${style}\n${shellStyle}`)
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
  const readExportFile = (href) => readFileSync(join(dirname(indexPath), href));
  writeFileSync(
    indexPath,
    withFirstFrames(readFileSync(indexPath, 'utf8'), frames, readExportFile)
  );
  return frames;
}

if (isMain(import.meta.url))
  runMain(async () => {
    const indexPath = process.argv[2] ?? join(NATIVE_APP_DIR, 'dist/web/index.html');
    const { variants } = await prerenderNativeWeb(indexPath);
    console.log(`[native-web-prerender] ${indexPath}: ${variants.length} first-frame variants`);
  });
