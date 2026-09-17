import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flag: false,
  durableRestore: [] as Array<() => void>,
  stored: [
    {
      bytes: new ArrayBuffer(4),
      type: 'image/png',
      baseName: 'splotch',
      outcome: 'denied',
      signature: 'held-before-relaunch',
    },
  ],
}));

vi.mock('./overlayDemand', () => ({ demandOverlay: vi.fn() }));
vi.mock('$lib/idb', () => ({
  idbKvStore: () => ({
    get: async () => mocks.stored,
    put: async () => {},
    delete: async () => {},
  }),
}));
vi.mock('$lib/storage', () => ({
  STORAGE_KEYS: { unsavedPicturesHeld: 'splotch-unsaved-pictures-held' },
  readBool: () => mocks.flag,
  writeBool: () => {},
  removeKey: () => {},
  onDurableRestore: (callback: () => void) => {
    mocks.durableRestore.push(callback);
    return () => {};
  },
}));

// The native WebView can evict the localStorage flag while Capacitor Preferences keeps it, so the
// boot-time restore finds nothing until durable hydration puts the flag back.
it('restores held pictures once durable hydration brings back an evicted flag', async () => {
  const { saveFailureState } = await import('./saveFailure.svelte');
  await vi.waitFor(() => expect(mocks.durableRestore).toHaveLength(1));
  expect(saveFailureState.outcome).toBeNull();

  mocks.flag = true;
  mocks.durableRestore.forEach((restore) => restore());

  await vi.waitFor(() => expect(saveFailureState.pictureCount).toBe(1));
  expect(saveFailureState.outcome).toBe('denied');
});
