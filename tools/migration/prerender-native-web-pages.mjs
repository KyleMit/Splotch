// Writes a prerendered document for every route-table page whose document is its own
// (APP_PAGE_DOCUMENTS in appPages.ts): `<page>.html`, which a static host serves at the page's path
// by pretty URL. Each carries its page's whole markup, rendered in Node from the page entry's render
// module, with its CSS inlined, so it paints and reads without JavaScript. Its boot script then
// loads the page entry (src/pageDocument/), a bundle of its own that hydrates that markup. The page
// entry is bundled through the same out-of-band Metro request as the drawing screen's Node render
// (prerender-native-web.mjs), never as a branch of the drawing screen's entry, so nothing a page
// document loads is on the drawing screen's startup path.
//
// The page lays out from the window in JavaScript and themes from the visitor's saved or system
// choice, as the drawing screen does. The document carries one copy of the markup per layout class
// and theme; without JavaScript a media query shows the one that fits, and with it the boot script
// keeps that one as the root, names its viewport for hydration (platform/firstFrameWindow.ts) and
// removes the rest before anything else runs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { PHONE_MAX_WIDTH_PX, SHORT_PAGE_HEIGHT_PX } from '../../web/src/lib/breakpoints.ts';
import {
  APP_PAGE_DOCUMENTS,
  APP_PAGE_PATHS,
  WEB_DOCUMENT_PATHS,
} from '../../experiments/native-architecture/src/information/appPages.ts';
import { APP_DOCUMENT_ATTRIBUTE } from '../../experiments/native-architecture/src/pageDocument/appDocumentContract.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import {
  FIRST_FRAME_VIEWPORT_ATTRIBUTE,
  formatFirstFrameViewport,
} from '../../experiments/native-architecture/src/platform/firstFrameViewport.ts';
import {
  HIDDEN_WITHOUT_SCRIPT_ATTRIBUTE,
  PAGE_FRAMED_MAX_WIDTH_PX,
  SHOWN_WITHOUT_SCRIPT_ATTRIBUTE,
} from '../../experiments/native-architecture/src/rsdDrawing/pageFrame.ts';
import {
  DESIGN_DOCUMENT_STYLE_SOURCES,
  PAGE_DOCUMENT_RESOLVER_OPTION,
} from '../../experiments/native-architecture/scripts/page-document-resolution.cjs';
import { ROOT } from '../lib/proc.mjs';
import {
  EXPO_SCRIPT,
  EXPO_STYLESHEET,
  FIRST_FRAME_THEMES,
  STARTUP_SCRIPTS_ELEMENT_ID,
  bundleForNode,
  criticalSheetText,
  evaluateRenderer,
  expoBundleRequestFactory,
  hydrationFlagScriptContents,
  lendXmlParser,
  startupScriptList,
  startupScriptsAfterPaint,
} from './prerender-native-web.mjs';

const require = createRequire(import.meta.url);
const NATIVE_APP_DIR = join(ROOT, 'experiments/native-architecture');
export const PAGE_DOCUMENT_DIR = 'src/pageDocument';
// The drawing screen's entry, which `expo export` bundles (the app's package.json main).
const DRAWING_ENTRY = 'src/index.ts';
export const PAGE_ENTRY = `${PAGE_DOCUMENT_DIR}/pageApp.ts`;
export const PAGE_RENDER_ENTRY = `${PAGE_DOCUMENT_DIR}/prerender.tsx`;
export const DESIGN_DOCUMENT_DIR = `${PAGE_DOCUMENT_DIR}/design`;
const PAGE_DOCUMENT_RESOLUTION = { [PAGE_DOCUMENT_RESOLVER_OPTION]: true };
export const PAGE_VARIANT_ATTRIBUTE = 'data-page-variant';
const EMPTY_ROOT = '<div id="root"></div>';
const EXPO_NOSCRIPT = /\s*<!--[^>]*-->\s*<noscript>[^<]*<\/noscript>/;
const HTML_ELEMENT = /<html(\s[^>]*)?>/;
const TITLE = /<title>[^<]*<\/title>/;

