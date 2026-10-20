import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { composeCutoverWeb } from '../migration/compose-cutover-web.mjs';
import { subresourceIntegrity } from '../migration/build-native-web.mjs';
import { appShellPrecacheUrl } from '../../web/src/lib/pwa/appShellRoute.ts';

const ENTRY = '_expo/static/js/web/index-1.js';
const MANIFEST = 'site.webmanifest';

let root;
let sveltekitDir;
let nativeDir;
let outputDir;
let logged;

function write(directory, files) {
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), body);
  }
}

// The export's worker in workbox-build's serialized form, pinning each entry to `pinned` bytes.
function nativeWorker(pinned) {
  const entries = Object.entries(pinned).map(
    ([url, body]) =>
      `{url:${JSON.stringify(url)},revision:${url.startsWith('/?') ? 'null' : '"r"'},integrity:${JSON.stringify(subresourceIntegrity(body))}}`
  );
  return `self.addEventListener("message",e=>{});precacheAndRoute([${entries.join(',')}],{})`;
}

function writeNativeExport({ precached = {}, extra = {} } = {}) {
  const shell = '<html><body>react native</body></html>';
  const files = { [ENTRY]: 'draw()', [MANIFEST]: '{"name":"Splotch"}', ...precached };
  write(nativeDir, {
    'index.html': shell,
    '404.html': shell,
    'metadata.json': '{}',
    'version.json': '{"version":"2.0.0"}',
    ...files,
    ...extra,
    'sw.js': nativeWorker({ [appShellPrecacheUrl('abc')]: shell, ...files }),
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cutover-web-'));
  sveltekitDir = join(root, 'sveltekit');
  nativeDir = join(root, 'native');
  outputDir = join(root, 'out');
  logged = [];
  write(sveltekitDir, {
    'index.html': '<html><body>svelte drawing</body></html>',
    'privacy.html': '<html><body>svelte privacy</body></html>',
    'sw.js': 'svelte worker',
    'version.json': '{"version":"1.6.0"}',
    '_app/immutable/chunk.js': 'svelte()',
    [MANIFEST]: '{"name":"Splotch"}',
  });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const compose = () =>
  composeCutoverWeb({ sveltekitDir, nativeDir, outputDir, log: (line) => logged.push(line) });
const composed = (file) => readFileSync(join(outputDir, file), 'utf8');

it('lays the export over the SvelteKit build at the drawing route and keeps its other pages', () => {
  writeNativeExport();
  compose();
  expect(composed('index.html')).toContain('react native');
  expect(composed('sw.js')).toContain('precacheAndRoute');
  expect(composed('version.json')).toBe('{"version":"2.0.0"}');
  expect(composed(ENTRY)).toBe('draw()');
  expect(composed('privacy.html')).toContain('svelte privacy');
  expect(composed('_app/immutable/chunk.js')).toBe('svelte()');
  expect(existsSync(join(outputDir, '404.html'))).toBe(false);
  expect(existsSync(join(outputDir, 'metadata.json'))).toBe(false);
  expect(logged.join('\n')).toContain('left out: 404.html, metadata.json');
});

it('refuses a file both builds write with different bytes, before writing anything', () => {
  writeNativeExport({ precached: { [MANIFEST]: '{"name":"Other"}' } });
  expect(compose).toThrow(`Both builds write different bytes at ${MANIFEST}`);
  expect(existsSync(outputDir)).toBe(false);
});

it('refuses a deploy whose bytes no longer match what the worker pins', () => {
  writeNativeExport();
  writeFileSync(join(nativeDir, ENTRY), 'draw(edited)');
  expect(compose).toThrow(
    `The composed deploy does not serve the bytes the export's worker pins for ${ENTRY}`
  );
});

it('refuses a worker that precaches a file the export did not write', () => {
  writeNativeExport();
  rmSync(join(nativeDir, ENTRY));
  expect(compose).toThrow(`The export's worker precaches files it did not write: ${ENTRY}`);
});
