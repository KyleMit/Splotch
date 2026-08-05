import { settings } from './settings.svelte';

// folderSave is save-time-only, so it loads on demand and stays out of the
// startup bundle (issue #461). The first load registers the stale-folder
// listener: a save that discovers the chosen folder is gone (moved/deleted)
// drops the stored handle itself, and this mirror keeps the folder pill in Settings
// from naming a folder that no longer receives saves. Saves reach folderSave
// through the same module instance (screenshot.ts's static import), and on any
// platform that can save to a folder the boot hydration below has already run
// this loader — so the listener is armed before a save can fire it.
let folderSaveModule: Promise<typeof import('$lib/drawing/folderSave')> | null = null;

function loadFolderSave() {
  // A failed chunk fetch must not pin the memo to a rejected promise — the
  // next tap should retry the import instead of replaying the old failure.
  folderSaveModule ??= import('$lib/drawing/folderSave').then(
    (m) => {
      m.setSaveFolderClearedListener(() => {
        settings.saveFolderName = null;
      });
      return m;
    },
    (err) => {
      folderSaveModule = null;
      throw err;
    }
  );
  return folderSaveModule;
}

// These three are UI/boot entry points wired straight into onclick/onMount, so
// a chunk-load failure must be contained here — not surface as an unhandled
// rejection when Settings is tapped.
async function tryLoadFolderSave() {
  try {
    return await loadFolderSave();
  } catch (err) {
    console.error('Folder-save module failed to load:', err);
    return null;
  }
}

// Pick (or re-pick) the optional destination folder for web saves. Must be
// called from a click handler so the picker keeps its user activation (the
// import resolves from the module cache — the Settings section that hosts
// this action already loaded folderSave). Keeps the current folder if the
// parent cancels. Purely a convenience — it doesn't enable or disable any save
// action; saves work the same with or without a folder.
export async function changeSaveFolder() {
  const mod = await tryLoadFolderSave();
  if (!mod) return;
  const name = await mod.chooseSaveFolder();
  if (name) settings.saveFolderName = name;
}

// Forget the chosen folder, so web saves revert to the browser's default
// download location. Doesn't stop anything from saving.
export async function forgetSaveFolder() {
  const mod = await tryLoadFolderSave();
  if (!mod) return;
  await mod.clearSaveFolder();
  settings.saveFolderName = null;
}

// Boot hydration (web/desktop only): read the remembered folder name from the
// directory handle in IndexedDB into the live store so Settings can
// show it. No side effects on the save features.
//
// The support check is inlined rather than imported, and the duplication with
// folderSaveSupported is deliberate: this module is on the startup path, so any
// static import reaching into lib/drawing/ gives the bundler an edge from the
// startup graph into the save pipeline. Hoisting this predicate into a shared
// module — however small — re-partitions the chunks and merges save-pipeline
// code into a modulepreloaded chunk.
//
// Two tests hold the two halves of that arrangement, and neither covers the
// other: tests/startup-bundle.spec.ts pins the bundle boundary by scanning
// modulepreloaded chunks for save-module markers, while saveFolder.svelte.test.ts
// is the drift guard for the duplication itself — it reads both sites and fails
// if this inline check and folderSaveSupported stop probing the same
// capabilities.
export async function hydrateSaveFolder() {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return;
  const mod = await tryLoadFolderSave();
  if (!mod) return;
  settings.saveFolderName = await mod.getSaveFolderName();
}
