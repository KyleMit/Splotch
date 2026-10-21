// Holds the React Native web export's startup path to two byte budgets, the way
// tools/check-bundle-budgets.mjs holds the shipping app's to one, and allows no image inlined into
// any of it. The first paint is the shell's executable inline scripts and inline CSS plus every
// script, stylesheet and script or style preload the document names. The core controls are every
// script and stylesheet the drawing controls wait for, including the bundle a prerendered shell's
// boot script loads after its first frame paints. Each URL counts once.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import { APP_SHELL_FILE, NATIVE_WEB_EXPORT_DIR } from './build-native-web.mjs';
import { startupScriptList } from './prerender-native-web.mjs';
import { documentPages } from './prerender-native-web-pages.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

// An empty app (registerRootComponent of one View) exported by this Expo and React Native Web
// pair loads this much JavaScript, which the shipping Svelte app never pays: React DOM, React
// Native Web's core and Expo's runtime. Measured 2026-10-13 on Expo 57 and React Native Web 0.21.
export const REACT_NATIVE_WEB_FLOOR_BYTES = 323_984;
// The shipping budget on top of that floor: the startup cost the RN web export would match if
// its app code were as lean as the shipping app's.
export const NATIVE_WEB_STARTUP_TARGET_BYTES =
  MAX_STARTUP_JS_CSS_BYTES + REACT_NATIVE_WEB_FLOOR_BYTES;
// The 2026-10-14 review measured 858,902 bytes, after the bundled Farm images became hashed
// assets, each page's line art and every on-request sheet moved into lazy chunks, Reanimated left
// the web bundle, the app's Animated stopped importing React Native Web's animated list components,
// feedback, AI generation and recovery, and the offline library began loading after the drawing
// screen paints, the startup icon set shrank to the icons the screen mounts with,
// react-native-svg left the web bundle (platform/svg.web.ts), the release notes moved to Settings'
// chunk (settings/whatsNewStamp.ts), Expo's native-module runtime left the web bundle
// (platform/webAsset.ts, platform/registerRoot.web.ts), and the React Strict DOM imports its web
// preset compiles away stopped loading RSD's element library (babel.config.cjs). Expo SDK 58's
// React 19.3 then took it to 900,361 bytes. The fifth cut reviewed it at 838,334, 10,650 under
// NATIVE_WEB_STARTUP_TARGET_BYTES: granular chunking (app.json) gives the modules lazy chunks share
// their own chunks instead of Expo's __common chunk, which index.html loaded before first paint,
// and Expo's tree shaking (NATIVE_WEB_EXPORT_ENV in build-native-web.mjs) drops unused exports.
// That one startup cap kept 11,896 bytes of headroom, at 850,230. The owner raised it once, to
// 912,257 for the Expo SDK 58 upgrade (that upgrade's reviewed 900,361 plus the same headroom), and
// the fifth cut took it back down. ADR-0180 split it in two once the prerendered shell held the
// bundle until its first frame had painted, so one sum no longer added two different waits.
//
// This cap carries the bundle's ratchet. The core controls measured 815,639 bytes (ADR-0180), and
// it keeps the same 11,896 bytes of headroom. That stays below every move up to react-native-svg
// (the smallest, the offline library controller, is 24,471 bytes) and below both fifth-cut levers
// (the smaller, tree shaking, is 25,097 bytes on top of granular chunking), so undoing one fails
// here; the fourth cut's three moves, two of them smaller than the headroom, each fail their own
// check instead (the precache check's release-note samples, native-web-expo-runtime.test.mjs,
// native-web-strict-dom-imports.test.mjs). Consuming the headroom is the cue to take the next
// lever, not to raise the number.
export const MAX_NATIVE_WEB_CORE_CONTROLS_BYTES = 827_535;
// The first paint measured 45,552 bytes (ADR-0180). The single cap's headroom would be a quarter of
// this one, so it keeps 1,500 bytes instead: less than the smallest first-paint lever ADR-0180 took,
// the 1,649-byte boot script that holds the bundle, so undoing one fails here. A document that
// loads the bundle itself again fails by the whole bundle.
export const MAX_NATIVE_WEB_FIRST_PAINT_BYTES = 47_052;
// Each page document's budgets, by route-table page (prerender-native-web-pages.mjs). Its first
// paint is its executable inline scripts and inline CSS, since it names no file before it paints;
// its page entry is the bundle its boot script loads after that paint. The owner set each from
// the page's first measured build plus 10%, rounded up (issue 3007, 2026-10-20); ratcheting
// them down is later work.
// * privacy: first paint 33,026 measured (1,295 boot JS; 31,731 CSS, 26,866 of it strict.css);
//   page entry 754,181 measured (Expo's runtime and the entry chunk). A document that names its
//   page bundle again fails by the whole bundle.
// * changelog, beta and notFound (the host's 404.html), first measured 2026-10-21: first paint
//   33,574, 34,948 (its head's platform stamp and panel filter included) and 33,497; the page
//   entry every page document shares, 781,172 by then.
export const MAX_NATIVE_WEB_PAGE_BYTES = {
  privacy: { firstPaint: 36_329, pageEntry: 829_600 },
  changelog: { firstPaint: 36_932, pageEntry: 859_290 },
  beta: { firstPaint: 38_443, pageEntry: 859_290 },
  notFound: { firstPaint: 36_847, pageEntry: 859_290 },
};
// A base64 run this long is image bytes, not a data-URI prefix the code assembles at runtime.
const MIN_INLINED_IMAGE_CHARS = 256;
const INLINED_IMAGE = new RegExp(
  `data:image/[a-z+.-]+;base64,[A-Za-z0-9+/]{${MIN_INLINED_IMAGE_CHARS},}`,
  'g'
);
// The images the startup path may inline, each with its decision. Each is allowed once, in the
// shell's inline CSS only: never in a script, and never twice. Every other inlined image fails.
export const INLINED_IMAGE_EXCEPTIONS = [
  {
    asset: 'experiments/native-architecture/assets/paper/handmade-paper.webp',
    reason:
      "The paper texture, the prerendered first frame's largest paint, carried once by the shell's CSS so it paints without a request (ADR-0180).",
  },
];
const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const LINK_ELEMENT = /<link\b([^>]*)>/gi;
const INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
// Script types a browser runs; any other type (application/json, importmap data, a template) is
// inert data.
const EXECUTABLE_SCRIPT_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);
// Link relations that fetch a script or stylesheet before first paint.
const STARTUP_LINK_RELATIONS = new Set(['stylesheet', 'modulepreload']);
const STARTUP_PRELOAD_DESTINATIONS = new Set(['script', 'style']);
const SHELL_ORIGIN = 'https://app-shell.invalid';

