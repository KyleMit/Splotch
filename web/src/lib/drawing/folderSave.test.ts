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

import {
  folderSaveSupported,
  hasSaveFolder,
  chooseSaveFolder,
  saveBlobToFolder,
} from './folderSave';

const blob = new Blob(['png'], { type: 'image/png' });

function makeHandle(permission: PermissionState = 'granted') {
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const fileHandle = { createWritable: vi.fn(async () => writable) };
  const handle = {
    name: 'My Pictures',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    getFileHandle: vi.fn(async () => fileHandle),
  };
  return { handle, fileHandle, writable };
}

function setPicker(impl: () => unknown) {
  (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = impl;
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
    setPicker(() => {});
    expect(folderSaveSupported()).toBe(true);
  });
});

describe('chooseSaveFolder', () => {
  it('returns false when the API is unsupported', async () => {
    expect(await chooseSaveFolder()).toBe(false);
  });

  it('remembers a granted folder', async () => {
    const { handle } = makeHandle('granted');
    setPicker(vi.fn(async () => handle));

    expect(await chooseSaveFolder()).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledOnce();
    expect(await hasSaveFolder()).toBe(true);
  });

  it('does not remember the folder when permission is denied', async () => {
    const { handle } = makeHandle('denied');
    setPicker(vi.fn(async () => handle));

    expect(await chooseSaveFolder()).toBe(false);
    expect(await hasSaveFolder()).toBe(false);
  });

  it('returns false when the parent cancels the picker', async () => {
    setPicker(
      vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      })
    );

    expect(await chooseSaveFolder()).toBe(false);
    expect(await hasSaveFolder()).toBe(false);
  });
});

describe('saveBlobToFolder', () => {
  it('returns false (caller downloads) when the API is unsupported', async () => {
    expect(await saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
  });

  it('never opens the folder picker, even with allowPrompt and no stored folder', async () => {
    const picker = vi.fn();
    setPicker(picker);

    expect(await saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
    expect(picker).not.toHaveBeenCalled();
  });

  it('writes the blob into a stored, granted folder', async () => {
    const { handle, fileHandle, writable } = makeHandle('granted');
    store.set('saveDir', handle);
    setPicker(vi.fn());

    expect(await saveBlobToFolder(blob, 'b.png', { allowPrompt: false })).toBe(true);
    expect(handle.getFileHandle).toHaveBeenCalledWith('b.png', { create: true });
    expect(fileHandle.createWritable).toHaveBeenCalledOnce();
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it('re-confirms a lapsed permission on a user-initiated save', async () => {
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      })),
    };
    store.set('saveDir', handle);
    setPicker(vi.fn());

    expect(await saveBlobToFolder(blob, 'c.png', { allowPrompt: true })).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledOnce();
  });

  it('falls back to download when permission is dropped and cannot prompt', async () => {
    const { handle, fileHandle } = makeHandle('prompt');
    store.set('saveDir', handle);
    setPicker(vi.fn());

    expect(await saveBlobToFolder(blob, 'd.png', { allowPrompt: false })).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(fileHandle.createWritable).not.toHaveBeenCalled();
  });

  it('clears a stale handle so re-enabling re-picks', async () => {
    const { handle } = makeHandle('granted');
    handle.getFileHandle = vi.fn(async () => {
      throw new DOMException('gone', 'NotFoundError');
    });
    store.set('saveDir', handle);
    setPicker(vi.fn());

    expect(await saveBlobToFolder(blob, 'e.png', { allowPrompt: false })).toBe(false);
    expect(store.has('saveDir')).toBe(false);
  });
});
