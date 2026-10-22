import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_NATIVE_WEB_CORE_CONTROLS_BYTES,
  MAX_NATIVE_WEB_FIRST_PAINT_BYTES,
  checkNativeWebStartup,
  INLINED_IMAGE_EXCEPTIONS,
  exceptedImagePayloads,
  inlinedImageCount,
  measureNativeWebStartup,
} from '../migration/check-native-web-startup.mjs';
import { STARTUP_SCRIPTS_ELEMENT_ID } from '../migration/prerender-native-web.mjs';

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

const bundleBytes = FILES[RUNTIME].length + FILES[ENTRY].length;
const shellBytes = bundleBytes + FILES[CSS].length + INLINE_CSS.length;
const UNBOUNDED = { maxFirstPaintBytes: 1e9, maxCoreControlsBytes: 1e9 };

// A prerendered shell lists its bundle for the boot script to load after first paint
// (prerender-native-web.mjs).
const HELD_INDEX = INDEX.replace(/<script src="[^"]+" defer><\/script>/g, '').replace(
  '</body>',
  `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify([`/${RUNTIME}`, `/${ENTRY}`])}</script></body>`
);
const heldFixture = () => exportFixture({ ...FILES, 'index.html': HELD_INDEX });
const heldFirstPaintBytes = FILES[CSS].length + INLINE_CSS.length;
const heldCoreControlsBytes = bundleBytes + FILES[CSS].length;

it('counts the scripts, stylesheets and inline CSS the app shell loads, and nothing lazy', () => {
  const measured = measureNativeWebStartup(exportFixture());
  expect(measured.files).toEqual([RUNTIME, ENTRY, CSS]);
  expect(measured.paintFiles).toEqual([RUNTIME, ENTRY, CSS]);
  expect(measured.inlineStyleBytes).toBe(INLINE_CSS.length);
  expect(measured.firstPaintBytes).toBe(shellBytes);
  expect(measured.coreControlsBytes).toBe(shellBytes - INLINE_CSS.length);
  expect(measured.startupBytes).toBe(shellBytes);
  expect(measured.inlinedImages).toEqual([]);
});

it('counts a prerendered shell’s held bundle toward the core controls, not the first paint', () => {
  const measured = measureNativeWebStartup(heldFixture());
  expect(measured.files).toEqual([RUNTIME, ENTRY, CSS]);
  expect(measured.paintFiles).toEqual([CSS]);
  expect(measured.firstPaintBytes).toBe(heldFirstPaintBytes);
  expect(measured.coreControlsBytes).toBe(heldCoreControlsBytes);
  expect(measured.startupBytes).toBe(shellBytes);
});

it('accepts a startup path inside both budgets', () => {
  const lines = [];
  checkNativeWebStartup({
    exportDir: heldFixture(),
    maxFirstPaintBytes: heldFirstPaintBytes,
    maxCoreControlsBytes: heldCoreControlsBytes,
    log: (line) => lines.push(line),
  });
  expect(lines).toEqual([
    expect.stringContaining(
      `first paint ${heldFirstPaintBytes}/${heldFirstPaintBytes} bytes (0 inline JS and ${INLINE_CSS.length} inline CSS bytes plus 1 files); core controls ${heldCoreControlsBytes}/${heldCoreControlsBytes} bytes (3 files); startup path ${shellBytes} bytes`
    ),
  ]);
});

it('rejects a first paint one byte over its budget', () => {
  expect(() =>
    checkNativeWebStartup({
      exportDir: heldFixture(),
      maxFirstPaintBytes: heldFirstPaintBytes - 1,
      maxCoreControlsBytes: heldCoreControlsBytes,
      log: () => {},
    })
  ).toThrow(
    `First-paint JS/CSS is ${heldFirstPaintBytes} bytes, above the ${heldFirstPaintBytes - 1}-byte budget`
  );
});

it('rejects core controls one byte over their budget, though the bundle loads after first paint', () => {
  expect(() =>
    checkNativeWebStartup({
      exportDir: heldFixture(),
      maxFirstPaintBytes: heldFirstPaintBytes,
      maxCoreControlsBytes: heldCoreControlsBytes - 1,
      log: () => {},
    })
  ).toThrow(
    `Core-controls JS/CSS is ${heldCoreControlsBytes} bytes, above the ${heldCoreControlsBytes - 1}-byte budget`
  );
});

it('counts a bundle the document loads itself toward the first paint', () => {
  expect(() =>
    checkNativeWebStartup({
      exportDir: exportFixture(),
      maxFirstPaintBytes: heldFirstPaintBytes,
      maxCoreControlsBytes: heldCoreControlsBytes,
      log: () => {},
    })
  ).toThrow(`First-paint JS/CSS is ${shellBytes} bytes`);
});

it('rejects an image inlined into a script the shell loads, inside the byte budget', () => {
  const files = { ...FILES, [ENTRY]: `var cover="${INLINED_WEBP}";` };
  expect(() =>
    checkNativeWebStartup({ exportDir: exportFixture(files), ...UNBOUNDED, log: () => {} })
  ).toThrow(`${ENTRY} inlines 1 images as data URIs`);
});

it('tells inlined image bytes from a data-URI prefix the code completes at runtime', () => {
  expect(inlinedImageCount(`a="${INLINED_WEBP}";b="${INLINED_WEBP}";`)).toBe(2);
  expect(inlinedImageCount(FILES[ENTRY])).toBe(0);
  expect(inlinedImageCount('src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s)')).toBe(
    0
  );
});

