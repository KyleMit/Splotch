import { describe, expect, it, vi } from 'vitest';
import { COLORING_PACK_LOCK_NAME, coloringPackMarkerPath } from './cacheKeys';
import { promiseWithResolvers } from '$lib/promiseWithResolvers';

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock('$lib/idb', () => ({ requestPersistentStorage: vi.fn() }));

import { createWebColoringPackStore } from './webStore';
import {
  DIGESTS,
  LEGACY_CACHE_NAME,
  book,
  currentCache,
  dinosaur,
  dinosaurChanged,
  installedIds,
  openNewTab,
  released,
  useWebStoreWorld,
  type Content,
} from './webStoreTestHarness';

const world = useWebStoreWorld();
const { deploy, seedCache, cachedPaths, servedByWorker } = world;

// Tabs on two builds share the cache during a deploy. The older tab's scan
// snapshots the keys after the newer tab wrote a file the older manifest does
// not list, and before the newer tab's marker lands; deleting that file then
// would leave a marker the newer manifest trusts over a missing file. Both
// stores share this module's realm, so the fallback row proves only same-tab
// serialization: separate tabs without Web Locks have separate chains, which
// docs/COMPATIBILITY.md records as unprotected.
describe.each([
  ['two tabs sharing Web Locks', openNewTab],
  ['two stores in one tab without Web Locks', () => vi.stubGlobal('navigator', {})],
])('%s on different manifests', (_label, setUpLocks) => {
  const dinosaurWithThird = book('dinosaur', [
    ['first', 'a'],
    ['second', 'b'],
    ['third', 'c'],
  ]);

  it('never publish a book with a missing file', async () => {
    setUpLocks();
    const newer = deploy([dinosaurWithThird, released.books[1]]);
    const markerPut = promiseWithResolvers<void>();
    const olderKeys = promiseWithResolvers<void>();
    const markerPutStarted = vi.fn();
    let holdNextKeys = false;
    world.fake.hooks.intercept = async (operation, path) => {
      if (operation === 'put' && path === coloringPackMarkerPath('dinosaur')) {
        markerPutStarted();
        await markerPut.promise;
      }
      if (operation === 'keys' && holdNextKeys) {
        holdNextKeys = false;
        await olderKeys.promise;
      }
    };
    const newerTab = createWebColoringPackStore();

    const committing = newerTab.install(
      newer,
      dinosaurWithThird,
      false,
      new AbortController().signal
    );
    await vi.waitFor(() => expect(markerPutStarted).toHaveBeenCalled());
    holdNextKeys = true;
    const olderScan = createWebColoringPackStore().installed(released);
    await new Promise((resolve) => setTimeout(resolve, 0));
    markerPut.resolve();
    await committing;
    olderKeys.resolve();
    await olderScan;

    const cached = new Set(cachedPaths(currentCache));
    const publishedWithMissingFiles = (await newerTab.installed(newer))
      .map((pack) => newer.books.find((entry) => entry.id === pack.id)!)
      .filter((entry) => entry.files.some((file) => !cached.has(file.path)))
      .map((entry) => entry.id);
    expect(publishedWithMissingFiles).toEqual([]);
  });
});

function holdFirstDownload(downloadPath: string) {
  const release = promiseWithResolvers<void>();
  const started = vi.fn();
  const serveFile = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === downloadPath && started.mock.calls.length === 0) {
      started();
      await release.promise;
    }
    return serveFile(path, init);
  });
  return { started, release: release.resolve };
}

describe('web coloring packs under concurrent stores', () => {
  // A Cache handle opened before another tab deletes its namespace stays
  // writable but detached, so a marker written through it vouches for files the
  // service worker can no longer find.
  it('never reports an install that another tab removed mid-download as served', async () => {
    const secondDownload = holdFirstDownload(dinosaur.files[1].downloadPath);

    const installing = createWebColoringPackStore().install(
      released,
      dinosaur,
      false,
      new AbortController().signal
    );
    await vi.waitFor(() => expect(secondDownload.started).toHaveBeenCalled());
    await createWebColoringPackStore().remove();
    secondDownload.release();
    await installing;

    for (const file of dinosaur.files) expect(await servedByWorker(file.path)).toBeDefined();
    expect(installedIds(await createWebColoringPackStore().installed(released))).toEqual([
      'dinosaur',
    ]);
  });

  // A newer build downloads a changed file while an older build adopts the old
  // bytes and commits its marker; the newer tab then closes before its own
  // commit. The older marker must not survive over the newer bytes.
  it('never leaves a marker over bytes another build wrote after verification', async () => {
    await seedCache(LEGACY_CACHE_NAME, {
      '/coloring/dinosaur/first.webp': 'a',
      '/coloring/dinosaur/second.webp': 'b',
    });
    const newer = deploy([dinosaurChanged, released.books[1]]);
    const changedDownload = holdFirstDownload(dinosaurChanged.files[1].downloadPath);
    const olderMarkerPut = promiseWithResolvers<void>();
    const newerTab = new AbortController();
    let secondFilePuts = 0;
    world.fake.hooks.intercept = async (operation, path) => {
      if (operation !== 'put') return;
      if (path === coloringPackMarkerPath('dinosaur')) await olderMarkerPut.promise;
      if (path === dinosaurChanged.files[1].path && ++secondFilePuts === 2) newerTab.abort();
    };

    const installing = createWebColoringPackStore().install(
      newer,
      dinosaurChanged,
      false,
      newerTab.signal
    );
    await vi.waitFor(() => expect(changedDownload.started).toHaveBeenCalled());
    const olderScan = createWebColoringPackStore().installed(released);
    await vi.waitFor(() => expect(secondFilePuts).toBe(1));
    changedDownload.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    olderMarkerPut.resolve();
    await olderScan;
    await installing.catch(() => {});
    world.fake.hooks.intercept = () => {};

    const reported = await createWebColoringPackStore().installed(released);
    const servedWrongBytes = [];
    for (const pack of reported) {
      const entry = released.books.find((candidate) => candidate.id === pack.id)!;
      for (const file of entry.files) {
        const content = await servedByWorker(file.path);
        if (content === undefined || DIGESTS[content as Content] !== file.sha256) {
          servedWrongBytes.push(file.path);
        }
      }
    }
    expect(servedWrongBytes).toEqual([]);
  });

  it('takes the shared coloring-pack lock for a scan', async () => {
    await createWebColoringPackStore().installed(released);

    expect(navigator.locks.request).toHaveBeenCalledWith(
      COLORING_PACK_LOCK_NAME,
      expect.any(Function)
    );
  });
});