// Every page the route table gives a document of its own, then every web-only document, and the
// file the build writes each to.
export function documentPages(documents = APP_PAGE_DOCUMENTS, webDocuments = WEB_DOCUMENT_PATHS) {
  return [
    ...Object.entries(documents)
      .filter(([, { document }]) => document === 'page')
      .map(([page]) => ({ page, path: APP_PAGE_PATHS[page], file: `${page}.html` })),
    ...Object.entries(webDocuments).map(([page, path]) => ({ page, path, file: `${page}.html` })),
  ];
}

// The layouts an information page takes: RsdPageSheet's phone, framed and desktop frames, and its
// short frame for a landscape phone. The two scripts below and their media queries read the same
// thresholds.
export const PAGE_VARIANT_VIEWPORTS = {
  phone: { width: 412, height: 915, scale: 2.625 },
  short: { width: 915, height: 412, scale: 2.625 },
  framed: { width: 820, height: 1180, scale: 2 },
  desktop: { width: 1280, height: 800, scale: 2 },
};

export function pageVariantClass({ width, height }) {
  if (width <= PHONE_MAX_WIDTH_PX) return 'phone';
  if (height <= SHORT_PAGE_HEIGHT_PX) return 'short';
  return width <= PAGE_FRAMED_MAX_WIDTH_PX ? 'framed' : 'desktop';
}

const PAGE_VARIANT_MEDIA = {
  phone: `(width<=${PHONE_MAX_WIDTH_PX}px)`,
  short: `(width>${PHONE_MAX_WIDTH_PX}px) and (height<=${SHORT_PAGE_HEIGHT_PX}px)`,
  framed: `(width>${PHONE_MAX_WIDTH_PX}px) and (width<=${PAGE_FRAMED_MAX_WIDTH_PX}px) and (height>${SHORT_PAGE_HEIGHT_PX}px)`,
  desktop: `(width>${PAGE_FRAMED_MAX_WIDTH_PX}px) and (height>${SHORT_PAGE_HEIGHT_PX}px)`,
};

// The layouts a page document carries a variant for, how a media query and the boot script each
// pick one, and the window the build renders each at. An information page lays out from the window
// in JavaScript; the styleguide lays itself out with media queries, so one layout fits every
// window and it carries a variant per theme only.
export const INFORMATION_LAYOUTS = {
  viewports: PAGE_VARIANT_VIEWPORTS,
  media: PAGE_VARIANT_MEDIA,
  classOf: pageVariantClass,
  classScript: `w<=${PHONE_MAX_WIDTH_PX}?'phone':h<=${SHORT_PAGE_HEIGHT_PX}?'short':w<=${PAGE_FRAMED_MAX_WIDTH_PX}?'framed':'desktop'`,
};
export const FLUID_LAYOUTS = {
  viewports: { fluid: PAGE_VARIANT_VIEWPORTS.desktop },
  media: { fluid: 'all' },
  classOf: () => 'fluid',
  classScript: "'fluid'",
};

// The entry each page document loads, the module the build renders its markup from (both
// export prerenderPage, pageDocumentHead and pageIconsSettled), and its layouts. The information
// pages share one entry; the styleguide has its own, so no information page loads its specimens.
// Its styles stay out of strict.css, which every document inlines (postcss.config.mjs), and only
// its own document carries them.
export const DOCUMENT_ENTRIES = {
  information: {
    app: PAGE_ENTRY,
    render: PAGE_RENDER_ENTRY,
    layouts: INFORMATION_LAYOUTS,
    styleSources: null,
  },
  design: {
    app: `${DESIGN_DOCUMENT_DIR}/designApp.ts`,
    render: `${DESIGN_DOCUMENT_DIR}/prerender.tsx`,
    layouts: FLUID_LAYOUTS,
    styleSources: DESIGN_DOCUMENT_STYLE_SOURCES,
  },
};

export function documentEntry(page) {
  return Object.hasOwn(WEB_DOCUMENT_PATHS, page) ? page : 'information';
}

