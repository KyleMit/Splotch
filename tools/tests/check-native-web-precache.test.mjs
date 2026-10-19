import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  checkNativeWebPrecache,
  lazyIconSamples,
  lazyModuleSamples,
  releaseNoteSamples,
  shellAssetReferences,
  starterBookImages,
  starterOutlineSamples,
} from '../migration/check-native-web-precache.mjs';
import { STARTUP_SCRIPTS_ELEMENT_ID } from '../migration/prerender-native-web.mjs';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import { NATIVE_DEFERRED_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../experiments/native-architecture/src/rsdDrawing/splotchy.generated.ts';
import { appShellPrecacheUrl } from '../../web/src/lib/pwa/appShellRoute.ts';
import {
  contentAddressedShell,
  subresourceIntegrity,
  webVersionHeadTag,
} from '../migration/build-native-web.mjs';
import { VERSION_JSON_FILENAME } from '../../web/src/lib/pwa/versionEndpoint.ts';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const RELEASE_NOTES_BY_VERSION = JSON.parse(
  readFileSync(
    new URL(
      '../../experiments/native-architecture/src/information/releaseNotes.generated.json',
      import.meta.url
    ),
    'utf8'
  )
);
const OUTLINES = [
  { pageId: 'farm/cat', sample: 'M1 2C3 4 5 6 7 8CAT' },
  { pageId: 'farm/cow', sample: 'M1 2C3 4 5 6 7 8COW' },
];
const IMAGE_BYTES = { 'farm/cat': 'cat webp bytes', 'farm/cow': 'cow webp bytes' };
const IMAGES = Object.entries(IMAGE_BYTES).map(([pageId, bytes]) => ({
  pageId,
  sha256: sha256(bytes),
}));
const ENTRY = '_expo/static/js/web/index-1.js';
const CAT = '_expo/static/js/web/cat-1.js';
const COW = '_expo/static/js/web/cow-1.js';
const CAT_IMAGE = 'assets/__web/static/coloring/farm/cat-wide.selector.1.webp';
const COW_IMAGE = 'assets/__web/static/coloring/farm/cow-wide.selector.1.webp';
const CSS = '_expo/static/css/strict-1.css';
const BUILT_VERSION = '1.6.1234';
const INDEX = `<html><head>${webVersionHeadTag(BUILT_VERSION)}<link rel="stylesheet" href="/${CSS}"></head><body><script src="/${ENTRY}" defer></script></body></html>`;
const ASSETS = {
  'index.html': INDEX,
  [ENTRY]: 'var app={};',
  [CAT]: `var d="${OUTLINES[0].sample}";`,
  [COW]: `var d="${OUTLINES[1].sample}";`,
  [CAT_IMAGE]: IMAGE_BYTES['farm/cat'],
  [COW_IMAGE]: IMAGE_BYTES['farm/cow'],
  [CSS]: 'body{}',
  'site.webmanifest': '{}',
  'metadata.json': '{}',
  [VERSION_JSON_FILENAME]: JSON.stringify({ version: BUILT_VERSION }),
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

const COMPLETE = [SHELL.url, ENTRY, CAT, COW, CAT_IMAGE, COW_IMAGE, CSS, 'site.webmanifest'];
const check = (exportDir, options = {}) =>
  checkNativeWebPrecache({
    exportDir,
    starterOutlines: OUTLINES,
    starterImages: IMAGES,
    lazySamples: [
      ...lazyIconSamples().map((sample) => ({ module: 'deferred icons', sample })),
      ...OUTLINES.map(({ pageId, sample }) => ({ module: `${pageId} line art`, sample })),
    ],
    log: () => {},
    ...options,
  });

it('accepts a complete export whose pinned app shell is first', () => {
  expect(() => check(exportFixture({ urls: COMPLETE }))).not.toThrow();
});

it('rejects a version endpoint from a different build', () => {
  expect(() =>
    check(
      exportFixture({
        urls: COMPLETE,
        assets: { ...ASSETS, [VERSION_JSON_FILENAME]: JSON.stringify({ version: '1.6.1235' }) },
      })
    )
  ).toThrow(/same web build version/);
});

it('keeps the version endpoint out of the worker cache', () => {
  expect(() => check(exportFixture({ urls: [...COMPLETE, VERSION_JSON_FILENAME] }))).toThrow(
    /must stay out of the precache/
  );
});

it.each([
  ['the shell is not first', [ENTRY, SHELL.url, ...COMPLETE.slice(2)], {}, /must be the first/],
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
    COMPLETE.filter((url) => url !== CSS),
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
  const assets = { ...ASSETS, [COW]: 'var d="";' };
  expect(() => check(exportFixture({ urls: COMPLETE, assets }))).toThrow(
    /Starter coloring pages missing from precached chunks: farm\/cow/
  );
});

it('rejects an export whose precached files lack a starter image', () => {
  const assets = { ...ASSETS, [COW_IMAGE]: 'other bytes' };
  expect(() => check(exportFixture({ urls: COMPLETE, assets }))).toThrow(
    /Starter coloring images missing from the precache: farm\/cow/
  );
});

it('keeps bundled page line art out of the scripts the app shell loads', () => {
  const eager = { ...ASSETS, [ENTRY]: `var d="${OUTLINES[0].sample}";` };
  expect(() => check(exportFixture({ urls: COMPLETE, assets: eager }))).toThrow(
    /1 lazily loaded samples are in the app shell's scripts: farm\/cat line art/
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
    /1 lazily loaded samples are in the app shell's scripts: deferred icons/
  );
});

it('samples every lazily imported icon module', () => {
  const samples = lazyIconSamples();
  expect(samples).toContain(/ d="([^"]+)"/.exec(NATIVE_SPLOTCHY)[1]);
  expect(samples.length).toBeGreaterThan(Object.keys(NATIVE_DEFERRED_ICONS).length / 2);
});

it('samples line art for every starter page and lists it among the lazily loaded modules', () => {
  const outlines = starterOutlineSamples();
  expect(outlines.map(({ pageId }) => pageId)).toEqual([...FARM_PAGE_IDS]);
  expect(new Set(outlines.map(({ sample }) => sample)).size).toBe(FARM_PAGE_IDS.length);
  const lazy = lazyModuleSamples().map(({ sample }) => sample);
  for (const { sample } of outlines) expect(lazy).toContain(sample);
});

it('samples every release note and keeps the notes out of the scripts the app shell loads', () => {
  const samples = releaseNoteSamples();
  for (const [version, sections] of Object.entries(RELEASE_NOTES_BY_VERSION)) {
    const texts = sections.flatMap((section) => section.blocks.map(({ text }) => text));
    expect(
      samples.some((sample) => texts.some((text) => text.includes(sample))),
      version
    ).toBe(true);
  }
  for (const sample of samples) expect(sample.length).toBeGreaterThanOrEqual(24);
  const lazy = lazyModuleSamples().filter(({ module }) => module === 'release notes');
  expect(lazy.map(({ sample }) => sample)).toEqual(samples);
  const eager = { ...ASSETS, [ENTRY]: `${ASSETS[ENTRY]}var t="${samples[0]}";` };
  expect(() =>
    check(exportFixture({ urls: COMPLETE, assets: eager }), { lazySamples: lazy })
  ).toThrow(/1 lazily loaded samples are in the app shell's scripts: release notes/);
});

it('hashes every starter page image and both covers from the shipped files', () => {
  const images = starterBookImages();
  expect(images).toHaveLength(FARM_PAGE_IDS.length * 8 + 2);
  expect(new Set(images.map(({ pageId }) => pageId))).toEqual(
    new Set([...FARM_PAGE_IDS, 'farm cover'])
  );
  expect(new Set(images.map((image) => image.sha256)).size).toBe(images.length);
});

it('runs after the native web export with type stripping', () => {
  const { scripts } = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  );
  expect(scripts['postnative:web:build']).toMatch(
    /^node --experimental-strip-types .*tools\/migration\/check-native-web-precache\.mjs && node --experimental-strip-types .*tools\/migration\/check-native-web-startup\.mjs$/
  );
});

it('references the scripts a prerendered shell loads after its first frame paints', () => {
  const shell = `<link rel="stylesheet" href="/_expo/static/css/strict-1.css"><script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">["/_expo/static/js/web/index-1.js"]</script>`;
  expect(shellAssetReferences(shell)).toEqual([
    '_expo/static/css/strict-1.css',
    '_expo/static/js/web/index-1.js',
  ]);
});
