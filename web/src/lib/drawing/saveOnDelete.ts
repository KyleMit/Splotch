import { settings } from '$lib/state/settings.svelte';
import { exportCanvasBlob, isCanvasEmpty } from './engine';
import { getActiveOverlayImage } from './overlay';
import { saveImageBlob } from './screenshot';

export async function saveDrawingIfEnabled() {
  if (!settings.saveOnDeleteEnabled) return;
  if (isCanvasEmpty()) return;

  await saveImageBlob(await exportCanvasBlob(getActiveOverlayImage()));
}
