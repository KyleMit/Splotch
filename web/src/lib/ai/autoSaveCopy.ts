import type { AiAutoSave } from '$lib/state/aiGeneration.svelte';

type AutoSaveFooter = { kind: 'saved'; caption: string } | { kind: 'downloadButton' } | null;

// Reads only the run's recorded save, never the live setting: a picture that was already downloaded
// stays "Downloaded" if auto-save is switched off afterwards, and one that arrived with auto-save off
// keeps its Download button if it is switched on. A failed auto-save hands the parent the Download
// button rather than an error: the picture is still on screen, so recovery is one tap and nothing
// alarming reaches the child.
export function autoSaveFooter(autoSave: AiAutoSave | null): AutoSaveFooter {
  if (autoSave === null) return { kind: 'downloadButton' };
  switch (autoSave.status) {
    case 'saving':
      return null;
    case 'denied':
    case 'failed':
      return { kind: 'downloadButton' };
    case 'photos':
      return { kind: 'saved', caption: 'Saved to your photos' };
    case 'chosenFolder':
      return {
        kind: 'saved',
        caption: autoSave.folderName ? `Saved to ${autoSave.folderName}` : 'Saved to your folder',
      };
    case 'downloads':
      return { kind: 'saved', caption: 'Downloaded' };
  }
}
