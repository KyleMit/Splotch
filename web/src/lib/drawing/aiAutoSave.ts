import { isAiGenerationActive, setAiAutoSave } from '$lib/state/aiGeneration.svelte';
import { blobSha256OrNull } from '$lib/digestHex';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME, isUnsaved, type SaveResult } from '$lib/saveNaming';
import { reportSaveFailure } from '$lib/state/saveFailure.svelte';

// Tracks the signature of the drawing saved on the previous AI run so we can skip
// re-saving the child's artwork when they re-roll a new style on an unchanged
// drawing — the AI image is always fresh, but the drawing copy would just be a
// duplicate. Constructible so tests can exercise the dedupe in isolation instead
// of driving it end-to-end through a shared module instance.
export function createDrawingDeduper() {
  let lastSavedDrawingSig: string | null = null;
  return {
    isDuplicate(sig: string | null): boolean {
      return sig !== null && sig === lastSavedDrawingSig;
    },
    record(sig: string | null): void {
      lastSavedDrawingSig = sig;
    },
  };
}

const drawingSaver = createDrawingDeduper();

// Drop the finished AI image into the gallery (a download on the web), and tuck
// the child's own drawing in alongside it — but only when the drawing actually
// changed since the last AI run, so duplicates don't pile up.
export async function autoSaveImages(aiBlob: Blob, drawingBlob: Blob, runId: number) {
  if (!isAiGenerationActive(runId)) return;
  setAiAutoSave(runId, { status: 'saving' });
  // The save pipeline loads only when an auto-save runs, not with the AI generation chunk that the
  // AI button and the AI overlays load (issue #461). A failed chunk load is contained here:
  // the AI image already committed to the result modal, so it must degrade like any other failed
  // save rather than bubbling into generateAiImage's error UI.
  let saveImageBlob: (typeof import('./imageSave'))['saveImageBlob'];
  try {
    ({ saveImageBlob } = await import('./imageSave'));
  } catch (err) {
    console.error('Auto-save failed:', err);
    setAiAutoSave(runId, { status: 'failed' });
    void reportSaveFailure('failed', { blob: aiBlob, baseName: AI_IMAGE_BASENAME });
    return;
  }
  // A throw must land as 'failed' here rather than reach generateAiImage's catch, which would
  // replace the revealed picture with the error card and strand the status at 'saving'.
  const save = async (blob: Blob, baseName: string): Promise<SaveResult> => {
    const result = await saveImageBlob(blob, baseName).catch((err: unknown): SaveResult => {
      console.error('Auto-save failed:', err);
      return { status: 'failed' };
    });
    if (isUnsaved(result)) void reportSaveFailure(result.status, { blob, baseName });
    return result;
  };
  setAiAutoSave(runId, await save(aiBlob, AI_IMAGE_BASENAME));
  if (!isAiGenerationActive(runId)) return;
  const sig = await blobSha256OrNull(drawingBlob);
  if (!isAiGenerationActive(runId)) return;
  if (!drawingSaver.isDuplicate(sig)) {
    await save(drawingBlob, DRAWING_BASENAME);
  }
  // Record the signature of the drawing we just saved even if ownership was lost
  // during that save: the drawing is already in the gallery, so a later owning run
  // on the same unchanged drawing must dedupe against it. Returning here (the old
  // post-save ownership check) left the signature stale and re-saved a duplicate.
  drawingSaver.record(sig);
}
