import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';
import {
  COLORING_PACK_LOCK_NAME,
  coloringPackCacheName,
  coloringPackMarkerPath,
  coloringPackMarkerValue,
} from './cacheKeys';
import { promiseWithResolvers } from '$lib/promiseWithResolvers';

vi.mock('$lib/idle', () => ({
  scheduleIdle: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock('$lib/idb', () => ({ requestPersistentStorage: vi.fn() }));

import { requestPersistentStorage } from '$lib/idb';
import { createWebColoringPackStore } from './webStore';

const ORIGIN = 'https://splotch.test';
const DIGESTS = {
  a: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
  b: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
  c: '2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc6',
} as const;
type Content = keyof typeof DIGESTS;

interface CachedEntry {
  body: Uint8Array;
  headers: Headers;
}

function requestPath(request: RequestInfo | URL): string {
  const url = typeof request === 'string' ? request : 'url' in request ? request.url : request.href;
  return new URL(url, ORIGIN).pathname;
}

function responseFor(entry: CachedEntry | undefined): Response | undefined {
  return entry && new Response(entry.body.slice(), { headers: entry.headers });
}

type CacheOperation = 'put' | 'delete' | 'keys';
type Interceptor = (operation: CacheOperation, path?: string) => void | Promise<void>;

// Real Cache Storage keeps one cache per name and the service worker matches
// across all of them; a single shared mock would hide a deleted namespace.
// The interceptor runs before each write, and after keys() has taken its
// snapshot, so a test can fail, hold, or never finish (a closed tab) any step.
function createFakeCacheStorage() {
  const stores = new Map<string, Map<string, CachedEntry>>();
  const hooks: { intercept: Interceptor } = { intercept: () => {} };
  const cacheFor = (entries: Map<string, CachedEntry>) => ({
    match: async (request: RequestInfo | URL) => responseFor(entries.get(requestPath(request))),
    put: async (request: RequestInfo | URL, response: Response) => {
      const body = new Uint8Array(await response.arrayBuffer());
      await hooks.intercept('put', requestPath(request));
      entries.set(requestPath(request), { body, headers: new Headers(response.headers) });
    },
    delete: async (request: RequestInfo | URL) => {
      await hooks.intercept('delete', requestPath(request));
      return entries.delete(requestPath(request));
    },
    keys: async () => {
      const snapshot = [...entries.keys()];
      await hooks.intercept('keys');
      return snapshot.map((path) => new Request(`${ORIGIN}${path}`));
    },
  });
  return {
    hooks,
    entries: (name: string) => stores.get(name),
    storage: {
      keys: async () => [...stores.keys()],
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return cacheFor(stores.get(name)!);
      },
      delete: async (name: string) => stores.delete(name),
      match: async (request: RequestInfo | URL) => {
        for (const entries of stores.values()) {
          const response = responseFor(entries.get(requestPath(request)));
          if (response) return response;
        }
        return undefined;
      },
    },
  };
}

// Serializes like the browser's Web Locks within one "tab"; a test that
// abandons a held lock models a closed tab by installing a fresh manager.
function createFakeLockManager() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: vi.fn((_name: string, work: () => Promise<unknown>) => {
      const result = tail.then(work);
      tail = result.catch(() => {});
      return result;
    }),
  };
}

function openNewTab() {
  vi.stubGlobal('navigator', { locks: createFakeLockManager() });
}

const never = () => new Promise<void>(() => {});

function book(id: string, pages: [name: string, content: Content][]) {
  return {
    id,
    bytes: pages.length,
    files: pages.map(([name, content]) => ({
      path: `/coloring/${id}/${name}.webp`,
      downloadPath: `/coloring/max-240px/${id}/${name}.webp`,
      bytes: 1,
      sha256: DIGESTS[content],
    })),
  } satisfies ResolvedColoringPackBookManifest;
}

const released: ResolvedColoringPackManifest = {
  appVersion: '1.2.3-test',
  resolution: 'compact',
  starterBookId: 'farm',
  books: [
    book('dinosaur', [
      ['first', 'a'],
      ['second', 'b'],
    ]),
    book('space', [['rocket', 'a']]),
  ],
};
const [dinosaur] = released.books;
const dinosaurChanged = book('dinosaur', [
  ['first', 'a'],
  ['second', 'c'],
]);
const LEGACY_CACHE_NAME = 'coloring-packs-v1-1.2.3-test-compact';

let fake: ReturnType<typeof createFakeCacheStorage>;
let served = new Map<string, Content>();

function serve(manifest: ResolvedColoringPackManifest) {
  const contentByDigest = new Map<string, Content>(
    Object.entries(DIGESTS).map(([content, digest]) => [digest, content as Content])
  );
  served = new Map(
    manifest.books.flatMap((entry) =>
      entry.files.map((file) => [file.downloadPath, contentByDigest.get(file.sha256)!] as const)
    )
  );
}

function deploy(books: ResolvedColoringPackBookManifest[]): ResolvedColoringPackManifest {
  const manifest = { ...released, appVersion: '1.2.4-test', books };
  serve(manifest);
  return manifest;
}

async function seedCache(name: string, entries: Record<string, string>) {
  const cache = await fake.storage.open(name);
  for (const [path, body] of Object.entries(entries)) await cache.put(path, new Response(body));
}

function cachedPaths(name: string): string[] {
  return [...(fake.entries(name)?.keys() ?? [])];
}

async function servedByWorker(path: string): Promise<string | undefined> {
  return (await fake.storage.match(path))?.text();
}

function installedIds(packs: { id: string }[]): string[] {
  return packs.map((pack) => pack.id);
}

// The interrupted tab's promise never settles and its lock is never released,
// the way a closed tab leaves both.
function holdForever(operation: CacheOperation, heldPath: string) {
  const held = vi.fn(never);
  fake.hooks.intercept = (current, path) =>
    current === operation && path === heldPath ? held() : undefined;
  return held;
}

function closeTabAndOpenAnother() {
  fake.hooks.intercept = () => {};
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

const currentCache = coloringPackCacheName(released);

beforeEach(() => {
  fake = createFakeCacheStorage();
  vi.mocked(requestPersistentStorage).mockClear();
  vi.stubGlobal('caches', fake.storage);
  openNewTab();
  serve(released);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      served.has(path) ? new Response(served.get(path)) : new Response(null, { status: 404 })
    )
  );
});

afterEach(() => vi.unstubAllGlobals());

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

    expect((await fake.storage.match(vectorPath))?.headers.get('Content-Type')).toBe(
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
    expect(fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
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
    expect(fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
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
    expect(fake.entries(LEGACY_CACHE_NAME)).toBeUndefined();
  });
});

function failEveryPut(failingPath: string) {
  fake.hooks.intercept = (operation, path) => {
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

// Tabs on two builds share the cache during a deploy. The older tab's scan
// snapshots the keys after the newer tab wrote a file the older manifest does
// not list, and before the newer tab's marker lands; deleting that file then
// would leave a marker the newer manifest trusts over a missing file.
describe.each([
  ['with Web Locks', openNewTab],
  ['without Web Locks', () => vi.stubGlobal('navigator', {})],
])('two tabs on different builds %s', (_label, setUpLocks) => {
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
    fake.hooks.intercept = async (operation, path) => {
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

it('takes the shared coloring-pack lock for a scan', async () => {
  await createWebColoringPackStore().installed(released);

  expect(navigator.locks.request).toHaveBeenCalledWith(
    COLORING_PACK_LOCK_NAME,
    expect.any(Function)
  );
});
