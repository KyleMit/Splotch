import { AI_IMAGE_BASENAME, isUnsaved, type SaveResult } from '$lib/saveNaming';
import { reportSaveFailure } from '$lib/state/saveFailure.svelte';

// The AI result card's Download button saves through the same pipeline as every other save
// (ADR-0037): the photo library on native, the chosen folder or a download on the web. The pipeline
// loads on demand, as it does for the auto-save (issue #461). The button is a tap, so like the
// camera button it may re-confirm a lapsed folder permission. A save that does not land goes to the
// save-failure banner with the picture's bytes, so its retry outlives the card. Resolves whether the
// picture landed.
export async function saveAiResult(url: string): Promise<boolean> {
  let blob: Blob | null = null;
  let result: SaveResult;
  try {
    blob = await (await fetch(url)).blob();
    const { saveImageBlob } = await import('$lib/drawing/imageSave');
    result = await saveImageBlob(blob, AI_IMAGE_BASENAME, { allowPrompt: true });
  } catch (err) {
    console.error('Saving the AI picture failed:', err);
    result = { status: 'failed' };
  }
  if (!isUnsaved(result)) return true;
  void reportSaveFailure(result.status, blob && { blob, baseName: AI_IMAGE_BASENAME });
  return false;
}
