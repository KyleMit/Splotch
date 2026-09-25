import { afterEach, beforeEach, vi } from 'vitest';
import { coloringPackCacheName } from './cacheKeys';
import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

const ORIGIN = 'https://splotch.test';
export const DIGESTS = {
  a: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
  b: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
  c: '2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc6',
} as const;
export type Content = keyof typeof DIGESTS;

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

export type CacheOperation = 'put' | 'delete' | 'keys';
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
      has: async (name: string) => stores.has(name),
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
export function createFakeLockManager() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: vi.fn((_name: string, work: () => Promise<unknown>) => {
      const result = tail.then(work);
      tail = result.catch(() => {});
      return result;
    }),
  };
}

export function book(id: string, pages: [name: string, content: Content][]) {
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

export function openNewTab() {
  vi.stubGlobal('navigator', { locks: createFakeLockManager() });
}

export const released: ResolvedColoringPackManifest = {
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
export const [dinosaur] = released.books;
export const dinosaurChanged = book('dinosaur', [
  ['first', 'a'],
  ['second', 'c'],
]);
export const LEGACY_CACHE_NAME = 'coloring-packs-v1-1.2.3-test-compact';
export const currentCache = coloringPackCacheName(released);

export function installedIds(packs: { id: string }[]): string[] {
  return packs.map((pack) => pack.id);
}

// Registers per-test hooks, so each test file calls it once at its top level
// and reads `fake` through the returned getter to see that test's instance.
export function useWebStoreWorld() {
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

  beforeEach(() => {
    fake = createFakeCacheStorage();
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

  return {
    get fake() {
      return fake;
    },
    deploy(books: ResolvedColoringPackBookManifest[]): ResolvedColoringPackManifest {
      const manifest = { ...released, appVersion: '1.2.4-test', books };
      serve(manifest);
      return manifest;
    },
    async seedCache(name: string, entries: Record<string, string>) {
      const cache = await fake.storage.open(name);
      for (const [path, body] of Object.entries(entries)) await cache.put(path, new Response(body));
    },
    cachedPaths(name: string): string[] {
      return [...(fake.entries(name)?.keys() ?? [])];
    },
    async servedByWorker(path: string): Promise<string | undefined> {
      return (await fake.storage.match(path))?.text();
    },
  };
}
