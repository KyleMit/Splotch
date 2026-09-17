import { DRAWING_BASENAME, isUnsaved, type SaveResult } from '$lib/saveNaming';
import { reportSaveFailure } from '$lib/state/saveFailure.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { exportCanvasBlob, isCanvasEmpty } from './engine';

// Deliberately imported statically by ClearButton (unlike the other save
// entry points): onClear must invoke exportCanvasBlob synchronously so its
// stroke snapshot lands before clearCanvas() wipes the paper — a tap-time
// module load would lose that race. The heavy save pipeline behind it
// (screenshot → folderSave, the export compositor) still loads on demand
// (issue #461).
export async function saveDrawingIfEnabled() {
  if (!settingsState.saveOnDeleteEnabled) return;
  if (isCanvasEmpty()) return;

  const screenshotModule = import('./screenshot');
  void screenshotModule.catch(() => undefined);
  const blob = await exportCanvasBlob();
  if (!blob) {
    await reportSaveFailure('failed', null);
    return;
  }
  // The page is already wiped, so this blob is the only copy the banner's retry can save.
  const result = await saveOnDemand(screenshotModule, blob);
  if (isUnsaved(result))
    await reportSaveFailure(result.status, { blob, baseName: DRAWING_BASENAME });
}

async function saveOnDemand(
  screenshotModule: Promise<typeof import('./screenshot')>,
  blob: Blob
): Promise<SaveResult> {
  try {
    const { saveImageBlob } = await screenshotModule;
    return await saveImageBlob(blob, DRAWING_BASENAME);
  } catch (err) {
    console.error('Save on delete failed:', err);
    return { status: 'failed' };
  }
}
