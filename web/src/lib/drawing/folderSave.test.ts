import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory stand-in for the idb-backed handle store, so the test exercises our
// dispatch/permission logic without depending on happy-dom's IndexedDB. The
// module caches the handle and the chosen-flag lives in localStorage, so each
// test re-imports a fresh module instance via vi.resetModules().
const store = new Map<string, unknown>();
let openDbCalls = 0;
let failIdb = false;
vi.mock('idb', () => ({
  openDB: async () => {
    openDbCalls++;
    if (failIdb) throw new Error('idb unavailable');
    return {
      get: async (_s: string, k: string) => store.get(k),
      put: async (_s: string, v: unknown, k: string) => void store.set(k, v),
      delete: async (_s: string, k: string) => void store.delete(k),
    };
  },
}));

type FolderSave = typeof import('./folderSave');
let folderSave: FolderSave;

const blob = new Blob(['png'], { type: 'image/png' });

function makeHandle(permission: PermissionState = 'granted', name = 'My Pictures') {
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const fileHandle = { createWritable: vi.fn(async () => writable) };
  const files = new Set<string>();
  const handle = {
    name,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    getFileHandle: vi.fn(async (file: string, opts?: { create?: boolean }) => {
      if (opts?.create) {
        files.add(file);
        return fileHandle;
      }
      if (!files.has(file)) throw new DOMException('missing', 'NotFoundError');
      return fileHandle;
    }),
  };
  return { handle, fileHandle, writable, files };
}

function seedFolder(handle: unknown) {
  store.set('saveDir', handle);
  localStorage.setItem('splotch-save-folder-chosen', 'true');
}

function setPicker(impl: () => unknown) {
  (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = impl;
}

beforeEach(async () => {
  store.clear();
  localStorage.clear();
  openDbCalls = 0;
  failIdb = false;
  vi.resetModules();
  folderSave = await import('./folderSave');
});

afterEach(() => {
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.restoreAllMocks();
});

describe('folderSaveSupported', () => {
  it('is false when showDirectoryPicker is absent', () => {
    expect(folderSave.folderSaveSupported()).toBe(false);
  });

  it('is true when showDirectoryPicker exists', () => {
    setPicker(() => {});
    expect(folderSave.folderSaveSupported()).toBe(true);
  });
});

describe('chooseSaveFolder', () => {
  it('returns null when the API is unsupported', async () => {
    expect(await folderSave.chooseSaveFolder()).toBeNull();
  });

  it('remembers a granted folder and returns its name', async () => {
    const { handle } = makeHandle('granted', 'Splotch Art');
    setPicker(vi.fn(async () => handle));

    expect(await folderSave.chooseSaveFolder()).toBe('Splotch Art');
    expect(handle.requestPermission).toHaveBeenCalledOnce();
    expect(store.get('saveDir')).toBe(handle);
    expect(await folderSave.getSaveFolderName()).toBe('Splotch Art');
  });

  it('does not remember the folder when permission is denied', async () => {
    const { handle } = makeHandle('denied');
    setPicker(vi.fn(async () => handle));

    expect(await folderSave.chooseSaveFolder()).toBeNull();
    expect(await folderSave.getSaveFolderName()).toBeNull();
  });

  it('returns null when the parent cancels the picker', async () => {
    setPicker(
      vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      })
    );

    expect(await folderSave.chooseSaveFolder()).toBeNull();
    expect(await folderSave.getSaveFolderName()).toBeNull();
  });

  it('keeps the folder for the session when persisting it fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    failIdb = true;
    const { handle, writable } = makeHandle('granted', 'Splotch Art');
    setPicker(vi.fn(async () => handle));

    expect(await folderSave.chooseSaveFolder()).toBe('Splotch Art');
    expect(await folderSave.getSaveFolderName()).toBe('Splotch Art');
    expect(await folderSave.saveBlobToFolder(blob, 'a.png', { allowPrompt: false })).toBe(true);
    expect(writable.write).toHaveBeenCalledWith(blob);
  });
});

