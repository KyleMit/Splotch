import type { DBSchema } from '$lib/idbDatabase';
import { browser } from '$app/environment';
import { STORAGE_KEYS, readBool, writeBool, removeKey } from '$lib/storage';
import { idbKvStore, requestPersistentStorage } from '$lib/idb';
import {
  type FolderHandle,
  createFolderSave,
  FOLDER_SAVE_DATABASE,
  FOLDER_SAVE_STORE,
  FOLDER_SAVE_HANDLE_KEY,
} from './folderSaveOwner';

interface FolderSaveDb extends DBSchema {
  handles: { key: string; value: FolderHandle };
}
const handleStore = idbKvStore<FolderSaveDb>(FOLDER_SAVE_DATABASE, FOLDER_SAVE_STORE);
export function folderSaveSupported(): boolean {
  return browser && 'showDirectoryPicker' in window;
}
const folderSave = createFolderSave({
  available: () => browser,
  supported: folderSaveSupported,
  chosen: () => readBool(STORAGE_KEYS.saveFolderChosen, false),
  setChosen: (chosen) => {
    if (chosen) writeBool(STORAGE_KEYS.saveFolderChosen, true);
    else removeKey(STORAGE_KEYS.saveFolderChosen);
  },
  readHandle: async () => (await handleStore.get(FOLDER_SAVE_HANDLE_KEY)) ?? null,
  storeHandle: (handle) => handleStore.put(FOLDER_SAVE_HANDLE_KEY, handle),
  clearHandle: () => handleStore.delete(FOLDER_SAVE_HANDLE_KEY),
  chooseHandle: () => window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' }),
  requestPersistence: requestPersistentStorage,
});
export const {
  getSaveFolderName,
  chooseSaveFolder,
  clearSaveFolder,
  saveBlobToFolder,
  setSaveFolderClearedListener,
} = folderSave;