function attributesOf(source) {
  return Object.fromEntries(
    [...source.matchAll(ATTRIBUTE)].map(([, name, double, single, bare]) => [
      name.toLowerCase(),
      double ?? single ?? bare ?? '',
    ])
  );
}

// One export path per URL, whatever query or fragment names it, so a file preloaded and then
// loaded counts once; a remote URL is refused because its bytes are not in the export.
function exportPath(href) {
  const url = new URL(href, `${SHELL_ORIGIN}/`);
  if (url.origin !== SHELL_ORIGIN)
    throw new Error(`The app shell loads a remote resource: ${href}`);
  return decodeURIComponent(url.pathname.slice(1));
}

function isStartupLink({ rel = '', as = '', href }) {
  if (!href) return false;
  const relations = rel.toLowerCase().split(/\s+/);
  return (
    relations.some((relation) => STARTUP_LINK_RELATIONS.has(relation)) ||
    (relations.includes('preload') && STARTUP_PRELOAD_DESTINATIONS.has(as.toLowerCase()))
  );
}

export function startupResources(indexHtml) {
  const scripts = [...indexHtml.matchAll(SCRIPT_ELEMENT)].map(([, attributes, body]) => ({
    ...attributesOf(attributes),
    body,
  }));
  const executable = scripts.filter(({ type = '' }) =>
    EXECUTABLE_SCRIPT_TYPES.has(type.trim().toLowerCase())
  );
  const inlineScripts = executable
    .filter((script) => script.src === undefined)
    .map(({ body }) => body);
  const links = [...indexHtml.matchAll(LINK_ELEMENT)].map(([, attributes]) =>
    attributesOf(attributes)
  );
  const scriptSources = executable.filter((script) => script.src).map((script) => script.src);
  const linked = links.filter(isStartupLink).map((link) => link.href);
  return {
    files: [
      ...new Set([...scriptSources, ...startupScriptList(indexHtml), ...linked].map(exportPath)),
    ],
    paintFiles: [...new Set([...scriptSources, ...linked].map(exportPath))],
    inlineScripts,
    inlineScriptBytes: inlineScripts.reduce((total, body) => total + Buffer.byteLength(body), 0),
    inlineStyles: [...indexHtml.matchAll(INLINE_STYLE)].map((match) => match[1]),
    inlineStyleBytes: [...indexHtml.matchAll(INLINE_STYLE)].reduce(
      (total, match) => total + Buffer.byteLength(match[1]),
      0
    ),
  };
}

