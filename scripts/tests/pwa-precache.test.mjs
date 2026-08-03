import { expect, it } from 'vitest';
import {
  MAX_PWA_PRECACHE_BYTES,
  precacheUrlsFromSource,
  pwaPrecacheProblems,
} from '../check-pwa-precache.mjs';

it('reads Workbox manifest URLs without confusing the runtime route', () => {
  const source =
    'precacheAndRoute([{url:"coloring/farm/cat.overlay.webp",revision:"abc"}],{});' +
    'registerRoute(/coloring\\/max-1152px/,async({url:a})=>fetch(a));';

  expect(precacheUrlsFromSource(source)).toEqual(['coloring/farm/cat.overlay.webp']);
});

it('accepts responsive assets only when their canonical fallback is precached within budget', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: ['_app/env.js', 'coloring/farm/cat.overlay.webp', 'app.js'],
      precacheBytes: MAX_PWA_PRECACHE_BYTES,
      responsiveAssetUrls: [
        'coloring/max-1152px/farm/cat.overlay.webp',
        'coloring/max-240px/farm/cat.overlay.webp',
      ],
    })
  ).toEqual([]);
});

it('rejects responsive precache entries, missing fallbacks, and an oversized bundle', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: ['_app/env.js', 'coloring/max-1152px/farm/cat.overlay.webp'],
      precacheBytes: MAX_PWA_PRECACHE_BYTES + 1,
      responsiveAssetUrls: ['coloring/max-1152px/farm/cat.overlay.webp'],
    })
  ).toEqual([
    '1 responsive coloring derivatives remain in the PWA precache',
    '1 responsive coloring derivatives lack a precached canonical fallback: coloring/farm/cat.overlay.webp',
    `PWA precache is ${MAX_PWA_PRECACHE_BYTES + 1} bytes, above the ${MAX_PWA_PRECACHE_BYTES}-byte budget`,
  ]);
});

it('requires the runtime-generated environment module for offline hydration', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: ['app.js'],
      precacheBytes: 1,
      responsiveAssetUrls: [],
    })
  ).toEqual(['SvelteKit runtime environment module is missing from the PWA precache']);
});
