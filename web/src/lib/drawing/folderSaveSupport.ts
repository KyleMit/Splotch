import { browser } from '$app/environment';

/** Whether the browser exposes the File System Access directory picker. */
export function folderSaveSupported(): boolean {
  return browser && 'showDirectoryPicker' in window;
}
