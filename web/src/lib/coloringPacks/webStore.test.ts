import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackManifest } from './manifest';
import {
  coloringPackCacheName,
  coloringPackMarkerPath,
  coloringPackMarkerValue,
} from './cacheKeys';

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock('$lib/idb', () => ({ requestPersistentStorage: vi.fn() }));

import { createWebColoringPackStore } from './webStore';

const manifest: ResolvedColoringPackManifest = {
  appVersion: '1.2.3-test',
  resolution: 'compact',
  starterBookId: 'farm',
  books: [
    {
      id: 'dinosaur',
      bytes: 2,
      files: [
        {
          path: '/coloring/dinosaur/first.webp',
          downloadPath: '/coloring/max-240px/dinosaur/first.webp',
          bytes: 1,
          sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        },
        {
          path: '/coloring/dinosaur/second.webp',
          downloadPath: '/coloring/max-240px/dinosaur/second.webp',
          bytes: 1,
          sha256: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
        },
      ],
    },
  ],
};

const cachedResponses = new Map<string, string>();
const cache = {
  match: vi.fn(async (path: string) =>
    cachedResponses.has(path) ? new Response(cachedResponses.get(path)) : undefined
  ),
  put: vi.fn(async (path: string, response: Response) => {
    cachedResponses.set(path, await response.text());
  }),
  delete: vi.fn(async (path: string) => cachedResponses.delete(path)),
};

beforeEach(() => {
  cachedResponses.clear();
  cache.match.mockClear();
  cache.put.mockClear();
  cache.delete.mockClear();
  vi.stubGlobal('caches', {
    keys: vi.fn().mockResolvedValue([coloringPackCacheName(manifest)]),
    open: vi.fn().mockResolvedValue(cache),
    delete: vi.fn(),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('b')));
});

afterEach(() => vi.unstubAllGlobals());

describe('web coloring-pack inventory', () => {
  it('backfills a file added to a previously marked book', async () => {
    const book = manifest.books[0];
    cachedResponses.set(coloringPackMarkerPath(manifest, book.id), book.id);
    cachedResponses.set(book.files[0].path, 'cached');
    const store = createWebColoringPackStore();

    expect(await store.installed(manifest)).toEqual([]);
    expect(await store.usage(manifest)).toBe(0);

    await store.install(manifest, book, false, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(book.files[1].downloadPath, expect.any(Object));
    expect(await store.installed(manifest)).toEqual([{ id: book.id }]);
    expect(await store.usage(manifest)).toBe(book.bytes);
    expect(cachedResponses.get(coloringPackMarkerPath(manifest, book.id))).toBe(
      coloringPackMarkerValue(book)
    );
  });

  it('upgrades a complete legacy marker to the current inventory value', async () => {
    const book = manifest.books[0];
    const markerPath = coloringPackMarkerPath(manifest, book.id);
    cachedResponses.set(markerPath, book.id);
    for (const file of book.files) cachedResponses.set(file.path, 'cached');
    const store = createWebColoringPackStore();

    expect(await store.installed(manifest)).toEqual([{ id: book.id }]);
    expect(cachedResponses.get(markerPath)).toBe(coloringPackMarkerValue(book));
    expect(fetch).not.toHaveBeenCalled();
  });
});
