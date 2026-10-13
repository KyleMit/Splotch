import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import {
  MAX_NATIVE_WEB_STARTUP_BYTES,
  NATIVE_WEB_STARTUP_TARGET_BYTES,
  REACT_NATIVE_WEB_FLOOR_BYTES,
  checkNativeWebStartup,
  inlinedImageCount,
  measureNativeWebStartup,
} from '../migration/check-native-web-startup.mjs';

const RUNTIME = '_expo/static/js/web/__expo-metro-runtime-1.js';
const ENTRY = '_expo/static/js/web/index-1.js';
const LAZY = '_expo/static/js/web/RsdAiSheet-1.js';
const CSS = '_expo/static/css/strict-1.css';
const INLINE_CSS = 'html,body{height:100%}';
const INDEX = [
  `<html><head><style id="expo-reset">${INLINE_CSS}</style>`,
  `<link rel="preload" href="/${CSS}" as="style"><link rel="stylesheet" href="/${CSS}">`,
  '<link rel="manifest" href="/site.webmanifest" /><link rel="icon" href="/favicon.ico" />',
  `</head><body><script src="/${RUNTIME}" defer></script><script src="/${ENTRY}" defer></script></body></html>`,
].join('');
// A real WebP data URI the length of a small selector thumbnail, as an inlined import emits it.
const INLINED_WEBP = `data:image/webp;base64,${Buffer.alloc(1024, 7).toString('base64')}`;
const FILES = {
  'index.html': INDEX,
  [RUNTIME]: 'var r=1;',
  [ENTRY]: 'var png="data:image/png;base64,"+bytes;',
  [LAZY]: 'x'.repeat(5000),
  [CSS]: 'body{margin:0}',
  'site.webmanifest': '{}',
  'favicon.ico': 'icon',
};

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function exportFixture(files = FILES) {
  dir = mkdtempSync(join(tmpdir(), 'native-web-startup-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const shellBytes =
  FILES[RUNTIME].length + FILES[ENTRY].length + FILES[CSS].length + INLINE_CSS.length;

it('counts the scripts, stylesheets and inline CSS the app shell loads, and nothing lazy', () => {
  const measured = measureNativeWebStartup(exportFixture());
  expect(measured.files).toEqual([RUNTIME, ENTRY, CSS]);
  expect(measured.inlineStyleBytes).toBe(INLINE_CSS.length);
  expect(measured.startupBytes).toBe(shellBytes);
  expect(measured.inlinedImages).toEqual([]);
});

it('accepts a startup path inside its budget', () => {
  const lines = [];
  checkNativeWebStartup({
    exportDir: exportFixture(),
    maxStartupBytes: shellBytes,
    log: (line) => lines.push(line),
  });
  expect(lines).toEqual([expect.stringContaining(`startup JS/CSS ${shellBytes}/${shellBytes}`)]);
});

it('rejects a startup path one byte over its budget', () => {
  expect(() =>
    checkNativeWebStartup({
      exportDir: exportFixture(),
      maxStartupBytes: shellBytes - 1,
      log: () => {},
    })
  ).toThrow(`Startup JS/CSS is ${shellBytes} bytes, above the ${shellBytes - 1}-byte budget`);
});

it('rejects an image inlined into a script the shell loads, inside the byte budget', () => {
  const files = { ...FILES, [ENTRY]: `var cover="${INLINED_WEBP}";` };
  expect(() =>
    checkNativeWebStartup({ exportDir: exportFixture(files), maxStartupBytes: 1e9, log: () => {} })
  ).toThrow(`${ENTRY} inlines 1 images as data URIs`);
});

it('tells inlined image bytes from a data-URI prefix the code completes at runtime', () => {
  expect(inlinedImageCount(`a="${INLINED_WEBP}";b="${INLINED_WEBP}";`)).toBe(2);
  expect(inlinedImageCount(FILES[ENTRY])).toBe(0);
  expect(inlinedImageCount('src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s)')).toBe(
    0
  );
});

it('rejects a shell that loads a file the export lacks', () => {
  const { [ENTRY]: _missing, ...files } = FILES;
  expect(() => measureNativeWebStartup(exportFixture(files))).toThrow(
    `The app shell loads a missing file: ${ENTRY}`
  );
});

it('derives its target from the shipping startup budget plus the React Native Web floor', () => {
  expect(NATIVE_WEB_STARTUP_TARGET_BYTES).toBe(
    MAX_STARTUP_JS_CSS_BYTES + REACT_NATIVE_WEB_FLOOR_BYTES
  );
  expect(MAX_NATIVE_WEB_STARTUP_BYTES).toBeGreaterThan(NATIVE_WEB_STARTUP_TARGET_BYTES);
});
