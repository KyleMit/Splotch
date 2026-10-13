import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  checkNativeWebPrecache,
  starterBookFills,
} from '../migration/check-native-web-precache.mjs';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import { appShellPrecacheUrl } from '../../web/src/lib/pwa/appShellRoute.ts';

const SHELL = appShellPrecacheUrl('fixture-build');
const STARTER = [
  { pageId: 'farm/cat', fill: 'data:image/webp;base64,Q0FU' },
  { pageId: 'farm/cow', fill: 'data:image/webp;base64,Q09X' },
];
const ENTRY = '_expo/static/js/web/index-1.js';
const ASSETS = {
  'index.html': '<html><head></head><body></body></html>',
  [ENTRY]: `var art={cat:"${STARTER[0].fill}",cow:"${STARTER[1].fill}"};`,
  '_expo/static/css/strict-1.css': 'body{}',
  'site.webmanifest': '{}',
  'metadata.json': '{}',
};
const lookup = (callback) =>
  `${callback}:async function(){return caches.match(${JSON.stringify(SHELL)})}`;
const worker = (urls) =>
  `precacheAndRoute([${urls.map((url) => `{url:${JSON.stringify(url)},revision:null}`).join(',')}]);` +
  `plugins:[{${lookup('cachedResponseWillBeUsed')},${lookup('handlerDidError')}}]`;

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function exportFixture({ urls, assets = ASSETS }) {
  dir = mkdtempSync(join(tmpdir(), 'native-web-precache-'));
  for (const [path, body] of Object.entries(assets)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  writeFileSync(join(dir, 'sw.js'), worker(urls));
  return dir;
}

const COMPLETE = [SHELL, ENTRY, '_expo/static/css/strict-1.css', 'site.webmanifest'];
const check = (exportDir, options = {}) =>
  checkNativeWebPrecache({ exportDir, starterFills: STARTER, log: () => {}, ...options });

it('accepts a complete export whose app shell is first', () => {
  expect(() => check(exportFixture({ urls: COMPLETE }))).not.toThrow();
});

it.each([
  ['the shell is not first', [ENTRY, SHELL, ...COMPLETE.slice(2)], /must be the first/],
  ['the shell is missing', COMPLETE.slice(1), /one build-matched app shell/],
  [
    'an exported chunk is not precached',
    COMPLETE.slice(0, 2).concat('site.webmanifest'),
    /strict-1\.css/,
  ],
  [
    'a precached file is not exported',
    [...COMPLETE, 'gone.js'],
    /missing from the export: gone\.js/,
  ],
])('rejects an export where %s', (_, urls, problem) => {
  expect(() => check(exportFixture({ urls }))).toThrow(problem);
});

it('rejects an export whose precached chunks lack a starter page', () => {
  const assets = { ...ASSETS, [ENTRY]: `var art="${STARTER[0].fill}";` };
  expect(() => check(exportFixture({ urls: COMPLETE, assets }))).toThrow(
    /Starter coloring pages missing from precached chunks: farm\/cow/
  );
});

it('rejects a precache above its budget', () => {
  expect(() => check(exportFixture({ urls: COMPLETE }), { maxPrecacheBytes: 10 })).toThrow(
    /above the 10-byte budget/
  );
});

it('reads a bundled fill for every starter page from the native art sources', () => {
  const fills = starterBookFills();
  expect(new Set(fills.map(({ pageId }) => pageId))).toEqual(new Set(FARM_PAGE_IDS));
  expect(fills.every(({ fill }) => fill.startsWith('data:image/webp;base64,'))).toBe(true);
});

it('runs after the native web export with type stripping', () => {
  const { scripts } = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  );
  expect(scripts['postnative:web:build']).toMatch(
    /^node --experimental-strip-types .*tools\/migration\/check-native-web-precache\.mjs$/
  );
});