// The paper texture is the one image the shell may inline (ADR-0180): once, in its CSS. These are
// the rule's positive controls: anything else inlined there, a second copy, or the texture in a
// script still fails.
describe('the inlined-image exceptions', () => {
  const [texture] = exceptedImagePayloads();
  const textureUri = `data:image/webp;base64,${texture}`;
  const rule = (uri) => `<style>:root{--paper-texture:url("${uri}")}</style>`;
  const measure = (head, body = '') => measureNativeWebStartup(shellFixture(head, body));

  it('names each exception with its reason', () => {
    expect(INLINED_IMAGE_EXCEPTIONS.map(({ asset }) => asset)).toEqual([
      'assets/paper/handmade-paper.webp',
    ]);
    expect(INLINED_IMAGE_EXCEPTIONS.every(({ reason }) => reason.includes('ADR-0180'))).toBe(true);
  });

  it('allows the paper texture once in the shell’s inline CSS, and counts its bytes', () => {
    const measured = measure(rule(textureUri));
    expect(measured.inlinedImages).toEqual([]);
    expect(measured.inlineStyleBytes).toBe(rule(textureUri).length - '<style></style>'.length);
  });

  it('rejects any other image inlined into the shell’s CSS', () => {
    expect(measure(rule(INLINED_WEBP)).inlinedImages).toEqual([
      { file: 'index.html inline styles', count: 1 },
    ]);
  });

  it('rejects a second copy of the paper texture', () => {
    expect(measure(`${rule(textureUri)}${rule(textureUri)}`).inlinedImages).toEqual([
      { file: 'index.html inline styles', count: 1 },
    ]);
  });

  it('rejects the paper texture in a script', () => {
    expect(measure('', `<script>var t="${textureUri}";</script>`).inlinedImages).toEqual([
      { file: 'index.html inline scripts', count: 1 },
    ]);
  });
});

it('rejects a shell that loads a file the export lacks', () => {
  const { [ENTRY]: _missing, ...files } = FILES;
  expect(() => measureNativeWebStartup(exportFixture(files))).toThrow(
    `The app shell loads a missing file: ${ENTRY}`
  );
});

const HEAVY_BYTES = 1_300_000;
function shellFixture(head, body, files = {}) {
  return exportFixture({
    ...FILES,
    ...files,
    'index.html': `<html><head>${head}</head><body>${body}<script src="/${RUNTIME}" defer></script></body></html>`,
  });
}

it('counts the review fixture: inline JS and a module preload around a tiny external script', () => {
  const HEAVY = '_expo/static/js/web/heavy-1.js';
  const dir = shellFixture(
    `<link rel="modulepreload" href="/${HEAVY}">`,
    `<script>${'x'.repeat(HEAVY_BYTES)}</script>`,
    { [HEAVY]: 'y'.repeat(HEAVY_BYTES) }
  );
  const measured = measureNativeWebStartup(dir);
  expect(measured.inlineScriptBytes).toBe(HEAVY_BYTES);
  expect(measured.files).toEqual([RUNTIME, HEAVY]);
  expect(measured.startupBytes).toBe(2 * HEAVY_BYTES + FILES[RUNTIME].length);
  expect(() => checkNativeWebStartup({ exportDir: dir, log: () => {} })).toThrow(
    `above the ${MAX_NATIVE_WEB_FIRST_PAINT_BYTES}-byte budget`
  );
  expect(() => checkNativeWebStartup({ exportDir: dir, log: () => {} })).toThrow(
    `above the ${MAX_NATIVE_WEB_CORE_CONTROLS_BYTES}-byte budget`
  );
});

it.each([
  ['an executable inline script', '', '<script>var a=1;</script>', 'var a=1;'.length],
  ['an inline module', '', '<script type="module">var b=2;</script>', 'var b=2;'.length],
  ['a module preload', `<link rel="modulepreload" href="/${LAZY}">`, '', FILES[LAZY].length],
  ['a script preload', `<link rel="preload" as="script" href="/${LAZY}">`, '', FILES[LAZY].length],
])('counts %s before first paint', (_, head, body, bytes) => {
  const plain = measureNativeWebStartup(shellFixture('', '')).firstPaintBytes;
  expect(measureNativeWebStartup(shellFixture(head, body)).firstPaintBytes).toBe(plain + bytes);
});

it('counts a URL once however the shell names it, and leaves inert data scripts out', () => {
  const plain = measureNativeWebStartup(shellFixture('', '')).startupBytes;
  const measured = measureNativeWebStartup(
    shellFixture(
      `<link rel="preload" as="script" href="/${RUNTIME}"><link rel="modulepreload" href="${RUNTIME}?v=2">`,
      `<script type="application/json">{"pad":"${'z'.repeat(5000)}"}</script>`
    )
  );
  expect(measured.files).toEqual([RUNTIME]);
  expect(measured.inlineScriptBytes).toBe(0);
  expect(measured.startupBytes).toBe(plain);
});

it('rejects an image inlined into an executable inline script', () => {
  const dir = shellFixture('', `<script>var cover="${INLINED_WEBP}";</script>`);
  expect(() => checkNativeWebStartup({ exportDir: dir, ...UNBOUNDED, log: () => {} })).toThrow(
    'index.html inline scripts inlines 1 images as data URIs'
  );
});

it('refuses a remote script it cannot measure', () => {
  expect(() =>
    measureNativeWebStartup(shellFixture('', '<script src="https://cdn.example/app.js"></script>'))
  ).toThrow('The app shell loads a remote resource: https://cdn.example/app.js');
});
