import {
  createFolderSave,
  FOLDER_SAVE_DATABASE,
  FOLDER_SAVE_STORE,
  FOLDER_SAVE_HANDLE_KEY,
  type FolderHandle,
} from '../lib/drawing/folderSaveOwner';
import type { DBSchema, IdbDatabase } from '../lib/idbDatabase';
import { STORAGE_KEYS } from '../lib/storageKeys';
import { folderSaveSupported } from './folderSaveSupport.web';

interface FolderDatabase extends DBSchema {
  handles: { key: string; value: unknown };
}

function createHandleStore() {
  let pending: Promise<IdbDatabase<FolderDatabase>> | null = null;
  function open() {
    if (pending) return pending;
    const opening: Promise<IdbDatabase<FolderDatabase>> = import('../lib/idbDatabase')
      .then(({ openDatabase }) =>
        openDatabase<FolderDatabase>(FOLDER_SAVE_DATABASE, FOLDER_SAVE_STORE)
      )
      .then((database) => {
        void database.closed.then(() => {
          if (pending === opening) pending = null;
        });
        return database;
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    pending = opening;
    return opening;
  }
  return {
    read: async () => {
      const handle = await (await open()).get(FOLDER_SAVE_STORE, FOLDER_SAVE_HANDLE_KEY);
      return isFolderHandle(handle) ? handle : null;
    },
    write: async (handle: FolderHandle) =>
      (await open()).put(FOLDER_SAVE_STORE, handle, FOLDER_SAVE_HANDLE_KEY),
    clear: async () => (await open()).delete(FOLDER_SAVE_STORE, FOLDER_SAVE_HANDLE_KEY),
  };
}
const handles = createHandleStore();

function chosen() {
  try {
    return localStorage.getItem(STORAGE_KEYS.saveFolderChosen) === 'true';
  } catch {
    return false;
  }
}
function setChosen(value: boolean) {
  try {
    if (value) localStorage.setItem(STORAGE_KEYS.saveFolderChosen, 'true');
    else localStorage.removeItem(STORAGE_KEYS.saveFolderChosen);
  } catch {}
}
function isFolderHandle(value: unknown): value is FolderHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'getFileHandle' in value &&
    typeof value.getFileHandle === 'function' &&
    'requestPermission' in value &&
    typeof value.requestPermission === 'function' &&
    'queryPermission' in value &&
    typeof value.queryPermission === 'function'
  );
}

export const folderSave = createFolderSave({
  available: () => typeof window !== 'undefined',
  supported: folderSaveSupported,
  chosen,
  setChosen,
  readHandle: handles.read,
  storeHandle: handles.write,
  clearHandle: handles.clear,
  chooseHandle: async () => {
    if (!('showDirectoryPicker' in window) || typeof window.showDirectoryPicker !== 'function')
      throw new Error('Folder selection is unavailable.');
    const handle: unknown = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'pictures',
    });
    if (!isFolderHandle(handle))
      throw new Error('The folder picker returned an invalid directory.');
    return handle;
  },
  requestPersistence: () => navigator.storage?.persist?.() ?? Promise.resolve(false),
});
