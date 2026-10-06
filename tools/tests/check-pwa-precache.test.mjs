import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  checkPwaPrecache,
  APP_SHELL_FALLBACK_CALLBACKS,
  APP_SHELL_PRECACHE_URL_PATTERN,
  appShellFallbackLookupsFromSource,
  MAX_PWA_PRECACHE_BYTES,
  precacheBytesOnDisk,
  precacheUrlsFromSource,
  pwaPrecacheProblems,
} from '../check-pwa-precache.mjs';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
} from '../../web/src/lib/pwa/appShellRoute.ts';

import { PINNED_APP_SHELL_NONCE_ENV } from '../../web/appShellBuildNonce.ts';

const appShellUrl = appShellPrecacheUrl('build-id');
const shellLookups = (url) => APP_SHELL_FALLBACK_CALLBACKS.map((callback) => ({ callback, url }));
const appShellFallbackLookups = shellLookups(appShellUrl);

const coloringManifest = {
  starterBookId: 'farm',
  books: [{ id: 'farm', variants: { full: { files: [] } } }],
};

it('registers the responsive coloring route before the canonical pack route', () => {
  const viteConfig = readFileSync(new URL('../../web/vite.config.ts', import.meta.url), 'utf8');
  const runtimeCaching = viteConfig.slice(viteConfig.indexOf('runtimeCaching:'));
  const responsiveRoute = runtimeCaching.indexOf('urlPattern: RESPONSIVE_COLORING_URL_PATTERN');
  const canonicalRoute = runtimeCaching.indexOf('urlPattern: COLORING_PACK_ASSET_URL_PATTERN');
  expect(responsiveRoute).toBeGreaterThanOrEqual(0);
  expect(canonicalRoute).toBeGreaterThanOrEqual(0);
  expect(responsiveRoute).toBeLessThan(canonicalRoute);
});

it('reads Workbox manifest URLs without confusing the runtime route', () => {
  const source =
    'precacheAndRoute([{url:"coloring/farm/cat.overlay.webp",revision:"abc"}],{});' +
    'registerRoute(/coloring\\/max-1152px/,async({url:a})=>fetch(a));';

  expect(precacheUrlsFromSource(source)).toEqual(['coloring/farm/cat.overlay.webp']);
});

it('counts a URL the manifest lists twice once toward the precache budget', () => {
  const clientDir = mkdtempSync(join(tmpdir(), 'splotch-precache-'));
  try {
    writeFileSync(join(clientDir, 'favicon.ico'), Buffer.alloc(100));
    writeFileSync(join(clientDir, 'app.js'), Buffer.alloc(40));
    const appShellPath = join(clientDir, 'index.html');
    writeFileSync(appShellPath, Buffer.alloc(7));

    expect(
      precacheBytesOnDisk([appShellUrl, 'favicon.ico', 'app.js', 'favicon.ico'], {
        clientDir,
        appShellPath,
      })
    ).toBe(147);
  } finally {
    rmSync(clientDir, { recursive: true, force: true });
  }
});

it('accepts responsive assets only when their canonical fallback is precached within budget', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, 'coloring/farm/cat.overlay.webp', 'app.js'],
      appShellFallbackLookups,
      precacheBytes: MAX_PWA_PRECACHE_BYTES,
      responsiveAssetUrls: [
        'coloring/max-1152px/farm/cat.overlay.webp',
        'coloring/max-240px/farm/cat.overlay.webp',
      ],
      coloringManifest,
    })
  ).toEqual([]);
});

it('rejects responsive precache entries, missing fallbacks, and an oversized bundle', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, 'coloring/max-1152px/farm/cat.overlay.webp'],
      appShellFallbackLookups,
      precacheBytes: MAX_PWA_PRECACHE_BYTES + 1,
      responsiveAssetUrls: ['coloring/max-1152px/farm/cat.overlay.webp'],
      coloringManifest,
    })
  ).toEqual([
    '1 responsive coloring derivatives remain in the PWA precache',
    '1 responsive coloring derivatives lack a precached canonical fallback: coloring/farm/cat.overlay.webp',
    `PWA precache is ${MAX_PWA_PRECACHE_BYTES + 1} bytes, above the ${MAX_PWA_PRECACHE_BYTES}-byte budget`,
  ]);
});

it('rejects assets that are served but never fetched', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [
        appShellUrl,
        'large-image.png',
        'share/privacy.png',
        'web-app-manifest-192x192.png',
        'web-app-manifest-512x512.png',
        'web-app-manifest-maskable-512x512.png',
      ],
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    })
  ).toEqual([
    'Assets served but never fetched by the application remain in the PWA precache: large-image.png, share/privacy.png, web-app-manifest-192x192.png, web-app-manifest-512x512.png',
  ]);
});

it('requires every starter asset and rejects downloadable books in the precache', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, 'coloring/dinosaur/cover.thumb.webp'],
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest: {
        starterBookId: 'farm',
        books: [
          {
            id: 'farm',
            variants: { full: { files: [{ path: '/coloring/farm/cover.thumb.webp' }] } },
          },
          {
            id: 'dinosaur',
            variants: { full: { files: [{ path: '/coloring/dinosaur/cover.thumb.webp' }] } },
          },
        ],
      },
    })
  ).toEqual([
    '1 downloadable coloring assets remain in the PWA precache',
    '1 starter coloring assets are missing from the PWA precache: coloring/farm/cover.thumb.webp',
  ]);
});

