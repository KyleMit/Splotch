import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  APP_SHELL_FALLBACK_CALLBACKS,
  APP_SHELL_PRECACHE_URL_PATTERN,
  appShellFallbackLookupsFromSource,
  MAX_PWA_PRECACHE_BYTES,
  precacheUrlsFromSource,
  pwaPrecacheProblems,
} from '../check-pwa-precache.mjs';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
} from '../../web/src/lib/pwa/appShellRoute.ts';

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

it('accepts responsive assets only when their canonical fallback is precached within budget', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, '_app/env.js', 'coloring/farm/cat.overlay.webp', 'app.js'],
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
      precacheUrls: [appShellUrl, '_app/env.js', 'coloring/max-1152px/farm/cat.overlay.webp'],
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

it('rejects the served-only social card', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, '_app/env.js', 'large-image.png'],
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    })
  ).toEqual([
    'Assets served but never fetched by the application remain in the PWA precache: large-image.png',
  ]);
});

it('requires the runtime-generated environment module for offline hydration', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, 'app.js'],
      appShellFallbackLookups,
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    })
  ).toEqual(['SvelteKit runtime environment module is missing from the PWA precache']);
});

it('requires every starter asset and rejects downloadable books in the precache', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: [appShellUrl, '_app/env.js', 'coloring/dinosaur/cover.thumb.webp'],
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
      precacheUrls: [...precacheUrls, '_app/env.js'],
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

  expect(problems({ precacheUrls: ['_app/env.js', appShellUrl], appShellFallbackLookups })).toEqual(
    ['The app shell must be the first precache entry so a deploy mid-install fails the install']
  );
  expect(
    problems({
      precacheUrls: [appShellUrl, '_app/env.js'],
      appShellFallbackLookups: shellLookups(appShellPrecacheUrl('other-build')),
    })
  ).toEqual(APP_SHELL_FALLBACK_CALLBACKS.map(missingLookup));
  expect(
    problems({
      precacheUrls: [appShellUrl, '_app/env.js'],
      appShellFallbackLookups: [{ callback: 'handlerDidError', url: appShellUrl }],
    })
  ).toEqual([missingLookup('cachedResponseWillBeUsed')]);
});
