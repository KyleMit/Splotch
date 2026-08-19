import type { DBSchema } from 'idb';
import { browser } from '$app/environment';
import { STORAGE_KEYS, readBool, writeBool, removeKey } from '$lib/storage';
import { idbKvStore, requestPersistentStorage } from '$lib/idb';

// Silent folder save for the web target. On desktop Chromium (in-tab or
// installed PWA) the File System Access API lets the parent optionally pick a
// destination folder in Settings; while one is set, each web save is
// written straight into it with no download shelf. It's purely a convenience and
// fully decoupled from the save actions: with no folder (or after clearing it)
// saves just go to the browser's default download location, and the API being
// missing (Firefox, Safari, mobile) is the same as having no folder. Nothing
// here touches the native gallery save.
//
// The chosen directory handle isn't plain data — JSON.stringify(handle) is "{}"
// (its binding to a real OS directory plus the permission grant live in browser
// internals, not enumerable fields), so it can't be serialized to a string. It's
// only persistable via the structured clone algorithm, and among web storage
// only IndexedDB runs that — localStorage is a string-only map, which is why
// lib/storage.ts can't back this. A localStorage flag does record *that* a
// folder was chosen, so the common no-folder state never loads the idb chunk or
// opens IndexedDB just to find nothing.

const DB_NAME = 'splotch-fs';
const STORE = 'handles';
const HANDLE_KEY = 'saveDir';

interface FolderSaveDb extends DBSchema {
  handles: {
    key: string;
    value: FileSystemDirectoryHandle;
  };
}

const handleStore = idbKvStore<FolderSaveDb>(DB_NAME, STORE);

// In-memory promise for the stored handle, so only the first save of a session
// touches IndexedDB.
let handlePromise: Promise<FileSystemDirectoryHandle | null> | null = null;

let folderClearedListener: (() => void) | null = null;

// Lets whoever mirrors the folder into reactive state (settings.svelte.ts) hear
// about the handle being dropped from *inside* a save (stale folder), which
// would otherwise leave the UI naming a folder that no longer receives saves.
// This is intentionally single-subscriber: later registrations replace earlier ones.
export function setSaveFolderClearedListener(listener: () => void) {
  folderClearedListener = listener;
}

async function readHandleFromIdb(): Promise<FileSystemDirectoryHandle | null> {
  if (!readBool(STORAGE_KEYS.saveFolderChosen, false)) return null;
  try {
    return (await handleStore.get(HANDLE_KEY)) ?? null;
  } catch {
    // IndexedDB unavailable (corruption, embedded context, private mode):
    // behave as if no folder is set, so saves degrade to plain downloads.
    return null;
  }
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const requestedHandlePromise = (handlePromise ??= readHandleFromIdb());
  const handle = await requestedHandlePromise;
  return requestedHandlePromise === handlePromise ? handle : loadHandle();
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await handleStore.put(HANDLE_KEY, handle);
}

/** Whether the browser exposes the File System Access directory picker. */
export function folderSaveSupported(): boolean {
  return browser && 'showDirectoryPicker' in window;
}

/** The name of the remembered destination folder, or null if none is set. */
export async function getSaveFolderName(): Promise<string | null> {
  if (!folderSaveSupported()) return null;
  return (await loadHandle())?.name ?? null;
}

// Prompt the parent to pick a destination folder and remember it. Must run
// inside a user gesture (the Choose/Change-folder click) — both
// showDirectoryPicker and requestPermission need transient activation. Returns
// the chosen folder's name once granted; null if the parent cancels or denies.
export async function chooseSaveFolder(): Promise<string | null> {
  if (!folderSaveSupported()) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.warn('Choosing a save folder failed:', err);
    return null;
  }
  handlePromise = Promise.resolve(handle);
  writeBool(STORAGE_KEYS.saveFolderChosen, true);
  try {
    await storeHandle(handle);
    // The Choose/Change-folder click is the opt-in boundary; hydration must not
    // turn a remembered handle into a surprise browser permission prompt
    // (ADR-0128).
    void requestPersistentStorage();
  } catch (err) {
    // The pick itself succeeded and the cached handle covers this session; only
    // persistence across reloads is lost.
    console.warn('Persisting the save folder failed:', err);
  }
  return handle.name;
}

/** Forget the chosen folder, so web saves revert to plain downloads. */
export async function clearSaveFolder(): Promise<void> {
  if (!browser) return;
  handlePromise = Promise.resolve(null);
  removeKey(STORAGE_KEYS.saveFolderChosen);
  try {
    await handleStore.delete(HANDLE_KEY);
  } catch {
    // The chosen-flag is authoritative, so a failed delete only orphans a row.
  }
}

// Find a free filename (browser-download style " (1)" suffixes) so two saves in
// the same second can't truncate each other — timestamp() names are
// second-resolution, and createWritable overwrites silently.
async function createUniqueFile(
  dir: FileSystemDirectoryHandle,
  filename: string
): Promise<FileSystemFileHandle> {
  const dot = filename.lastIndexOf('.');
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  const ext = dot === -1 ? '' : filename.slice(dot);
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? filename : `${stem} (${i})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return dir.getFileHandle(candidate, { create: true });
      }
      throw err;
    }
  }
}

async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
  allowPrompt: boolean
): Promise<boolean> {
  let permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && allowPrompt) {
    permission = await handle.requestPermission({ mode: 'readwrite' });
  }
  return permission === 'granted';
}

async function forgetStaleFolder(): Promise<void> {
  await clearSaveFolder();
  folderClearedListener?.();
}

// Write `blob` as `filename` into the chosen folder. Returns true once written;
// false (no folder set, unsupported, or permission lost) tells the caller to
// fall back to a download. Never opens the folder picker — folder selection is a
// separate action in Settings. `allowPrompt` only lets a user-initiated save
// re-confirm a write permission the browser dropped since the folder was chosen
// (in-tab origins lose it between sessions); background saves leave it false and
// degrade silently to a download.
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

    if (!(await ensureWritePermission(handle, allowPrompt))) return false;

    const fileHandle = await createUniqueFile(handle, filename);
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err) {
    // The folder was moved/removed since we stored it: drop the stale handle so
    // it reverts to the no-folder (download) state, and tell the settings mirror
    // so the UI stops naming it. AbortError and any other write failure just
    // fall back to a download.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await forgetStaleFolder();
    }
    return false;
  }
}
