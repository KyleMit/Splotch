import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackManifest } from './manifest';
import { coloringPackMarkerPath, coloringPackMarkerValue } from './cacheKeys';

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock('$lib/idb', () => ({ requestPersistentStorage: vi.fn() }));

import { requestPersistentStorage } from '$lib/idb';
import { createWebColoringPackStore } from './webStore';
import {
  LEGACY_CACHE_NAME,
  book,
  createFakeLockManager,
  currentCache,
  dinosaur,
  dinosaurChanged,
  installedIds,
  openNewTab,
  released,
  useWebStoreWorld,
  type CacheOperation,
} from './webStoreTestHarness';

const world = useWebStoreWorld();
const { deploy, seedCache, cachedPaths, servedByWorker } = world;

const never = () => new Promise<void>(() => {});

// The interrupted tab's promise never settles and its lock is never released,
// the way a closed tab leaves both.
function holdForever(operation: CacheOperation, heldPath: string) {
  const held = vi.fn(never);
  world.fake.hooks.intercept = (current, path) =>
    current === operation && path === heldPath ? held() : undefined;
  return held;
}

function closeTabAndOpenAnother() {
  world.fake.hooks.intercept = () => {};
  openNewTab();
}

async function installAll(manifest: ResolvedColoringPackManifest) {
  const store = createWebColoringPackStore();
  const installed = new Set(installedIds(await store.installed(manifest)));
  for (const entry of manifest.books) {
    if (entry.id === manifest.starterBookId || installed.has(entry.id)) continue;
    await store.install(manifest, entry, false, new AbortController().signal);
  }
}

beforeEach(() => vi.mocked(requestPersistentStorage).mockClear());