it('recognizes the app shell URL the service worker config precaches', () => {
  expect(appShellUrl).toMatch(APP_SHELL_PRECACHE_URL_PATTERN);
});

it('requires exactly one build-matched app shell for offline navigations', () => {
  const problems = (precacheUrls) =>
    pwaPrecacheProblems({
      precacheUrls: [...precacheUrls, 'app.js'],
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    });

  expect(problems([])).toEqual([
    'Expected one build-matched app shell in the PWA precache, found 0',
  ]);
  expect(problems([appShellUrl, appShellPrecacheUrl('other-build')])).toEqual([
    'Expected one build-matched app shell in the PWA precache, found 2',
  ]);
});

it('reads the shell URL back from each fallback callback Workbox serializes', () => {
  const plugin = createAppShellFallbackPlugin(appShellUrl, 'v');
  const serialized = Object.entries(plugin)
    .map(([callback, body]) => `${callback}:${body}`)
    .join(',');
  const source = `plugins:[{${serialized}}],e.registerRoute(new e.NetworkFirst({cacheName:"pages"}))`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual(appShellFallbackLookups);
});

it('attributes a lookup only to the callback whose body holds it', () => {
  const source = `{cachedResponseWillBeUsed:async function(){return null},handlerDidError:async function(){return caches.match(${JSON.stringify(appShellUrl)})}}`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual([
    { callback: 'handlerDidError', url: appShellUrl },
  ]);
});

it.each([
  'async()=>',
  'async e=>',
  '({request:e})=>',
  'function(){return ',
  'async function(){return ',
])('ends a callback body at the next function-valued property written as %s', (valueStart) => {
  const lookup = `caches.match(${JSON.stringify(appShellUrl)})`;
  const source = `{cachedResponseWillBeUsed:async function(){return null},unrelated:${valueStart}${lookup},handlerDidError:async function(){return ${lookup}}}`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual([
    { callback: 'handlerDidError', url: appShellUrl },
  ]);
});

it('requires the shell to install first and each fallback callback to look up that same shell', () => {
  const problems = ({ precacheUrls, appShellFallbackLookups }) =>
    pwaPrecacheProblems({
      precacheUrls,
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    });
  const missingLookup = (callback) =>
    `The navigation fallback's ${callback} does not look up the precached app shell ${appShellUrl}`;

  expect(problems({ precacheUrls: ['app.js', appShellUrl], appShellFallbackLookups })).toEqual([
    'The app shell must be the first precache entry so a deploy mid-install fails the install',
  ]);
  expect(
    problems({
      precacheUrls: [appShellUrl, 'app.js'],
      appShellFallbackLookups: shellLookups(appShellPrecacheUrl('other-build')),
    })
  ).toEqual(APP_SHELL_FALLBACK_CALLBACKS.map(missingLookup));
  expect(
    problems({
      precacheUrls: [appShellUrl, 'app.js'],
      appShellFallbackLookups: [{ callback: 'handlerDidError', url: appShellUrl }],
    })
  ).toEqual([missingLookup('cachedResponseWillBeUsed')]);
});

it('refuses an ambient nonce pin through the shipping postbuild owner and restores the ordinary positive', async () => {
  const root = mkdtempSync(join(tmpdir(), 'splotch-precache-ambient-pin-'));
  const clientDir = join(root, 'client');
  const staticColoringDir = join(root, 'coloring');
  const swPath = join(clientDir, 'sw.js');
  const appShellPath = join(root, 'index.html');
  mkdirSync(join(clientDir, 'coloring'), { recursive: true });
  mkdirSync(staticColoringDir);
  writeFileSync(appShellPath, '<html></html>');
  writeFileSync(
    join(clientDir, 'coloring/manifest-fixture.json'),
    JSON.stringify(coloringManifest)
  );
  const plugin = createAppShellFallbackPlugin(appShellUrl, 'v');
  const callbacks = Object.entries(plugin)
    .map(([name, body]) => name + ':' + body)
    .join(',');
  writeFileSync(
    swPath,
    'precacheAndRoute([{url:' +
      JSON.stringify(appShellUrl) +
      ',revision:null},{url:"coloring/manifest-fixture.json",revision:null}],{}); plugins:[{' +
      callbacks +
      '}]'
  );
  const options = { clientDir, staticColoringDir, swPath, appShellPath, log: () => {} };
  try {
    await expect(checkPwaPrecache(options)).resolves.toBeUndefined();
    vi.stubEnv(PINNED_APP_SHELL_NONCE_ENV, '806d050f-45b0-4419-9997-0a0065232d26');
    await expect(checkPwaPrecache(options)).rejects.toThrow(
      /complete owned paired-control context/
    );
    vi.unstubAllEnvs();
    await expect(checkPwaPrecache(options)).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true });
  }
});
