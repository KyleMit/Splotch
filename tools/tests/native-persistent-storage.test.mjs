import { afterEach, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../../experiments/native-architecture/src/platform/persistentStorage.web.ts';

afterEach(() => vi.unstubAllGlobals());

// Shipping's requestPersistentStorage (web/src/lib/idb.ts): one best-effort ask, whose refusal,
// failure or absence never fails the save that made it.
it('asks the browser once and reports its answer', async () => {
  const persist = vi.fn(async () => true);
  vi.stubGlobal('navigator', { storage: { persist } });
  await expect(requestPersistentStorage()).resolves.toBe(true);
  expect(persist).toHaveBeenCalledOnce();
});

it('answers false where the browser refuses, throws or has no storage manager', async () => {
  vi.stubGlobal('navigator', { storage: { persist: async () => false } });
  await expect(requestPersistentStorage()).resolves.toBe(false);
  vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('denied')) } });
  await expect(requestPersistentStorage()).resolves.toBe(false);
  vi.stubGlobal('navigator', {});
  await expect(requestPersistentStorage()).resolves.toBe(false);
});
