import { browser } from '$app/environment';

// Silent folder save for the web target. On desktop Chromium (in-tab or
// installed PWA) the File System Access API lets the parent pick a destination
// folder once — from the Parent Center, behind a deliberate toggle — after which
// each PNG is written straight into it with no download shelf. The chosen
// directory handle is structured-cloneable, so it persists in IndexedDB (it
// can't live in localStorage, which is string-only — that's why lib/storage.ts
// can't back this). Where the API is missing (Firefox, Safari, mobile) the
// toggle is hidden and saves fall back to a normal download.

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

/** The name of the remembered destination folder, or null if none is set. */
export async function getSaveFolderName(): Promise<string | null> {
  if (!folderSaveSupported()) return null;
  return (await loadHandle())?.name ?? null;
}

// Prompt the parent to pick a destination folder and remember it. Must run
// inside a user gesture (the toggle/Change-folder click) — both
// showDirectoryPicker and requestPermission need transient activation. Returns
// the chosen folder's name once granted; null if the parent cancels.
export async function chooseSaveFolder(): Promise<string | null> {
  if (!folderSaveSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    await storeHandle(handle);
    return handle.name;
  } catch {
    // AbortError (parent cancelled the picker) or any other failure → not chosen.
    return null;
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
// false tells the caller to fall back to a download. `allowPrompt` gates the
// steps that need transient user activation: when set (a user-initiated save) we
// pick a folder if none is chosen yet, and re-confirm a permission the browser
// dropped since (in-tab origins lose it between sessions). Background saves leave
// it false and degrade silently to a download until a folder is set up.
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
      // No folder chosen yet — prompt for one on a user-initiated save (the
      // gesture that reached here keeps the picker allowed), so a save still
      // works if the handle was lost. Background saves can't prompt and fall
      // back to a download.
      if (!allowPrompt || !(await chooseSaveFolder())) return false;
      handle = await loadHandle();
      if (!handle) return false;
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
    // re-enabling the toggle prompts for a fresh one. AbortError and any other
    // write failure just fall back to a download.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await clearSaveFolder();
    }
    return false;
  }
}