describe('web coloring-pack inventory', () => {
  it('does not request origin persistence for an automatic background install', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { locks: createFakeLockManager(), storage: { persist } });

    await createWebColoringPackStore().install(
      released,
      dinosaur,
      false,
      new AbortController().signal
    );

    expect(requestPersistentStorage).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('backfills a file added to a previously marked book', async () => {
    await seedCache(currentCache, {
      [coloringPackMarkerPath(dinosaur.id)]: dinosaur.id,
      [dinosaur.files[0].path]: 'a',
    });
    const store = createWebColoringPackStore();

    expect(await store.installed(released)).toEqual([]);

    await store.install(released, dinosaur, false, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(dinosaur.files[1].downloadPath, expect.any(Object));
    expect(await store.installed(released)).toEqual([{ id: dinosaur.id, bytes: dinosaur.bytes }]);
    expect(await servedByWorker(coloringPackMarkerPath(dinosaur.id))).toBe(
      coloringPackMarkerValue(dinosaur)
    );
  });

  it('upgrades a complete legacy marker to the current inventory value', async () => {
    await seedCache(currentCache, {
      [coloringPackMarkerPath(dinosaur.id)]: dinosaur.id,
      [dinosaur.files[0].path]: 'a',
      [dinosaur.files[1].path]: 'b',
    });

    const installed = await createWebColoringPackStore().installed(released);

    expect(installed).toEqual([{ id: dinosaur.id, bytes: dinosaur.bytes }]);
    expect(await servedByWorker(coloringPackMarkerPath(dinosaur.id))).toBe(
      coloringPackMarkerValue(dinosaur)
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not count an incomplete legacy marker before inventory discovery', async () => {
    await seedCache(currentCache, {
      [coloringPackMarkerPath(dinosaur.id)]: dinosaur.id,
      [dinosaur.files[0].path]: 'a',
    });

    expect(await createWebColoringPackStore().installed(released)).toEqual([]);
    expect(cachedPaths(currentCache)).not.toContain(coloringPackMarkerPath(dinosaur.id));
  });

  it('deletes mismatched cached bytes before backfilling them', async () => {
    await seedCache(currentCache, {
      [coloringPackMarkerPath(dinosaur.id)]: dinosaur.id,
      [dinosaur.files[0].path]: 'b',
      [dinosaur.files[1].path]: 'b',
    });
    const store = createWebColoringPackStore();

    expect(await store.installed(released)).toEqual([]);
    expect(cachedPaths(currentCache)).toEqual([dinosaur.files[1].path]);

    await store.install(released, dinosaur, false, new AbortController().signal);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(dinosaur.files[0].downloadPath, expect.any(Object));
    expect(await servedByWorker(dinosaur.files[0].path)).toBe('a');
    expect(await store.installed(released)).toEqual([{ id: dinosaur.id, bytes: dinosaur.bytes }]);
  });

  it('leaves no installed marker when a stale manifest requests a removed asset', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('a'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const store = createWebColoringPackStore();

    await expect(
      store.install(released, dinosaur, false, new AbortController().signal)
    ).rejects.toThrow('Coloring asset download failed (404)');

    expect(cachedPaths(currentCache)).not.toContain(coloringPackMarkerPath(dinosaur.id));
    expect(await store.installed(released)).toEqual([]);
  });

  it('caches an SVG with its format content type when the server omits the header', async () => {
    const vectorPath = '/coloring/dinosaur/first.overlay.svg';
    const vectorBook = {
      ...dinosaur,
      bytes: 1,
      files: [{ ...dinosaur.files[0], path: vectorPath, downloadPath: vectorPath }],
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([97])));

    await createWebColoringPackStore().install(
      { ...released, books: [vectorBook] },
      vectorBook,
      false,
      new AbortController().signal
    );

    expect((await world.fake.storage.match(vectorPath))?.headers.get('Content-Type')).toBe(
      'image/svg+xml'
    );
  });
});

describe('web coloring packs across a deploy', () => {
  beforeEach(async () => {
    await installAll(released);
    vi.mocked(fetch).mockClear();
  });

  it('keeps every unchanged book installed after an app-version bump without refetching or hashing', async () => {
    const deployed = deploy(released.books);
    const digest = vi.spyOn(crypto.subtle, 'digest');

    const installed = await createWebColoringPackStore().installed(deployed);

    expect(installedIds(installed)).toEqual(['dinosaur', 'space']);
    expect(digest).not.toHaveBeenCalled();
    digest.mockRestore();
    await installAll(deployed);
    expect(fetch).not.toHaveBeenCalled();
    expect(await servedByWorker('/coloring/dinosaur/second.webp')).toBe('b');
    expect(await servedByWorker('/coloring/space/rocket.webp')).toBe('a');
  });

  it('refetches only the file whose digest changed', async () => {
    const deployed = deploy([dinosaurChanged, released.books[1]]);
    const store = createWebColoringPackStore();

    expect(installedIds(await store.installed(deployed))).toEqual(['space']);
    await installAll(deployed);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/coloring/max-240px/dinosaur/second.webp',
      expect.anything()
    );
    expect(installedIds(await store.installed(deployed))).toEqual(['dinosaur', 'space']);
    expect(await servedByWorker('/coloring/dinosaur/second.webp')).toBe('c');
  });

  it('drops a book the new manifest no longer lists', async () => {
    const deployed = deploy([dinosaur]);

    const installed = await createWebColoringPackStore().installed(deployed);

    expect(installedIds(installed)).toEqual(['dinosaur']);
    expect(fetch).not.toHaveBeenCalled();
    expect(await servedByWorker('/coloring/space/rocket.webp')).toBeUndefined();
    expect(cachedPaths(currentCache)).not.toContain(coloringPackMarkerPath('space'));
  });

  // A marker is trusted by value, so if it outlived the file it vouched for, a
  // revert to the earlier manifest would publish a book with a missing file.
  it('removes a changed book marker before touching any of its files', async () => {
    const deployed = deploy([dinosaurChanged, released.books[1]]);
    const staleFileDelete = holdForever('delete', '/coloring/dinosaur/second.webp');

    void createWebColoringPackStore().installed(deployed);

    await vi.waitFor(() => expect(staleFileDelete).toHaveBeenCalled());
    expect(cachedPaths(currentCache)).not.toContain(coloringPackMarkerPath('dinosaur'));
  });

  it('refetches stale bytes an interrupted rescan left behind', async () => {
    const deployed = deploy([dinosaurChanged, released.books[1]]);
    const staleFileDelete = holdForever('delete', '/coloring/dinosaur/second.webp');
    void createWebColoringPackStore().installed(deployed);
    await vi.waitFor(() => expect(staleFileDelete).toHaveBeenCalled());
    closeTabAndOpenAnother();

    expect(installedIds(await createWebColoringPackStore().installed(deployed))).toEqual(['space']);
    await installAll(deployed);

    expect(fetch).toHaveBeenCalledOnce();
    expect(await servedByWorker('/coloring/dinosaur/second.webp')).toBe('c');
  });
});