describe('getSaveFolderName', () => {
  it('is null when no folder is stored', async () => {
    setPicker(vi.fn());
    expect(await folderSave.getSaveFolderName()).toBeNull();
  });

  it('returns the stored folder name', async () => {
    const { handle } = makeHandle('granted', 'Kids Drawings');
    seedFolder(handle);
    setPicker(vi.fn());
    expect(await folderSave.getSaveFolderName()).toBe('Kids Drawings');
  });

  it('never opens IndexedDB when no folder was ever chosen', async () => {
    setPicker(vi.fn());
    expect(await folderSave.getSaveFolderName()).toBeNull();
    expect(await folderSave.saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
    expect(openDbCalls).toBe(0);
  });

  it('degrades to no-folder when IndexedDB is unavailable', async () => {
    failIdb = true;
    localStorage.setItem('splotch-save-folder-chosen', 'true');
    setPicker(vi.fn());
    expect(await folderSave.getSaveFolderName()).toBeNull();
    expect(await folderSave.saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
  });
});

describe('saveBlobToFolder', () => {
  it('returns false (caller downloads) when the API is unsupported', async () => {
    expect(await folderSave.saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
  });

  it('never opens the folder picker, even with allowPrompt and no stored folder', async () => {
    const picker = vi.fn();
    setPicker(picker);

    expect(await folderSave.saveBlobToFolder(blob, 'a.png', { allowPrompt: true })).toBe(false);
    expect(picker).not.toHaveBeenCalled();
  });

  it('writes the blob into a stored, granted folder', async () => {
    const { handle, fileHandle, writable } = makeHandle('granted');
    seedFolder(handle);
    setPicker(vi.fn());

    expect(await folderSave.saveBlobToFolder(blob, 'b.png', { allowPrompt: false })).toBe(true);
    expect(handle.getFileHandle).toHaveBeenCalledWith('b.png', { create: true });
    expect(fileHandle.createWritable).toHaveBeenCalledOnce();
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it('reads the handle from IndexedDB once, not per save', async () => {
    const { handle } = makeHandle('granted');
    seedFolder(handle);
    setPicker(vi.fn());

    expect(await folderSave.saveBlobToFolder(blob, 'b.png', { allowPrompt: false })).toBe(true);
    expect(await folderSave.saveBlobToFolder(blob, 'c.png', { allowPrompt: false })).toBe(true);
    expect(openDbCalls).toBe(1);
  });

  it('suffixes the filename instead of overwriting an existing file', async () => {
    const { handle, files, writable } = makeHandle('granted');
    files.add('b.png');
    files.add('b (1).png');
    seedFolder(handle);
    setPicker(vi.fn());

    expect(await folderSave.saveBlobToFolder(blob, 'b.png', { allowPrompt: false })).toBe(true);
    expect(handle.getFileHandle).toHaveBeenCalledWith('b (2).png', { create: true });
    expect(writable.write).toHaveBeenCalledWith(blob);
  });

  it('re-confirms a lapsed permission on a user-initiated save', async () => {
    const { handle } = makeHandle('granted');
    handle.queryPermission = vi.fn(async () => 'prompt' as PermissionState);
    seedFolder(handle);
    setPicker(vi.fn());

    expect(await folderSave.saveBlobToFolder(blob, 'c.png', { allowPrompt: true })).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledOnce();
  });

  it('falls back to download when permission is dropped and cannot prompt', async () => {
    const { handle, fileHandle } = makeHandle('prompt');
    seedFolder(handle);
    setPicker(vi.fn());

    expect(await folderSave.saveBlobToFolder(blob, 'd.png', { allowPrompt: false })).toBe(false);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(fileHandle.createWritable).not.toHaveBeenCalled();
  });

  it('clears a stale handle and notifies, so the UI stops naming the folder', async () => {
    const { handle } = makeHandle('granted');
    handle.getFileHandle = vi.fn(async () => {
      throw new DOMException('gone', 'NotFoundError');
    });
    seedFolder(handle);
    setPicker(vi.fn());
    const cleared = vi.fn();
    folderSave.onSaveFolderCleared(cleared);

    expect(await folderSave.saveBlobToFolder(blob, 'e.png', { allowPrompt: false })).toBe(false);
    expect(store.has('saveDir')).toBe(false);
    expect(cleared).toHaveBeenCalledOnce();
    expect(await folderSave.getSaveFolderName()).toBeNull();
  });
});