const variantSelector = (key) => `[${PAGE_VARIANT_ATTRIBUTE}=${key}]`;

// Without JavaScript the media queries show the variant that fits: the light one, or the dark one
// for a dark system. Each variant lays out as Expo's #root does; the kept one becomes #root.
export function pageVariantCss(layouts = INFORMATION_LAYOUTS) {
  return [
    `[${PAGE_VARIANT_ATTRIBUTE}]{display:none;height:100%;flex:1}`,
    ...Object.entries(layouts.media).flatMap(([layout, media]) => [
      `@media ${media}{${variantSelector(`${layout}-light`)}{display:flex}}`,
      `@media ${media} and (prefers-color-scheme:dark){${variantSelector(`${layout}-light`)}{display:none}${variantSelector(`${layout}-dark`)}{display:flex}}`,
    ]),
  ].join('');
}

// Every variant carries the page's fragment targets (its section ids), and a browser follows a
// fragment to the first element with that id, which without a script is usually a hidden variant.
// So each variant's targets, and the in-page links to them, carry the variant's key; the boot script
// strips it from the variant it keeps before hydration, so the hydrated markup is the page's own.
export const VARIANT_FRAGMENT_SEPARATOR = '~';

// A section URL copied without JavaScript carries its variant's key; a visit with JavaScript reads
// the page's own fragment instead.
function variantFragmentPattern(viewports) {
  const layouts = Object.keys(viewports).join('|');
  return `/${VARIANT_FRAGMENT_SEPARATOR}(?:${layouts})-(?:${FIRST_FRAME_THEMES.join('|')})$/`;
}

export function withVariantFragments(html, key) {
  const linked = new Set([...html.matchAll(/ href="#([^"]+)"/g)].map((match) => match[1]));
  const targets = new Set(
    [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]).filter((id) => linked.has(id))
  );
  const suffix = `${VARIANT_FRAGMENT_SEPARATOR}${key}`;
  return html
    .replace(/ id="([^"]+)"/g, (attribute, id) =>
      targets.has(id) ? ` id="${id}${suffix}"` : attribute
    )
    .replace(/ href="#([^"]+)"/g, (attribute, id) =>
      targets.has(id) ? ` href="#${id}${suffix}"` : attribute
    );
}

// Without a script, what one would reveal shows, and the control that would reveal it hides, as
// does a control that needs a script to do anything.
export function withoutScriptCss() {
  const shown = `[${SHOWN_WITHOUT_SCRIPT_ATTRIBUTE}]`;
  return `html ${shown}{display:block}html button:has(+${shown}){display:none}html [${HIDDEN_WITHOUT_SCRIPT_ATTRIBUTE}]{display:none}`;
}

// Runs as the parser passes the variants: keeps the one for this window and theme as the root,
// removes the rest, and flags Expo's launcher to hydrate. Then it loads the page entry once the
// page has painted, as the drawing screen's boot script does.
export function pageBootScript(layouts = INFORMATION_LAYOUTS) {
  return [
    '(function(){var painted=false;try{',
    `var k=location.hash.match(${variantFragmentPattern(layouts.viewports)});`,
    "if(k)history.replaceState(history.state,'',location.pathname+location.search+location.hash.slice(0,-k[0].length));",
    'var w=innerWidth,h=innerHeight;',
    `var c=${layouts.classScript};`,
    `var t=document.documentElement.getAttribute(${JSON.stringify(BOOT_THEME_ATTRIBUTE)});`,
    "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';",
    `var v=document.querySelectorAll('[${PAGE_VARIANT_ATTRIBUTE}]'),f=null,i;`,
    `for(i=0;i<v.length;i++)if(v[i].getAttribute(${JSON.stringify(PAGE_VARIANT_ATTRIBUTE)})===c+'-'+t)f=v[i];`,
    'if(f){',
    'for(i=0;i<v.length;i++)if(v[i]!==f)v[i].remove();',
    "f.id='root';",
    `var s=${JSON.stringify(VARIANT_FRAGMENT_SEPARATOR)}+c+'-'+t,n=s.length,e=f.querySelectorAll('[id$="'+s+'"]');`,
    'for(i=0;i<e.length;i++)e[i].id=e[i].id.slice(0,-n);',
    `e=f.querySelectorAll('a[href$="'+s+'"]');`,
    "for(i=0;i<e.length;i++)e[i].setAttribute('href',e[i].getAttribute('href').slice(0,-n));",
    hydrationFlagScriptContents(),
    "painted=document.visibilityState==='visible';",
    '}}catch(e){}',
    ...startupScriptsAfterPaint(),
    '})();',
  ].join('');
}

