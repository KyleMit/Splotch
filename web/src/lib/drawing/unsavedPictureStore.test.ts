import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeldPicture } from './unsavedPictureStore';

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

const held: HeldPicture[] = [
  {
    blob: new Blob(['picture'], { type: 'image/png' }),
    baseName: 'splotch',
    outcome: 'denied',
    signature: 'abc',
  },
];

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

  it('records the flag only after the pictures are stored, and reads the same bytes back', async () => {
    const store = createUnsavedPictureStore();
    mocks.put.mockImplementation(async () => expect(mocks.flag).toBe(false));

    await store.write(held);
    const [, stored] = mocks.put.mock.calls[0];
    mocks.get.mockResolvedValue(stored);

    expect(mocks.flag).toBe(true);
    expect(stored[0].bytes).toBeInstanceOf(ArrayBuffer);
    const restored = await store.read();
    expect(restored).toMatchObject([{ baseName: 'splotch', outcome: 'denied', signature: 'abc' }]);
    await expect(restored?.[0].blob.text()).resolves.toBe('picture');
    expect(restored?.[0].blob.type).toBe('image/png');
  });

  it('clears the flag before deleting an emptied record', async () => {
    const store = createUnsavedPictureStore();
    mocks.flag = true;
    mocks.delete.mockImplementation(async () => expect(mocks.flag).toBe(false));

    await store.write([]);

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
