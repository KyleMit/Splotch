export function folderSaveSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