export function renderPageVariants(prerenderPage, page, layouts = INFORMATION_LAYOUTS) {
  const variants = Object.entries(layouts.viewports).flatMap(([layout, viewport]) =>
    FIRST_FRAME_THEMES.map((appearance) => ({
      key: `${layout}-${appearance}`,
      viewport,
      html: prerenderPage({ page, viewport, appearance }).html,
    }))
  );
  const { sheet } = prerenderPage({
    page,
    viewport: Object.values(layouts.viewports)[0],
    appearance: 'light',
  });
  return { variants, sheet };
}

// The page document, from the export's own document (its head, install tags and boot theme):
// its markup in place of the empty root, every style sheet inline, and the page entry's scripts
// held in the list the boot script loads instead of the drawing screen's.
export function pageDocumentHtml(
  template,
  {
    page,
    title,
    fontFaceRules,
    variants,
    sheet,
    scripts,
    layouts = INFORMATION_LAYOUTS,
    documentCss = '',
  },
  readExportFile
) {
  for (const [pattern, part] of [
    [HTML_ELEMENT, '<html>'],
    [TITLE, '<title>'],
    [EXPO_NOSCRIPT, "Expo's <noscript>"],
  ])
    if (!pattern.test(template)) throw new Error(`The export's document has no ${part}.`);
  if (!template.includes(EMPTY_ROOT)) throw new Error("The export's document has no empty root.");
  if (template.search(EXPO_STYLESHEET) < 0)
    throw new Error("The export's document links no style sheet to inline.");
  const markup = variants.map(({ html }) => html).join('');
  const style = `<style id="${sheet.id}">${criticalSheetText(sheet.textContent, markup)}</style>`;
  const pageStyle = `<style>${fontFaceRules}${pageVariantCss(layouts)}${documentCss}</style>\n<noscript><style>${withoutScriptCss()}</style></noscript>`;
  const body = variants.map(
    ({ key, viewport, html }) =>
      `<div ${PAGE_VARIANT_ATTRIBUTE}="${key}" ${FIRST_FRAME_VIEWPORT_ATTRIBUTE}="${formatFirstFrameViewport(viewport)}">${withVariantFragments(html, key)}</div>`
  );
  return template
    .replace(HTML_ELEMENT, (element) =>
      element.replace('<html', `<html ${APP_DOCUMENT_ATTRIBUTE}="${page}"`)
    )
    .replace(TITLE, `<title>${title}</title>`)
    .replace(
      EXPO_STYLESHEET,
      (_, href) => `<style>${readExportFile(href).toString('utf8')}</style>`
    )
    .replace('</head>', `${style}\n${pageStyle}\n</head>`)
    .replace(EXPO_SCRIPT, '')
    .replace(EXPO_NOSCRIPT, '')
    .replace(
      EMPTY_ROOT,
      [
        ...body,
        `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify(scripts)}</script>`,
        `<script>${pageBootScript(layouts)}</script>`,
      ].join('\n')
    );
}

