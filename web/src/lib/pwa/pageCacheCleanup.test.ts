import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_PAGES_CACHE_NAME,
  PAGES_CACHE_NAME,
  pageCacheCleanupScript,
} from './pageCacheCleanup';

afterEach(() => vi.unstubAllGlobals());

// Runs the emitted script the way the worker does: evaluated with nothing from
// this module in scope, then driven through its activate listener.
async function activateWithCleanupScript() {
  let listener: ((event: { waitUntil(work: Promise<unknown>): void }) => void) | undefined;
  const self = {
    addEventListener: (type: string, callback: typeof listener) => {
      if (type === 'activate') listener = callback;
    },
  };
  Function('self', pageCacheCleanupScript())(self);
  if (!listener) throw new Error('the cleanup script registered no activate listener');
  let work: Promise<unknown> | undefined;
  listener({ waitUntil: (promise) => (work = promise) });
  await work;
}

describe('page-cache cleanup on activation', () => {
  it('deletes only the cache earlier workers wrote pages to', async () => {
    const names = new Set([LEGACY_PAGES_CACHE_NAME, PAGES_CACHE_NAME, 'workbox-precache-v2']);
    const remove = vi.fn(async (name: string) => names.delete(name));
    vi.stubGlobal('caches', { delete: remove });

    await activateWithCleanupScript();

    expect(remove).toHaveBeenCalledOnce();
    expect([...names]).toEqual([PAGES_CACHE_NAME, 'workbox-precache-v2']);
  });
});
