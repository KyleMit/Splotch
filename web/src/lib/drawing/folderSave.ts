import { browser } from '$app/environment';

// Silent folder save for the web target. On desktop Chromium (in-tab or
// installed PWA) the File System Access API lets the parent pick a destination
// folder once — behind an optional "Save to Folder" toggle in the Parent Center
// — after which each PNG is written straight into it with no download shelf.
// Where the API is missing (Firefox, Safari, mobile) the toggle is hidden and
// saves fall back to a normal download. Purely additive: the default download
// path is unchanged, and nothing here touches the native gallery save.
//
// The chosen directory handle isn't plain data — JSON.stringify(handle) is "{}"
// (its binding to a real OS directory plus the permission grant live in browser
// internals, not enumerable fields), so it can't be serialized to a string. It's
// only persistable via the structured clone algorithm, and among web storage
// only IndexedDB runs that — localStorage is a string-only map, which is why
// lib/storage.ts can't back this. Hence the idb dependency, loaded lazily like
// secureStorage.ts.

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

/** Whether a destination folder has already been chosen and remembered. */
export async function hasSaveFolder(): Promise<boolean> {
  if (!folderSaveSupported()) return false;
  return (await loadHandle()) !== null;
}

// Prompt the parent to pick a destination folder and remember it. Must run
// inside a user gesture (the toggle click) — both showDirectoryPicker and
// requestPermission need transient activation. Returns true once a readwrite
// folder is chosen and granted; false if the parent cancels.
export async function chooseSaveFolder(): Promise<boolean> {
  if (!folderSaveSupported()) return false;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
    await storeHandle(handle);
    return true;
  } catch {
    // AbortError (parent cancelled the picker) or any other failure → not chosen.
    return false;
  }
}

/** Forget the chosen folder, so re-enabling the toggle prompts for a new one. */
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
// false tells the caller to fall back to a download. Never opens the folder
// picker — folder selection is toggle-driven. `allowPrompt` only lets a
// user-initiated save re-confirm a write permission the browser dropped since
// the folder was chosen (in-tab origins lose it between sessions); background
// saves leave it false and degrade silently to a download.
export async function saveBlobToFolder(
  blob: Blob,
  filename: string,
  opts?: { allowPrompt?: boolean }
): Promise<boolean> {
  if (!folderSaveSupported()) return false;
  const allowPrompt = opts?.allowPrompt ?? false;

  try {
    const handle = await loadHandle();
    if (!handle) return false;

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
    // re-enabling the toggle prompts for a fresh one. AbortError and any other
    // write failure just fall back to a download.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await clearSaveFolder();
    }
    return false;
  }
}