export function exceptedImagePayloads(exceptions = INLINED_IMAGE_EXCEPTIONS, root = ROOT) {
  return exceptions.map(({ asset }) =>
    readFileSync(join(root, asset)).toString('base64').replace(/=+$/, '')
  );
}

// Inlined images in `sources`, less one copy of each excepted payload across all of them.
export function inlinedImageCount(sources, excepted = []) {
  const payloads = [sources]
    .flat()
    .flatMap((source) => [...source.matchAll(INLINED_IMAGE)])
    .map(([run]) => run.slice(run.indexOf(',') + 1));
  const allowance = new Map(excepted.map((payload) => [payload, 1]));
  return payloads.filter((payload) => {
    const left = allowance.get(payload) ?? 0;
    if (left === 0) return true;
    allowance.set(payload, left - 1);
    return false;
  }).length;
}

export function nativeWebStartupProblems({
  firstPaintBytes,
  coreControlsBytes,
  inlinedImages,
  maxFirstPaintBytes = MAX_NATIVE_WEB_FIRST_PAINT_BYTES,
  maxCoreControlsBytes = MAX_NATIVE_WEB_CORE_CONTROLS_BYTES,
}) {
  const problems = [];
  if (firstPaintBytes > maxFirstPaintBytes)
    problems.push(
      `First-paint JS/CSS is ${firstPaintBytes} bytes, above the ${maxFirstPaintBytes}-byte budget: something heavy now loads before the first frame paints. Keep the bundle held until first paint (prerender-native-web.mjs) and inline only what the frame paints with, instead of raising MAX_NATIVE_WEB_FIRST_PAINT_BYTES`
    );
  if (coreControlsBytes > maxCoreControlsBytes)
    problems.push(
      `Core-controls JS/CSS is ${coreControlsBytes} bytes, above the ${maxCoreControlsBytes}-byte budget: something heavy now loads before the drawing controls are live. Load it on first use with a dynamic import (drawingSheets.web.ts, bundledOutlines.web.ts, productChunk.web.ts), and keep app.json's granular chunking and build-native-web.mjs's tree shaking on, instead of raising MAX_NATIVE_WEB_CORE_CONTROLS_BYTES`
    );
  for (const { file, count } of inlinedImages)
    problems.push(
      `${file} inlines ${count} images as data URIs; import them as asset files so they stay off the startup path (bundledFarm/images.web.ts)`
    );
  return problems;
}

export function measureNativeWebStartup(exportDir = NATIVE_WEB_EXPORT_DIR, file = APP_SHELL_FILE) {
  const indexPath = join(exportDir, file);
  const name = file === APP_SHELL_FILE ? 'app shell' : file;
  if (!existsSync(indexPath)) throw new Error(`The export has no ${name}: ${indexPath}`);
  const { files, paintFiles, inlineScripts, inlineStyles, inlineScriptBytes, inlineStyleBytes } =
    startupResources(readFileSync(indexPath, 'utf8'));
  if (!files.some((file) => file.endsWith('.js')) && inlineScripts.length === 0)
    throw new Error(`${indexPath} loads no script`);
  for (const loaded of files)
    if (!existsSync(join(exportDir, loaded)))
      throw new Error(`The ${name} loads a missing file: ${loaded}`);
  const inlineImageCount = inlinedImageCount(inlineScripts);
  const inlineStyleImageCount = inlinedImageCount(inlineStyles, exceptedImagePayloads());
  const sizeOf = (list) =>
    list.reduce((total, file) => total + statSync(join(exportDir, file)).size, 0);
  const inlineBytes = inlineScriptBytes + inlineStyleBytes;
  return {
    files,
    paintFiles,
    inlineScriptBytes,
    inlineStyleBytes,
    firstPaintBytes: inlineBytes + sizeOf(paintFiles),
    coreControlsBytes: sizeOf(files),
    startupBytes: inlineBytes + sizeOf(files),
    inlinedImages: [
      ...files.map((loaded) => ({
        file: loaded,
        count: inlinedImageCount(readFileSync(join(exportDir, loaded), 'utf8')),
      })),
      { file: `${file} inline scripts`, count: inlineImageCount },
      { file: `${file} inline styles`, count: inlineStyleImageCount },
    ].filter(({ count }) => count > 0),
  };
}

