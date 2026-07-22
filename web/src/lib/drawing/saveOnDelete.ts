import { settings } from '$lib/state/settings.svelte';
import { exportCanvasBlob, isCanvasEmpty } from './engine';
import { getActiveOverlayImage } from './overlay';

// Deliberately imported statically by ClearButton (unlike the other save
// entry points): onClear must invoke exportCanvasBlob synchronously so its
// stroke snapshot lands before clearCanvas() wipes the paper — a tap-time
// module load would lose that race. The heavy save pipeline behind it
// (screenshot → folderSave, the export compositor) still loads on demand
// (issue #461).
export async function saveDrawingIfEnabled() {
  if (!settings.saveOnDeleteEnabled) return;
  if (isCanvasEmpty()) return;

  const blob = await exportCanvasBlob(getActiveOverlayImage());
  if (!blob) return;
  const { saveImageBlob } = await import('./screenshot');
  await saveImageBlob(blob);
}
