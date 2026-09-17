import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeldPictures } from './unsavedPictureStore';

const mocks = vi.hoisted(() => ({
  flag: false,
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('$lib/idb', () => ({
  idbKvStore: () => ({ get: mocks.get, put: mocks.put, delete: mocks.delete }),
}));
vi.mock('$lib/storage', () => ({
  STORAGE_KEYS: { unsavedPicturesHeld: 'splotch-unsaved-pictures-held' },
  readBool: () => mocks.flag,
  writeBool: (_key: string, value: boolean) => {
    mocks.flag = value;
  },
  removeKey: () => {
    mocks.flag = false;
  },
}));

import { createUnsavedPictureStore } from './unsavedPictureStore';

const held: HeldPictures = {
  outcome: 'denied',
  pictures: [{ blob: new Blob(['picture']), baseName: 'splotch', signature: 'abc' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flag = false;
  mocks.put.mockResolvedValue(undefined);
  mocks.delete.mockResolvedValue(undefined);
});

describe('createUnsavedPictureStore', () => {
  it('never opens IndexedDB when no pictures were recorded as held', async () => {
    await expect(createUnsavedPictureStore().read()).resolves.toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('records the flag only after the pictures are stored, and reads them back', async () => {
    const store = createUnsavedPictureStore();
    mocks.put.mockImplementation(async () => expect(mocks.flag).toBe(false));

    await store.write(held);
    mocks.get.mockResolvedValue(held);

    expect(mocks.flag).toBe(true);
    await expect(store.read()).resolves.toBe(held);
  });

  it('clears the flag before deleting an emptied record', async () => {
    const store = createUnsavedPictureStore();
    mocks.flag = true;
    mocks.delete.mockImplementation(async () => expect(mocks.flag).toBe(false));

    await store.write({ outcome: 'failed', pictures: [] });

    expect(mocks.delete).toHaveBeenCalledOnce();
  });

  it('degrades to nothing held when IndexedDB is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.flag = true;
    mocks.get.mockRejectedValue(new Error('blocked'));
    mocks.put.mockRejectedValue(new Error('quota'));
    const store = createUnsavedPictureStore();

    await expect(store.read()).resolves.toBeNull();
    await expect(store.write(held)).resolves.toBeUndefined();
  });
});
