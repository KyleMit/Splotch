import type { AiAutoSaveStatus } from '$lib/state/aiGeneration.svelte';

type SavedOutcome = Exclude<AiAutoSaveStatus, 'saving' | 'failed'>;

type AutoSaveFooter = { kind: 'saved'; caption: string } | { kind: 'download' } | null;

function savedCaption(outcome: SavedOutcome, folderName: string | null) {
  switch (outcome) {
    case 'photos':
      return 'Saved to your photos';
    case 'folder':
      return folderName ? `Saved to ${folderName}` : 'Saved to your folder';
    case 'download':
      return 'Downloaded';
  }
}

// A failed auto-save hands the parent the manual Download button rather than an error: the picture
// is still on screen, so recovery is one tap and nothing alarming reaches the child. No status means
// no save ran for this picture (auto-save was switched on after it arrived), so Download stays too.
export function autoSaveFooter(
  autoSaveEnabled: boolean,
  status: AiAutoSaveStatus | null,
  folderName: string | null
): AutoSaveFooter {
  if (!autoSaveEnabled || status === null || status === 'failed') return { kind: 'download' };
  if (status === 'saving') return null;
  return { kind: 'saved', caption: savedCaption(status, folderName) };
}