// The page entry for the browser, chunked as `expo export` chunks the drawing screen's (granular,
// tree-shaken, content-hashed names under _expo/static), through the request ADR-0180's render
// uses. Metro's out-of-band build does not hand a request's serializer options to Expo's
// serializer, so they are passed to it for this one build.
async function bundlePageEntry(entryFile) {
  const { server, bundleRequest } = await expoBundleRequestFactory()(NATIVE_APP_DIR, {
    entryFile,
    platform: 'web',
    dev: false,
    minify: true,
    resetCache: false,
  });
  const serializer = server._config.serializer;
  const exportSerializer = serializer.customSerializer;
  let serialized;
  serializer.customSerializer = async (entryPoint, preModules, graph, options) => {
    serialized = await exportSerializer(entryPoint, preModules, graph, {
      ...options,
      serializerOptions: {
        output: 'static',
        splitChunks: true,
        chunkingStrategy: 'granular',
        exporting: true,
        usedExports: true,
        includeSourceMaps: false,
      },
    });
    return '';
  };
  try {
    await server.build({
      ...bundleRequest,
      customResolverOptions: {
        ...bundleRequest.customResolverOptions,
        ...PAGE_DOCUMENT_RESOLUTION,
      },
    });
  } finally {
    serializer.customSerializer = exportSerializer;
    await server.end();
  }
  if (!serialized?.artifacts) throw new Error('The page entry bundle produced no chunks.');
  return serialized.artifacts.filter(({ type }) => type === 'js');
}

// The scripts a page document loads, in order: each synchronous chunk after the chunks it requires.
export function pageEntryScripts(chunks) {
  const ordered = [];
  const visit = (filename) => {
    if (ordered.includes(filename)) return;
    const chunk = chunks.find((candidate) => candidate.filename === filename);
    if (!chunk) throw new Error(`The page entry requires a chunk it did not write: ${filename}`);
    for (const required of chunk.metadata.requires) visit(required);
    ordered.push(filename);
  };
  for (const chunk of chunks) if (!chunk.metadata.isAsync) visit(chunk.filename);
  return ordered.map((filename) => `/${filename}`);
}

const CHUNK_PATH = /\/?(_expo\/static\/js\/web\/[\w.-]+\.js)/g;

