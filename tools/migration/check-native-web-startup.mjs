// Holds the React Native web export's startup path to a byte budget, the way
// tools/check-bundle-budgets.mjs holds the shipping app's: every script and stylesheet the
// app shell loads before first paint, plus its inline CSS, and no image inlined into them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import { APP_SHELL_FILE, NATIVE_WEB_EXPORT_DIR } from './build-native-web.mjs';
import { isMain, runMain } from '../lib/proc.mjs';

// An empty app (registerRootComponent of one View) exported by this Expo and React Native Web
// pair loads this much JavaScript, which the shipping Svelte app never pays: React DOM, React
// Native Web's core and Expo's runtime. Measured 2026-10-13 on Expo 57 and React Native Web 0.21.
export const REACT_NATIVE_WEB_FLOOR_BYTES = 323_984;
// The shipping budget on top of that floor: the startup cost the RN web export would match if
// its app code were as lean as the shipping app's.
export const NATIVE_WEB_STARTUP_TARGET_BYTES =
  MAX_STARTUP_JS_CSS_BYTES + REACT_NATIVE_WEB_FLOOR_BYTES;
// The reviewed 2026-10-13 startup is 1,189,500 bytes, after the bundled Farm images became
// hashed assets, each page's line art and every on-request sheet moved into lazy chunks, and
// Reanimated left the web bundle. That is 340,516 bytes over NATIVE_WEB_STARTUP_TARGET_BYTES: the
// drawing product's owners (AI generation and recovery with its storage, feedback, the offline
// library) still start eagerly, and the clear gesture needs React Native Web's Animated, which
// imports the virtualized list components. The 30,500 bytes of headroom stay below the AI sheet's
// 42 KB lazy chunk, so pulling a sheet back onto the startup path fails; consuming the headroom is
// the cue to move another owner off the startup path, not to raise the number.
export const MAX_NATIVE_WEB_STARTUP_BYTES = 1_220_000;
// A base64 run this long is image bytes, not a data-URI prefix the code assembles at runtime.
const MIN_INLINED_IMAGE_CHARS = 256;
const INLINED_IMAGE = new RegExp(
  `data:image/[a-z+.-]+;base64,[A-Za-z0-9+/]{${MIN_INLINED_IMAGE_CHARS},}`,
  'g'
);
const SHELL_SCRIPT = /<script\b[^>]*\bsrc="\/([^"?#]+)"/g;
const SHELL_STYLESHEET = /<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="\/([^"?#]+)"/g;
const SHELL_INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/g;

export function startupResources(indexHtml) {
  const paths = (pattern) => [...indexHtml.matchAll(pattern)].map((match) => match[1]);
  return {
    files: [...new Set([...paths(SHELL_SCRIPT), ...paths(SHELL_STYLESHEET)])],
    inlineStyleBytes: [...indexHtml.matchAll(SHELL_INLINE_STYLE)].reduce(
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
      `Startup JS/CSS is ${startupBytes} bytes, above the ${maxStartupBytes}-byte budget: something heavy now loads before first paint. Load it on first use with a dynamic import (drawingSheets.web.ts, bundledOutlines.web.ts) instead of raising MAX_NATIVE_WEB_STARTUP_BYTES`
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
  const { files, inlineStyleBytes } = startupResources(readFileSync(indexPath, 'utf8'));
  if (!files.some((file) => file.endsWith('.js'))) throw new Error(`${indexPath} loads no script`);
  for (const file of files)
    if (!existsSync(join(exportDir, file)))
      throw new Error(`The app shell loads a missing file: ${file}`);
  return {
    files,
    inlineStyleBytes,
    startupBytes: files.reduce(
      (total, file) => total + statSync(join(exportDir, file)).size,
      inlineStyleBytes
    ),
    inlinedImages: files
      .map((file) => ({
        file,
        count: inlinedImageCount(readFileSync(join(exportDir, file), 'utf8')),
      }))
      .filter(({ count }) => count > 0),
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
    `[native-web-startup] startup JS/CSS ${measurement.startupBytes}/${maxStartupBytes} bytes (${measurement.files.length} files plus ${measurement.inlineStyleBytes} inline CSS bytes; React Native Web floor ${REACT_NATIVE_WEB_FLOOR_BYTES}, floor plus shipping budget ${NATIVE_WEB_STARTUP_TARGET_BYTES}); no inlined images`
  );
}

if (isMain(import.meta.url)) runMain(async () => checkNativeWebStartup());
