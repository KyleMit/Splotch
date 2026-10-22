import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { generateSW } from 'workbox-build';
import {
  contentAddressedShell,
  nativeWebServiceWorkerConfig,
  subresourceIntegrity,
} from '../migration/build-native-web.mjs';
import {
  precacheEntriesFromSource,
  shellAssetReferences,
} from '../migration/check-native-web-precache.mjs';
import { APP_SHELL_PRECACHE_URL_PATTERN } from '../lib/pwa-precache-source.mjs';
import { appShellPrecacheUrl } from '../../src/lib/pwa/appShellRoute.ts';

// generateSW bundles and minifies the Workbox runtime for each fixture build.
const GENERATE_TIMEOUT_MS = 60_000;

// Four deploys. A' changes only an icon, so its worker reuses everything A cached,
// shell included. A'' also retitles the document but keeps A's chunks, so only its
// shell is fetched. B ships a new document and entry chunk and keeps A's stylesheet.
const SHARED_CSS = '_expo/static/css/strict-shared.css';
const document = (entry, title = 'Splotch') =>
  `<html><head><title>${title}</title><link rel="stylesheet" href="/${SHARED_CSS}"></head><body><script src="/_expo/static/js/web/${entry}" defer></script></body></html>`;
const BUILDS = {
  a: {
    'index.html': document('index-a.js'),
    '_expo/static/js/web/index-a.js': 'draw("a")',
    [SHARED_CSS]: 'body{}',
    'favicon.png': 'icon-1',
  },
  aPrime: {
    'index.html': document('index-a.js'),
    '_expo/static/js/web/index-a.js': 'draw("a")',
    [SHARED_CSS]: 'body{}',
    'favicon.png': 'icon-2',
  },
  aRetitled: {
    'index.html': document('index-a.js', 'Splotch!'),
    '_expo/static/js/web/index-a.js': 'draw("a")',
    [SHARED_CSS]: 'body{}',
    'favicon.png': 'icon-1',
  },
  b: {
    'index.html': document('index-b.js'),
    '_expo/static/js/web/index-b.js': 'draw("b")',
    [SHARED_CSS]: 'body{}',
    'favicon.png': 'icon-2',
  },
};

let root;
const manifests = {};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'native-web-deploy-race-'));
  for (const [name, files] of Object.entries(BUILDS)) {
    const outputDir = join(root, name);
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(outputDir, path)), { recursive: true });
      writeFileSync(join(outputDir, path), body);
    }
    const shell = contentAddressedShell(files['index.html']);
    await generateSW(nativeWebServiceWorkerConfig(outputDir, shell));
    manifests[name] = precacheEntriesFromSource(readFileSync(join(outputDir, 'sw.js'), 'utf8'));
  }
}, GENERATE_TIMEOUT_MS);
afterAll(() => rmSync(root, { recursive: true, force: true }));

// The deployed host: the shell URL answers with the document, as the static host
// serves `/` whatever its query.
const host = (build) => (url) =>
  APP_SHELL_PRECACHE_URL_PATTERN.test(url) ? BUILDS[build]['index.html'] : BUILDS[build][url];

const cacheKey = (entry) =>
  entry.revision ? `${entry.url}?__WB_REVISION__=${entry.revision}` : entry.url;

// Workbox's install, entry by entry: an entry already cached under its key is
// reused; any other is fetched and, when it carries integrity, rejected by the
// browser unless the bytes match. A rejection abandons the install.
function install(manifest, cache, fetchFrom) {
  const next = new Map(cache);
  for (const entry of manifest) {
    if (next.has(cacheKey(entry))) continue;
    const body = fetchFrom(entry.url);
    if (body === undefined) return null;
    if (entry.integrity && subresourceIntegrity(body) !== entry.integrity) return null;
    next.set(cacheKey(entry), body);
  }
  return next;
}

// An offline launch: the navigation fallback answers with the precached shell,
// and every file it names must come from the same worker's precache.
function offlineLaunch(manifest, cache) {
  const shell = manifest.find((entry) => APP_SHELL_PRECACHE_URL_PATTERN.test(entry.url));
  const html = cache.get(cacheKey(shell));
  const byUrl = new Map(manifest.map((entry) => [entry.url, entry]));
  const missing = shellAssetReferences(html).filter(
    (path) => !byUrl.has(path) || !cache.has(cacheKey(byUrl.get(path)))
  );
  return { html, missing };
}

// The scheme this build replaced: a shell URL unique to every build, fetched
// without integrity, beside chunks Workbox trusts by revision alone.
const legacy = (manifest) =>
  manifest.map(({ integrity: _, ...entry }, index) =>
    index === 0 ? { ...entry, url: appShellPrecacheUrl(randomUUID()) } : entry
  );

it('shares unchanged files between deploys and gives each document its own shell', () => {
  const shellOf = (name) => manifests[name][0];
  expect(shellOf('aPrime')).toEqual(shellOf('a'));
  expect(shellOf('aRetitled').url).not.toBe(shellOf('a').url);
  expect(shellOf('b').url).not.toBe(shellOf('a').url);
  const css = (name) => manifests[name].find((entry) => entry.url === SHARED_CSS);
  expect(css('b')).toEqual(css('a'));
});

it('reuses an unchanged shell when the host moves on mid-install', () => {
  const installedA = install(manifests.a, new Map(), host('a'));
  // sw.js for A' was served, then the host switched to B before the install fetched.
  const installed = install(manifests.aPrime, installedA, host('b'));
  expect(installed).not.toBeNull();
  const launch = offlineLaunch(manifests.aPrime, installed);
  expect(launch.html).toBe(BUILDS.a['index.html']);
  expect(launch.missing).toEqual([]);
});

it('abandons an update whose shell fetch lands on the next deploy', () => {
  const installedA = install(manifests.a, new Map(), host('a'));
  expect(install(manifests.aRetitled, installedA, host('b'))).toBeNull();
  expect(offlineLaunch(manifests.a, installedA).missing).toEqual([]);
});

it('negative control: a build-unique shell without integrity installs a blank launch', () => {
  const installedA = install(legacy(manifests.a), new Map(), host('a'));
  const aPrime = legacy(manifests.aPrime);
  const raced = install(aPrime, installedA, host('b'));
  expect(raced).not.toBeNull();
  expect(offlineLaunch(aPrime, raced).missing).toEqual(['_expo/static/js/web/index-b.js']);
});

it('installs the next deploy whole, reusing the files it shares', () => {
  const installedA = install(manifests.a, new Map(), host('a'));
  const installedB = install(manifests.b, installedA, (url) =>
    url === SHARED_CSS ? undefined : host('b')(url)
  );
  expect(installedB).not.toBeNull();
  const launch = offlineLaunch(manifests.b, installedB);
  expect(launch.html).toBe(BUILDS.b['index.html']);
  expect(launch.missing).toEqual([]);
});
