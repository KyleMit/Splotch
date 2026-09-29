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

  it('restores only the entries in the shape it writes, never a picture of missing bytes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createUnsavedPictureStore();
    await store.write(held);
    const [, [current]] = mocks.put.mock.calls[0];
    const { bytes: _bytes, ...withoutBytes } = current;
    mocks.get.mockResolvedValue([
      { blob: held[0].blob, baseName: 'splotch', outcome: 'denied', signature: null },
      withoutBytes,
      { ...current, outcome: 'photos' },
      current,
    ]);

    const restored = await store.read();

    expect(restored).toHaveLength(1);
    await expect(restored?.[0].blob.text()).resolves.toBe('picture');
    expect(error).toHaveBeenCalledWith('Skipped 3 held picture(s) in an unrecognized shape');
  });

  it('skips a record that is not a list of pictures instead of failing the read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.flag = true;
    mocks.get.mockResolvedValue({ pictures: 'legacy' });

    await expect(createUnsavedPictureStore().read()).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith('Skipped 1 held picture(s) in an unrecognized shape');
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('rejects a read IndexedDB refuses rather than report nothing held', async () => {
    mocks.flag = true;
    const blocked = new Error('blocked');
    mocks.get.mockRejectedValue(blocked);

    await expect(createUnsavedPictureStore().read()).rejects.toBe(blocked);
  });

  it('logs a write IndexedDB refuses instead of failing the save flow', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.put.mockRejectedValue(new Error('quota'));

    await expect(createUnsavedPictureStore().write(held)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Keeping unsaved pictures failed:', expect.any(Error));
  });
});