describe('adopting a version-scoped cache from the earlier store layout', () => {
  const legacyEntries = {
    '/coloring/.installed/1.2.3-test/compact/dinosaur': coloringPackMarkerValue(dinosaur),
    '/coloring/dinosaur/first.webp': 'a',
    '/coloring/dinosaur/second.webp': 'b',
    '/coloring/space/rocket.webp': 'a',
  };

  it('keeps complete books installed without refetching and deletes the old cache', async () => {
    await seedCache(LEGACY_CACHE_NAME, legacyEntries);
    const deployed = deploy(released.books);

    const installed = await createWebColoringPackStore().installed(deployed);

    expect(installedIds(installed)).toEqual(['dinosaur', 'space']);
    await installAll(deployed);
    expect(fetch).not.toHaveBeenCalled();
    expect(world.fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
  });

  it('does not publish a book whose old copy is missing a file', async () => {
    const { '/coloring/dinosaur/second.webp': _missing, ...incomplete } = legacyEntries;
    await seedCache(LEGACY_CACHE_NAME, incomplete);
    const deployed = deploy(released.books);
    const store = createWebColoringPackStore();

    expect(installedIds(await store.installed(deployed))).toEqual(['space']);
    await installAll(deployed);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/coloring/max-240px/dinosaur/second.webp',
      expect.anything()
    );
  });

  it('holds each file only once when adoption is interrupted, then resumes', async () => {
    await seedCache(LEGACY_CACHE_NAME, legacyEntries);
    const deployed = deploy(released.books);
    const secondFilePut = holdForever('put', '/coloring/dinosaur/second.webp');

    void createWebColoringPackStore().installed(deployed);

    await vi.waitFor(() => expect(secondFilePut).toHaveBeenCalled());
    expect(cachedPaths(currentCache)).toEqual(['/coloring/dinosaur/first.webp']);
    expect(cachedPaths(LEGACY_CACHE_NAME)).not.toContain('/coloring/dinosaur/first.webp');
    closeTabAndOpenAnother();
    expect(installedIds(await createWebColoringPackStore().installed(deployed))).toEqual([
      'dinosaur',
      'space',
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(world.fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
  });

  it('marks a fully moved book whose marker write was interrupted', async () => {
    await seedCache(LEGACY_CACHE_NAME, legacyEntries);
    const deployed = deploy(released.books);
    const markerPut = holdForever('put', coloringPackMarkerPath('dinosaur'));

    void createWebColoringPackStore().installed(deployed);

    await vi.waitFor(() => expect(markerPut).toHaveBeenCalled());
    expect(cachedPaths(LEGACY_CACHE_NAME)).not.toContain('/coloring/dinosaur/second.webp');
    closeTabAndOpenAnother();
    expect(installedIds(await createWebColoringPackStore().installed(deployed))).toEqual([
      'dinosaur',
      'space',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps reporting other books when a write fails on every boot', async () => {
    await seedCache(LEGACY_CACHE_NAME, legacyEntries);
    const deployed = deploy(released.books);
    failEveryPut('/coloring/dinosaur/second.webp');
    const store = createWebColoringPackStore();

    expect(installedIds(await store.installed(deployed))).toEqual(['space']);
    expect(installedIds(await store.installed(deployed))).toEqual(['space']);
    expect(cachedPaths(currentCache)).not.toContain(coloringPackMarkerPath('dinosaur'));
    expect(world.fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
  });
});

function failEveryPut(failingPath: string) {
  world.fake.hooks.intercept = (operation, path) => {
    if (operation === 'put' && path === failingPath) {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    }
  };
}

describe('a scan whose re-verification write fails', () => {
  it('still reports the books whose markers match', async () => {
    await installAll(released);
    const deployed = deploy([book('dinosaur', [['first', 'a']]), released.books[1]]);
    failEveryPut(coloringPackMarkerPath('dinosaur'));

    expect(installedIds(await createWebColoringPackStore().installed(deployed))).toEqual(['space']);
  });
});
