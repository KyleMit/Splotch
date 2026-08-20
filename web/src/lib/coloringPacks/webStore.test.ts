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

import { requestPersistentStorage } from '$lib/idb';
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
  vi.mocked(requestPersistentStorage).mockClear();
  vi.stubGlobal('caches', {
    keys: vi.fn().mockResolvedValue([coloringPackCacheName(manifest)]),
    open: vi.fn().mockResolvedValue(cache),
    delete: vi.fn(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => new Response(path.endsWith('/first.webp') ? 'a' : 'b'))
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('web coloring-pack inventory', () => {
  it('does not request origin persistence for an automatic background install', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const store = createWebColoringPackStore();

    await store.install(manifest, manifest.books[0], false, new AbortController().signal);

    expect(requestPersistentStorage).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('backfills a file added to a previously marked book', async () => {
    const book = manifest.books[0];
    cachedResponses.set(coloringPackMarkerPath(manifest, book.id), book.id);
    cachedResponses.set(book.files[0].path, 'a');
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
    cachedResponses.set(book.files[0].path, 'a');
    cachedResponses.set(book.files[1].path, 'b');
    const store = createWebColoringPackStore();

    expect(await store.installed(manifest)).toEqual([{ id: book.id }]);
    expect(cachedResponses.get(markerPath)).toBe(coloringPackMarkerValue(book));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not count an incomplete legacy marker before inventory discovery', async () => {
    const book = manifest.books[0];
    const markerPath = coloringPackMarkerPath(manifest, book.id);
    cachedResponses.set(markerPath, book.id);
    cachedResponses.set(book.files[0].path, 'a');
    const store = createWebColoringPackStore();

    expect(await store.usage(manifest)).toBe(0);
    expect(cachedResponses.has(markerPath)).toBe(false);
  });

  it('deletes mismatched cached bytes before backfilling them', async () => {
    const book = manifest.books[0];
    const markerPath = coloringPackMarkerPath(manifest, book.id);
    cachedResponses.set(markerPath, book.id);
    cachedResponses.set(book.files[0].path, 'b');
    cachedResponses.set(book.files[1].path, 'b');
    const store = createWebColoringPackStore();

    expect(await store.installed(manifest)).toEqual([]);
    expect(cachedResponses.has(markerPath)).toBe(false);
    expect(cachedResponses.has(book.files[0].path)).toBe(false);
    expect(cachedResponses.get(book.files[1].path)).toBe('b');

    await store.install(manifest, book, false, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(book.files[0].downloadPath, expect.any(Object));
    expect(cachedResponses.get(book.files[0].path)).toBe('a');
    expect(await store.installed(manifest)).toEqual([{ id: book.id }]);
  });

  it('leaves no installed marker when a stale manifest requests a removed asset', async () => {
    const book = manifest.books[0];
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('a'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const store = createWebColoringPackStore();

    await expect(
      store.install(manifest, book, false, new AbortController().signal)
    ).rejects.toThrow('Coloring asset download failed (404)');

    expect(cachedResponses.has(coloringPackMarkerPath(manifest, book.id))).toBe(false);
    expect(await store.installed(manifest)).toEqual([]);
  });

  it('caches an SVG with its format content type when the server omits the header', async () => {
    const vectorPath = '/coloring/dinosaur/first.overlay.svg';
    const vectorManifest: ResolvedColoringPackManifest = {
      ...manifest,
      books: [
        {
          ...manifest.books[0],
          bytes: 1,
          files: [{ ...manifest.books[0].files[0], path: vectorPath, downloadPath: vectorPath }],
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([97])));
    const store = createWebColoringPackStore();

    await store.install(
      vectorManifest,
      vectorManifest.books[0],
      false,
      new AbortController().signal
    );

    const cachedResponse = cache.put.mock.calls.find(([path]) => path === vectorPath)?.[1];
    expect(cachedResponse?.headers.get('Content-Type')).toBe('image/svg+xml');
  });
});