// Every chunk the given scripts load, now or on demand: each chunk names the chunks it imports.
export function reachableChunks(scripts, readExportFile) {
  const reached = new Set();
  const queue = scripts.map((src) => src.replace(/^\//, ''));
  while (queue.length) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    reached.add(file);
    for (const match of readExportFile(file).toString('utf8').matchAll(CHUNK_PATH))
      queue.push(match[1]);
  }
  return reached;
}

// The chunks only a page document can load. The worker answers a page document's path from the
// network, and offline from the app shell, so none of them is ever fetched from its precache.
export function pageOnlyChunks(exportDir, shellFile) {
  const readExportFile = (file) => readFileSync(join(exportDir, file));
  const drawing = reachableChunks(
    startupScriptList(readExportFile(shellFile).toString('utf8')),
    readExportFile
  );
  const pages = reachableChunks(
    documentPages().flatMap(({ file }) =>
      existsSync(join(exportDir, file))
        ? startupScriptList(readExportFile(file).toString('utf8'))
        : []
    ),
    readExportFile
  );
  return [...pages].filter((file) => !drawing.has(file)).sort();
}

const ASSET_URL = /["'(](\/assets\/[^"'()\s]+)/g;

// Every asset a page document or its chunks name must be a file the drawing screen's export wrote.
export function missingExportAssets(sources, exportDir) {
  return [
    ...new Set(
      sources.flatMap((source) => [...source.matchAll(ASSET_URL)].map((match) => match[1]))
    ),
  ].filter((url) => !existsSync(join(exportDir, url)));
}

function writeChunks(exportDir, chunks) {
  for (const { filename, source } of chunks) {
    const path = join(exportDir, filename);
    if (existsSync(path) && readFileSync(path, 'utf8') !== source)
      throw new Error(
        `A page entry chunk differs from the export's file of the same name: ${filename}`
      );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
}

// The page entry's own modules that a module graph reaches. The drawing screen's must reach none:
// one there would put page code on its startup path, or in a chunk it loads.
export function pageEntryModules(modulePaths, appDir = NATIVE_APP_DIR) {
  const pageDir = join(appDir, PAGE_DOCUMENT_DIR) + sep;
  return modulePaths
    .filter((path) => path.startsWith(pageDir))
    .map((path) => relative(appDir, path))
    .sort();
}

// Every module the drawing screen's entry reaches, statically or on demand, as `expo export`
// resolves it for the web.
// The entry imports strict.css, whose PostCSS plugin (postcss.config.mjs) parses the app's sources
// with the Babel config it finds from the working directory, as `expo export` runs it.
async function drawingEntryModules() {
  const cwd = process.cwd();
  process.chdir(NATIVE_APP_DIR);
  try {
    return await resolveDrawingEntryModules();
  } finally {
    process.chdir(cwd);
  }
}

async function resolveDrawingEntryModules() {
  const { server, bundleRequest } = await expoBundleRequestFactory()(NATIVE_APP_DIR, {
    entryFile: DRAWING_ENTRY,
    platform: 'web',
    dev: false,
    minify: false,
    resetCache: false,
  });
  try {
    const { entryFile, resolverOptions, transformOptions } =
      require('@expo/metro/metro/lib/splitBundleOptions').default(bundleRequest);
    const graph = await server._bundler.getDependencies(
      [entryFile],
      transformOptions,
      resolverOptions,
      { shallow: false, lazy: false }
    );
    return [...graph.keys()];
  } finally {
    await server.end();
  }
}

export async function checkDrawingEntryBoundary() {
  const reached = pageEntryModules(await drawingEntryModules());
  if (reached.length)
    throw new Error(
      `The drawing screen's entry reaches the page entry's modules: ${reached.join(', ')}. Page documents load them; the drawing screen imports what they share from outside ${PAGE_DOCUMENT_DIR}.`
    );
}

// The CSS React Strict DOM compiles from an entry's own style sources, which strict.css leaves out.
// Its PostCSS plugin reads the app's Babel config from the working directory, as `expo export`
// runs it.
export async function documentStyleSheet(styleSources) {
  if (styleSources === null) return '';
  const { default: postcss } = await import('postcss');
  const { default: reactStrictPlugin } = await import('react-strict-dom/postcss-plugin');
  const cwd = process.cwd();
  process.chdir(NATIVE_APP_DIR);
  try {
    const { css } = await postcss([
      reactStrictPlugin({ cwd: NATIVE_APP_DIR, include: [styleSources] }),
    ]).process('@react-strict-dom;', { from: undefined });
    return css;
  } finally {
    process.chdir(cwd);
  }
}

async function prerenderEntryPages(exportDir, template, entry, pages) {
  const render = evaluateRenderer(await bundleForNode(entry.render, PAGE_DOCUMENT_RESOLUTION));
  await render.pageIconsSettled();
  const chunks = await bundlePageEntry(entry.app);
  writeChunks(exportDir, chunks);
  const scripts = pageEntryScripts(chunks);
  const documentCss = await documentStyleSheet(entry.styleSources);
  const readExportFile = (href) => readFileSync(join(exportDir, href));
  return pages.map(({ page, file }) => {
    const html = pageDocumentHtml(
      template,
      {
        page,
        ...render.pageDocumentHead(page),
        ...renderPageVariants(render.prerenderPage, page, entry.layouts),
        scripts,
        layouts: entry.layouts,
        documentCss,
      },
      readExportFile
    );
    const missing = missingExportAssets([html, ...chunks.map(({ source }) => source)], exportDir);
    if (missing.length)
      throw new Error(`${file} names assets the export did not write: ${missing.join(', ')}`);
    writeFileSync(join(exportDir, file), html);
    return { page, file, scripts };
  });
}

export async function prerenderNativeWebPages(exportDir, template) {
  const pages = documentPages();
  if (pages.length === 0) return [];
  await checkDrawingEntryBoundary();
  await lendXmlParser();
  const written = [];
  for (const [name, entry] of Object.entries(DOCUMENT_ENTRIES)) {
    const entryPages = pages.filter(({ page }) => documentEntry(page) === name);
    if (entryPages.length)
      written.push(...(await prerenderEntryPages(exportDir, template, entry, entryPages)));
  }
  return written;
}
