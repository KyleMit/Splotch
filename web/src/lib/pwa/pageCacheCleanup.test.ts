import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGES_CACHE_NAME, pageCacheCleanupScript } from './pageCacheCleanup';
import { CACHE_BUST_VERSION_PARAM } from './versionEndpoint';

afterEach(() => vi.unstubAllGlobals());

const origin = 'https://splotch.art';

function stubCacheStorage(names: Record<string, string[]>) {
  const stores = new Map(
    Object.entries(names).map(([name, paths]) => [
      name,
      new Set(paths.map((path) => new URL(path, origin).href)),
    ])
  );
  const open = vi.fn(async (name: string) => {
    const store = stores.get(name) ?? new Set<string>();
    stores.set(name, store);
    return {
      keys: async () => [...store].map((url) => new Request(url)),
      delete: async (request: Request) => store.delete(request.url),
    };
  });
  vi.stubGlobal('caches', { has: async (name: string) => stores.has(name), open });
  const paths = (name: string) =>
    [...(stores.get(name) ?? [])].map((url) => {
      const { pathname, search } = new URL(url);
      return pathname + search;
    });
  return { open, paths };
}

// Runs the emitted script the way the worker does: evaluated with nothing from
// this module in scope, then driven through its activate listener.
async function activateWithCleanupScript() {
  let listener: ((event: { waitUntil(work: Promise<void>): void }) => void) | undefined;
  const self = {
    addEventListener: (type: string, callback: typeof listener) => {
      if (type === 'activate') listener = callback;
    },
  };
  Function('self', pageCacheCleanupScript(CACHE_BUST_VERSION_PARAM))(self);
  if (!listener) throw new Error('the cleanup script registered no activate listener');
  let work: Promise<void> | undefined;
  listener({ waitUntil: (promise) => (work = promise) });
  await work;
}

describe('page-cache cleanup on activation', () => {
  it('deletes the drawing app and stale-page recovery entries and keeps the other pages', async () => {
    const storage = stubCacheStorage({
      [PAGES_CACHE_NAME]: [
        '/',
        '/index.html',
        `/?${CACHE_BUST_VERSION_PARAM}=1.4.0`,
        `/?${CACHE_BUST_VERSION_PARAM}=1.5.0`,
        `/privacy?${CACHE_BUST_VERSION_PARAM}=1.5.0`,
        '/privacy',
        '/changelog',
      ],
      'workbox-precache-v2': ['/?app-shell-build=active', '/index.html'],
    });

    await activateWithCleanupScript();

    expect(storage.paths(PAGES_CACHE_NAME)).toEqual(['/privacy', '/changelog']);
    expect(storage.paths('workbox-precache-v2')).toEqual([
      '/?app-shell-build=active',
      '/index.html',
    ]);
  });

  it('does not create the page cache on a device that never cached a page', async () => {
    const storage = stubCacheStorage({});

    await activateWithCleanupScript();

    expect(storage.open).not.toHaveBeenCalled();
  });
});
