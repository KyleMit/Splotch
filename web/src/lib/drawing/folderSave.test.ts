import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory stand-in for the idb-backed handle store, so the test exercises our
// dispatch/permission logic without depending on happy-dom's IndexedDB.
const store = new Map<string, unknown>();
vi.mock('idb', () => ({
  openDB: async () => ({
    get: async (_s: string, k: string) => store.get(k),
    put: async (_s: string, v: unknown, k: string) => void store.set(k, v),
    delete: async (_s: string, k: string) => void store.delete(k),
  }),
}));

import { folderSaveSupported, saveBlobToFolder } from './folderSave';

const blob = new Blob(['png'], { type: 'image/png' });

function makeHandle(permission: PermissionState = 'granted') {
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const fileHandle = { createWritable: vi.fn(async () => writable) };
  const handle = {
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    getFileHandle: vi.fn(async () => fileHandle),
  };
  return { handle, fileHandle, writable };
}

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.restoreAllMocks();
});

describe('folderSaveSupported', () => {
  it('is false when showDirectoryPicker is absent', () => {
    expect(folderSaveSupported()).toBe(false);
  });

  it('is true when showDirectoryPicker exists', () => {
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = () => {};
    expect(folderSaveSupported()).toBe(true);
  });
});

describe('saveBlobToFolder', () => {
  it('returns false (caller downloads) when the API is unsupported', async () => {
    expect(await saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
  });

  it('does not open the picker for a background save with no stored folder', async () => {
    const picker = vi.fn();
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = picker;

    expect(await saveBlobToFolder(blob, 'a.png', { allowPrompt: false })).toBe(false);
    expect(picker).not.toHaveBeenCalled();
  });

  it('picks a folder once then writes the blob when permission is granted', async () => {
    const { handle, fileHandle, writable } = makeHandle('granted');
    const picker = vi.fn(async () => handle);
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = picker;

    expect(await saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(true);
    expect(picker).toHaveBeenCalledOnce();
    expect(handle.getFileHandle).toHaveBeenCalledWith('a.png', { create: true });
    expect(fileHandle.createWritable).toHaveBeenCalledOnce();
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it('reuses a stored folder silently on subsequent saves', async () => {
    const { handle } = makeHandle('granted');
    store.set('saveDir', handle);
    const picker = vi.fn();
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = picker;

    expect(await saveBlobToFolder(blob, 'b.png', { allowPrompt: false })).toBe(true);
    expect(picker).not.toHaveBeenCalled();
    expect(handle.getFileHandle).toHaveBeenCalledWith('b.png', { create: true });
  });

  it('falls back to download when permission is denied and cannot prompt', async () => {
    const { handle, fileHandle } = makeHandle('denied');
    store.set('saveDir', handle);
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi.fn();

    expect(await saveBlobToFolder(blob, 'c.png', { allowPrompt: false })).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(fileHandle.createWritable).not.toHaveBeenCalled();
  });

  it('clears a stale handle so the next save re-prompts', async () => {
    const { handle } = makeHandle('granted');
    handle.getFileHandle = vi.fn(async () => {
      throw new DOMException('gone', 'NotFoundError');
    });
    store.set('saveDir', handle);
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi.fn();

    expect(await saveBlobToFolder(blob, 'd.png', { allowPrompt: false })).toBe(false);
    expect(store.has('saveDir')).toBe(false);
  });
});