export function checkNativeWebStartup({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  maxFirstPaintBytes = MAX_NATIVE_WEB_FIRST_PAINT_BYTES,
  maxCoreControlsBytes = MAX_NATIVE_WEB_CORE_CONTROLS_BYTES,
  log = console.log,
} = {}) {
  const measurement = measureNativeWebStartup(exportDir);
  const problems = nativeWebStartupProblems({
    ...measurement,
    maxFirstPaintBytes,
    maxCoreControlsBytes,
  });
  if (problems.length) throw new Error(problems.join('\n'));
  const { firstPaintBytes, coreControlsBytes, startupBytes, files, paintFiles } = measurement;
  log(
    `[native-web-startup] first paint ${firstPaintBytes}/${maxFirstPaintBytes} bytes (${measurement.inlineScriptBytes} inline JS and ${measurement.inlineStyleBytes} inline CSS bytes plus ${paintFiles.length} files); core controls ${coreControlsBytes}/${maxCoreControlsBytes} bytes (${files.length} files); startup path ${startupBytes} bytes (React Native Web floor ${REACT_NATIVE_WEB_FLOOR_BYTES}, floor plus shipping budget ${NATIVE_WEB_STARTUP_TARGET_BYTES}); no inlined images`
  );
}

export function nativeWebPageDocumentProblems({ file, measurement, budget }) {
  const problems = [];
  if (measurement.firstPaintBytes > budget.firstPaint)
    problems.push(
      `${file}'s first-paint JS/CSS is ${measurement.firstPaintBytes} bytes, above its ${budget.firstPaint}-byte budget: a page document paints from its inline markup and CSS alone and loads its page entry after it paints (prerender-native-web-pages.mjs), instead of raising MAX_NATIVE_WEB_PAGE_BYTES`
    );
  if (measurement.coreControlsBytes > budget.pageEntry)
    problems.push(
      `${file}'s page entry is ${measurement.coreControlsBytes} bytes, above its ${budget.pageEntry}-byte budget: load what the page shows only on request with a dynamic import, instead of raising MAX_NATIVE_WEB_PAGE_BYTES`
    );
  for (const { file: source, count } of measurement.inlinedImages)
    problems.push(`${source} inlines ${count} images as data URIs`);
  return problems;
}

// Holds every page document the route table names to its own budgets, and the table to exactly
// those pages.
export function checkNativeWebPageDocuments({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  pages = documentPages(),
  budgets = MAX_NATIVE_WEB_PAGE_BYTES,
  log = console.log,
} = {}) {
  const budgeted = Object.keys(budgets).sort();
  const named = pages.map(({ page }) => page).sort();
  if (budgeted.join() !== named.join())
    throw new Error(
      `MAX_NATIVE_WEB_PAGE_BYTES budgets [${budgeted.join(', ')}] but the route table writes page documents for [${named.join(', ')}]`
    );
  const problems = [];
  for (const { page, file } of pages) {
    const measurement = measureNativeWebStartup(exportDir, file);
    const budget = budgets[page];
    const found = nativeWebPageDocumentProblems({ file, measurement, budget });
    problems.push(...found);
    if (found.length === 0)
      log(
        `[native-web-startup] ${file} first paint ${measurement.firstPaintBytes}/${budget.firstPaint} bytes (${measurement.inlineScriptBytes} inline JS and ${measurement.inlineStyleBytes} inline CSS bytes plus ${measurement.paintFiles.length} files); page entry ${measurement.coreControlsBytes}/${budget.pageEntry} bytes after it paints (${measurement.files.length} files)`
      );
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

if (isMain(import.meta.url))
  runMain(async () => {
    checkNativeWebStartup();
    checkNativeWebPageDocuments();
    // A page document's first paint is its whole page: it must read in full before any script.
    const { checkPageDocumentsWithoutJavaScript } =
      await import('./check-native-web-pages-without-js.mjs');
    await checkPageDocumentsWithoutJavaScript();
  });
