import { browser } from '$app/environment';

// Silent folder save for the web target. On desktop Chromium (in-tab or
// installed PWA) the File System Access API lets the parent pick a destination
// folder once, after which each PNG is written straight into it with no
// download shelf. The chosen directory handle is structured-cloneable, so it
// persists in IndexedDB (it can't live in localStorage, which is string-only —
// that's why lib/storage.ts can't back this). Where the API is missing
// (Firefox, Safari, mobile) the caller falls back to a normal download.

const DB_NAME = 'splotch-fs';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'saveDir';

let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
function getDb(): Promise<import('idb').IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) =>
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        },
      })
    );
  }
  return dbPromise;
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDb();
  return (await db.get(STORE, HANDLE_KEY)) ?? null;
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  await db.put(STORE, handle, HANDLE_KEY);
}

/** Whether the browser exposes the File System Access directory picker. */
export function folderSaveSupported(): boolean {
  return browser && 'showDirectoryPicker' in window;
}

/** Forget the chosen folder, so the next user-initiated save re-prompts. */
export async function clearSaveFolder(): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDb();
    await db.delete(STORE, HANDLE_KEY);
  } catch {
    // best-effort
  }
}

// Write `blob` as `filename` into the chosen folder. Returns true once written;
// false tells the caller to fall back to a download. `allowPrompt` gates the two
// steps that need transient user activation (folder picker, permission prompt),
// so background saves stay silent until a folder is already chosen + granted.
export async function saveBlobToFolder(
  blob: Blob,
  filename: string,
  opts?: { allowPrompt?: boolean }
): Promise<boolean> {
  if (!folderSaveSupported()) return false;
  const allowPrompt = opts?.allowPrompt ?? false;

  try {
    let handle = await loadHandle();
    if (!handle) {
      if (!allowPrompt) return false;
      handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
      await storeHandle(handle);
    }

    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && allowPrompt) {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (permission !== 'granted') return false;

    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err) {
    // The folder was moved/removed since we stored it: drop the stale handle so
    // the next user-initiated save re-prompts. AbortError (picker cancelled) and
    // any other write failure just fall back to a download.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await clearSaveFolder();
    }
    return false;
  }
}
