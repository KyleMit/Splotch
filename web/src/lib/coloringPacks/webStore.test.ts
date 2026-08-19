import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackManifest } from './manifest';
import { coloringPackCacheName, coloringPackMarkerPath } from './cacheKeys';

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

const cachedPaths = new Set<string>();
const cache = {
  match: vi.fn(async (path: string) =>
    cachedPaths.has(path) ? new Response('cached') : undefined
  ),
  put: vi.fn(async (path: string) => {
    cachedPaths.add(path);
  }),
  delete: vi.fn(async (path: string) => cachedPaths.delete(path)),
};

beforeEach(() => {
  cachedPaths.clear();
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
    cachedPaths.add(coloringPackMarkerPath(manifest, book.id));
    cachedPaths.add(book.files[0].path);
    const store = createWebColoringPackStore();

    expect(await store.installed(manifest)).toEqual([]);
    expect(await store.usage(manifest)).toBe(0);

    await store.install(manifest, book, false, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(book.files[1].downloadPath, expect.any(Object));
    expect(await store.installed(manifest)).toEqual([{ id: book.id }]);
    expect(await store.usage(manifest)).toBe(book.bytes);
  });
});
