import { expect, it } from 'vitest';
import {
  MAX_PWA_PRECACHE_BYTES,
  precacheUrlsFromSource,
  pwaPrecacheProblems,
} from '../check-pwa-precache.mjs';

const coloringManifest = {
  starterBookId: 'farm',
  books: [{ id: 'farm', files: [] }],
};

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
      coloringManifest,
    })
  ).toEqual([]);
});

it('rejects responsive precache entries, missing fallbacks, and an oversized bundle', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: ['_app/env.js', 'coloring/max-1152px/farm/cat.overlay.webp'],
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
      precacheUrls: ['_app/env.js', 'large-image.png'],
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
      precacheUrls: ['app.js'],
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest,
    })
  ).toEqual(['SvelteKit runtime environment module is missing from the PWA precache']);
});

it('requires every starter asset and rejects downloadable books in the precache', () => {
  expect(
    pwaPrecacheProblems({
      precacheUrls: ['_app/env.js', 'coloring/dinosaur/cover.thumb.webp'],
      precacheBytes: 1,
      responsiveAssetUrls: [],
      coloringManifest: {
        starterBookId: 'farm',
        books: [
          { id: 'farm', files: [{ path: '/coloring/farm/cover.thumb.webp' }] },
          { id: 'dinosaur', files: [{ path: '/coloring/dinosaur/cover.thumb.webp' }] },
        ],
      },
    })
  ).toEqual([
    '1 downloadable coloring assets remain in the PWA precache',
    '1 starter coloring assets are missing from the PWA precache: coloring/farm/cover.thumb.webp',
  ]);
});
