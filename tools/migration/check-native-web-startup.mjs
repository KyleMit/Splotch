// Holds the React Native web export's startup path to a byte budget, the way
// tools/check-bundle-budgets.mjs holds the shipping app's: every script, stylesheet and script or
// style preload the app shell loads before first paint, each URL once, plus its executable inline
// scripts and inline CSS, and no image inlined into any of them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import { APP_SHELL_FILE, NATIVE_WEB_EXPORT_DIR } from './build-native-web.mjs';
import { startupScriptList } from './prerender-native-web.mjs';
import { isMain, runMain } from '../lib/proc.mjs';

// An empty app (registerRootComponent of one View) exported by this Expo and React Native Web
// pair loads this much JavaScript, which the shipping Svelte app never pays: React DOM, React
// Native Web's core and Expo's runtime. Measured 2026-10-13 on Expo 57 and React Native Web 0.21.
export const REACT_NATIVE_WEB_FLOOR_BYTES = 323_984;
// The shipping budget on top of that floor: the startup cost the RN web export would match if
// its app code were as lean as the shipping app's.
export const NATIVE_WEB_STARTUP_TARGET_BYTES =
  MAX_STARTUP_JS_CSS_BYTES + REACT_NATIVE_WEB_FLOOR_BYTES;
// The reviewed 2026-10-14 startup is 858,902 bytes, after the bundled Farm images became hashed
// assets, each page's line art and every on-request sheet moved into lazy chunks, Reanimated left
// the web bundle, the app's Animated stopped importing React Native Web's animated list components,
// feedback, AI generation and recovery, and the offline library began loading after the drawing
// screen paints, the startup icon set shrank to the icons the screen mounts with,
// react-native-svg left the web bundle (platform/svg.web.ts), the release notes moved to Settings'
// chunk (settings/whatsNewStamp.ts), Expo's native-module runtime left the web bundle
// (platform/webAsset.ts, platform/registerRoot.web.ts), and the React Strict DOM imports its web
// preset compiles away stopped loading RSD's element library (babel.config.cjs). That is 9,918
// bytes over NATIVE_WEB_STARTUP_TARGET_BYTES. The 11,896 bytes of headroom stay below every move
// up to react-native-svg (the smallest, the offline library controller, is 24,471 bytes), so
// undoing one fails here; the last three, two of them smaller than the headroom, each fail their
// own check instead (the precache check's release-note samples, native-web-expo-runtime.test.mjs,
// native-web-strict-dom-imports.test.mjs). Consuming the headroom is the cue to take the next
// lever, not to raise the number.
export const MAX_NATIVE_WEB_STARTUP_BYTES = 870_798;
// A base64 run this long is image bytes, not a data-URI prefix the code assembles at runtime.
const MIN_INLINED_IMAGE_CHARS = 256;
const INLINED_IMAGE = new RegExp(
  `data:image/[a-z+.-]+;base64,[A-Za-z0-9+/]{${MIN_INLINED_IMAGE_CHARS},}`,
  'g'
);
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
  return {
    files: [
      ...new Set(
        [
          ...executable.filter((script) => script.src).map((script) => script.src),
          ...startupScriptList(indexHtml),
          ...links.filter(isStartupLink).map((link) => link.href),
        ].map(exportPath)
      ),
    ],
    inlineScripts,
    inlineScriptBytes: inlineScripts.reduce((total, body) => total + Buffer.byteLength(body), 0),
    inlineStyleBytes: [...indexHtml.matchAll(INLINE_STYLE)].reduce(
      (total, match) => total + Buffer.byteLength(match[1]),
      0
    ),
  };
}

export function inlinedImageCount(source) {
  return [...source.matchAll(INLINED_IMAGE)].length;
}

export function nativeWebStartupProblems({
  startupBytes,
  inlinedImages,
  maxStartupBytes = MAX_NATIVE_WEB_STARTUP_BYTES,
}) {
  const problems = [];
  if (startupBytes > maxStartupBytes)
    problems.push(
      `Startup JS/CSS is ${startupBytes} bytes, above the ${maxStartupBytes}-byte budget: something heavy now loads before first paint. Load it on first use with a dynamic import (drawingSheets.web.ts, bundledOutlines.web.ts, productChunk.web.ts), and keep a module out of two lazy chunks, which Expo moves into its startup common chunk, instead of raising MAX_NATIVE_WEB_STARTUP_BYTES`
    );
  for (const { file, count } of inlinedImages)
    problems.push(
      `${file} inlines ${count} images as data URIs; import them as asset files so they stay off the startup path (bundledFarm/images.web.ts)`
    );
  return problems;
}

export function measureNativeWebStartup(exportDir = NATIVE_WEB_EXPORT_DIR) {
  const indexPath = join(exportDir, APP_SHELL_FILE);
  if (!existsSync(indexPath)) throw new Error(`The export has no app shell: ${indexPath}`);
  const { files, inlineScripts, inlineScriptBytes, inlineStyleBytes } = startupResources(
    readFileSync(indexPath, 'utf8')
  );
  if (!files.some((file) => file.endsWith('.js')) && inlineScripts.length === 0)
    throw new Error(`${indexPath} loads no script`);
  for (const file of files)
    if (!existsSync(join(exportDir, file)))
      throw new Error(`The app shell loads a missing file: ${file}`);
  const inlineImageCount = inlineScripts.reduce(
    (total, body) => total + inlinedImageCount(body),
    0
  );
  return {
    files,
    inlineScriptBytes,
    inlineStyleBytes,
    startupBytes: files.reduce(
      (total, file) => total + statSync(join(exportDir, file)).size,
      inlineScriptBytes + inlineStyleBytes
    ),
    inlinedImages: [
      ...files.map((file) => ({
        file,
        count: inlinedImageCount(readFileSync(join(exportDir, file), 'utf8')),
      })),
      { file: `${APP_SHELL_FILE} inline scripts`, count: inlineImageCount },
    ].filter(({ count }) => count > 0),
  };
}

export function checkNativeWebStartup({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  maxStartupBytes = MAX_NATIVE_WEB_STARTUP_BYTES,
  log = console.log,
} = {}) {
  const measurement = measureNativeWebStartup(exportDir);
  const problems = nativeWebStartupProblems({ ...measurement, maxStartupBytes });
  if (problems.length) throw new Error(problems.join('\n'));
  log(
    `[native-web-startup] startup JS/CSS ${measurement.startupBytes}/${maxStartupBytes} bytes (${measurement.files.length} files plus ${measurement.inlineScriptBytes} inline JS and ${measurement.inlineStyleBytes} inline CSS bytes; React Native Web floor ${REACT_NATIVE_WEB_FLOOR_BYTES}, floor plus shipping budget ${NATIVE_WEB_STARTUP_TARGET_BYTES}); no inlined images`
  );
}

if (isMain(import.meta.url)) runMain(async () => checkNativeWebStartup());
