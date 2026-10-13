import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  checkNativeWebPrecache,
  lazyIconSamples,
  starterBookFills,
} from '../migration/check-native-web-precache.mjs';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import { NATIVE_DEFERRED_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../experiments/native-architecture/src/rsdDrawing/splotchy.generated.ts';
import { appShellPrecacheUrl } from '../../web/src/lib/pwa/appShellRoute.ts';
import { contentAddressedShell, subresourceIntegrity } from '../migration/build-native-web.mjs';

const STARTER = [
  { pageId: 'farm/cat', fill: 'data:image/webp;base64,Q0FU' },
  { pageId: 'farm/cow', fill: 'data:image/webp;base64,Q09X' },
];
const ENTRY = '_expo/static/js/web/index-1.js';
const CSS = '_expo/static/css/strict-1.css';
const INDEX = `<html><head><link rel="stylesheet" href="/${CSS}"></head><body><script src="/${ENTRY}" defer></script></body></html>`;
const ASSETS = {
  'index.html': INDEX,
  [ENTRY]: `var art={cat:"${STARTER[0].fill}",cow:"${STARTER[1].fill}"};`,
  [CSS]: 'body{}',
  'site.webmanifest': '{}',
  'metadata.json': '{}',
};
const SHELL = contentAddressedShell(INDEX);
const lookup = (callback, url) =>
  `${callback}:async function(){return caches.match(${JSON.stringify(url)})}`;

// The worker as generateSW serializes it: one entry per precached file, pinned to
// the integrity of the bytes the fixture exported unless an entry overrides it.
function worker(urls, assets, { integrity = {}, fallbackUrl = SHELL.url } = {}) {
  const entries = urls.map((url) => {
    const pinned =
      url in integrity
        ? integrity[url]
        : url === SHELL.url
          ? SHELL.integrity
          : url in assets
            ? subresourceIntegrity(assets[url])
            : 'sha384-missing';
    const pin = pinned === null ? '' : `,integrity:${JSON.stringify(pinned)}`;
    return `{url:${JSON.stringify(url)},revision:null${pin}}`;
  });
  return (
    `precacheAndRoute([${entries.join(',')}]);` +
    `plugins:[{${lookup('cachedResponseWillBeUsed', fallbackUrl)},${lookup('handlerDidError', fallbackUrl)}}]`
  );
}

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function exportFixture({ urls, assets = ASSETS, ...options }) {
  dir = mkdtempSync(join(tmpdir(), 'native-web-precache-'));
  for (const [path, body] of Object.entries(assets)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  writeFileSync(join(dir, 'sw.js'), worker(urls, assets, options));
  return dir;
}

const COMPLETE = [SHELL.url, ENTRY, CSS, 'site.webmanifest'];
const check = (exportDir, options = {}) =>
  checkNativeWebPrecache({ exportDir, starterFills: STARTER, log: () => {}, ...options });

it('accepts a complete export whose pinned app shell is first', () => {
  expect(() => check(exportFixture({ urls: COMPLETE }))).not.toThrow();
});

it.each([
  ['the shell is not first', [ENTRY, SHELL.url, CSS, 'site.webmanifest'], {}, /must be the first/],
  ['the shell is missing', COMPLETE.slice(1), {}, /one build-matched app shell/],
  [
    "the shell URL is not the document's content address",
    [appShellPrecacheUrl('random-build'), ...COMPLETE.slice(1)],
    {
      integrity: { [appShellPrecacheUrl('random-build')]: SHELL.integrity },
      fallbackUrl: appShellPrecacheUrl('random-build'),
    },
    /is not the content address/,
  ],
  [
    'the shell carries no integrity',
    COMPLETE,
    { integrity: { [SHELL.url]: null } },
    /not pinned to this export's bytes: \/\?app-shell-build/,
  ],
  [
    'a chunk is pinned to other bytes',
    COMPLETE,
    { integrity: { [ENTRY]: subresourceIntegrity('another build') } },
    /not pinned to this export's bytes: _expo\/static\/js\/web\/index-1\.js/,
  ],
  [
    'the fallback looks up another URL',
    COMPLETE,
    { fallbackUrl: '/index.html' },
    /does not look up/,
  ],
  [
    'an exported chunk is not precached',
    [SHELL.url, ENTRY, 'site.webmanifest'],
    {},
    /strict-1\.css/,
  ],
  [
    'a precached file is not exported',
    [...COMPLETE, 'gone.js'],
    {},
    /missing from the export: gone\.js/,
  ],
])('rejects an export where %s', (_, urls, options, problem) => {
  expect(() => check(exportFixture({ urls, ...options }))).toThrow(problem);
});

it('rejects a shell that names a file outside its precache', () => {
  const index = INDEX.replace(
    '</body>',
    '<script src="/_expo/static/js/web/late-2.js"></script></body>'
  );
  const shell = contentAddressedShell(index);
  const fixture = exportFixture({
    urls: [shell.url, ...COMPLETE.slice(1)],
    assets: { ...ASSETS, 'index.html': index },
    integrity: { [shell.url]: shell.integrity },
    fallbackUrl: shell.url,
  });
  expect(() => check(fixture)).toThrow(/names files outside its precache: .*late-2\.js/);
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

it('keeps lazily loaded icons out of the scripts the app shell loads', () => {
  const [sample] = lazyIconSamples();
  const LAZY = '_expo/static/js/web/icons.deferred-1.js';
  const lazy = { ...ASSETS, [LAZY]: `var d="${sample}";` };
  expect(() => check(exportFixture({ urls: [...COMPLETE, LAZY], assets: lazy }))).not.toThrow();
  const eager = { ...ASSETS, [ENTRY]: `${ASSETS[ENTRY]}var d="${sample}";` };
  expect(() => check(exportFixture({ urls: COMPLETE, assets: eager }))).toThrow(
    /1 lazily loaded icons are in the app shell's scripts/
  );
});

it('samples every lazily imported icon module', () => {
  const samples = lazyIconSamples();
  expect(samples).toContain(/ d="([^"]+)"/.exec(NATIVE_SPLOTCHY)[1]);
  expect(samples.length).toBeGreaterThan(Object.keys(NATIVE_DEFERRED_ICONS).length / 2);
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
