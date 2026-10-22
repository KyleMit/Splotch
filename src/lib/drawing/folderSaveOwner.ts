export const FOLDER_SAVE_DATABASE = 'splotch-fs';
export const FOLDER_SAVE_STORE = 'handles';
export const FOLDER_SAVE_HANDLE_KEY = 'saveDir';

export type FolderFile = {
  createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }>;
};
export type FolderHandle = {
  name: string;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(filename: string, options?: { create: true }): Promise<FolderFile>;
};

type FolderEnvironment = {
  available(): boolean;
  supported(): boolean;
  chosen(): boolean;
  setChosen(chosen: boolean): void;
  readHandle(): Promise<FolderHandle | null>;
  storeHandle(handle: FolderHandle): Promise<void>;
  clearHandle(): Promise<void>;
  chooseHandle(): Promise<FolderHandle>;
  requestPersistence(): Promise<unknown>;
};

async function ensureWritePermission(handle: FolderHandle, allowPrompt: boolean): Promise<boolean> {
  let permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && allowPrompt) {
    permission = await handle.requestPermission({ mode: 'readwrite' });
  }
  return permission === 'granted';
}

export function createFolderSave(environment: FolderEnvironment) {
  const reservedFilenames = new WeakMap<FolderHandle, Set<string>>();

  // In-memory promise for the stored handle, so only the first save of a session
  // touches IndexedDB.
  let handlePromise: Promise<FolderHandle | null> | null = null;

  let folderClearedListener: (() => void) | null = null;

  // Lets whoever mirrors the folder into reactive state (settings.svelte.ts) hear
  // about the handle being dropped from *inside* a save (stale folder), which
  // would otherwise leave the UI naming a folder that no longer receives saves.
  // This is intentionally single-subscriber: later registrations replace earlier ones.
  function setSaveFolderClearedListener(listener: () => void) {
    folderClearedListener = listener;
  }

  async function readHandleFromIdb(): Promise<FolderHandle | null> {
    if (!environment.chosen()) return null;
    try {
      return await environment.readHandle();
    } catch {
      // IndexedDB unavailable (corruption, embedded context, private mode):
      // behave as if no folder is set, so saves degrade to plain downloads.
      return null;
    }
  }

  async function loadHandle(): Promise<FolderHandle | null> {
    const requestedHandlePromise = (handlePromise ??= readHandleFromIdb());
    const handle = await requestedHandlePromise;
    return requestedHandlePromise === handlePromise ? handle : loadHandle();
  }

  async function storeHandle(handle: FolderHandle): Promise<void> {
    await environment.storeHandle(handle);
  }

  /** Whether the browser exposes the File System Access directory picker. */
  function folderSaveSupported(): boolean {
    return environment.supported();
  }

  /** The name of the remembered destination folder, or null if none is set. */
  async function getSaveFolderName(): Promise<string | null> {
    if (!folderSaveSupported()) return null;
    return (await loadHandle())?.name ?? null;
  }

  // Prompt the parent to pick a destination folder and remember it. Must run
  // inside a user gesture (the Choose/Change-folder click) — both
  // showDirectoryPicker and requestPermission need transient activation. Returns
  // the chosen folder's name once granted; null if the parent cancels or denies.
  async function chooseSaveFolder(): Promise<string | null> {
    if (!folderSaveSupported()) return null;
    let handle: FolderHandle;
    try {
      handle = await environment.chooseHandle();
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      console.warn('Choosing a save folder failed:', err);
      return null;
    }
    handlePromise = Promise.resolve(handle);
    environment.setChosen(true);
    try {
      await storeHandle(handle);
      // The Choose/Change-folder click is the opt-in boundary; hydration must not
      // turn a remembered handle into a surprise browser permission prompt
      // (ADR-0128).
      void environment.requestPersistence();
    } catch (err) {
      // The pick itself succeeded and the cached handle covers this session; only
      // persistence across reloads is lost.
      console.warn('Persisting the save folder failed:', err);
    }
    return handle.name;
  }

  /** Forget the chosen folder, so web saves revert to plain downloads. */
  async function clearSaveFolder(): Promise<void> {
    if (!environment.available()) return;
    handlePromise = Promise.resolve(null);
    environment.setChosen(false);
    try {
      await environment.clearHandle();
    } catch {
      // The chosen-flag is authoritative, so a failed delete only orphans a row.
    }
  }

  // Find a free filename (browser-download style " (1)" suffixes) so two saves in
  // the same second can't truncate each other — timestamp() names are
  // second-resolution, and createWritable overwrites silently.
  async function createUniqueFile(dir: FolderHandle, filename: string): Promise<FolderFile> {
    const reserved = reservedFilenames.get(dir) ?? new Set<string>();
    reservedFilenames.set(dir, reserved);
    const dot = filename.lastIndexOf('.');
    const stem = dot === -1 ? filename : filename.slice(0, dot);
    const ext = dot === -1 ? '' : filename.slice(dot);
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? filename : `${stem} (${i})${ext}`;
      if (reserved.has(candidate)) continue;
      reserved.add(candidate);
      try {
        try {
          await dir.getFileHandle(candidate);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotFoundError') {
            return await dir.getFileHandle(candidate, { create: true });
          }
          throw err;
        }
      } finally {
        reserved.delete(candidate);
      }
    }
  }

  async function forgetStaleFolder(): Promise<void> {
    await clearSaveFolder();
    folderClearedListener?.();
  }

  // Write `blob` as `filename` into the chosen folder. Returns the name of the folder it was written
  // into, taken from the handle that did the write so a folder changed mid-save can't be misreported;
  // null (no folder set, unsupported, or permission lost) tells the caller to fall back to a download.
  // Never opens the folder picker — folder selection is a separate action in Settings. `allowPrompt`
  // only lets a user-initiated save re-confirm a write permission the browser dropped since the folder
  // was chosen (in-tab origins lose it between sessions); background saves leave it false and degrade
  // silently to a download.
  async function saveBlobToFolder(
    blob: Blob,
    filename: string,
    opts?: { allowPrompt?: boolean }
  ): Promise<string | null> {
    if (!folderSaveSupported()) return null;
    const allowPrompt = opts?.allowPrompt ?? false;

    let handle: FolderHandle | null = null;
    try {
      handle = await loadHandle();
      if (!handle) return null;

      if (!(await ensureWritePermission(handle, allowPrompt))) return null;

      const fileHandle = await createUniqueFile(handle, filename);
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (err) {
      // The folder was moved/removed since we stored it: drop the stale handle so
      // it reverts to the no-folder (download) state, and tell the settings mirror
      // so the UI stops naming it — unless the parent chose another folder while
      // this save ran, which is not the one that went missing. AbortError and any
      // other write failure just fall back to a download.
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        if ((await loadHandle()) === handle) await forgetStaleFolder();
      }
      return null;
    }
  }

  return {
    folderSaveSupported,
    getSaveFolderName,
    chooseSaveFolder,
    clearSaveFolder,
    saveBlobToFolder,
    setSaveFolderClearedListener,
  };
}
