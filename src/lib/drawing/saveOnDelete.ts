import { settings } from '$lib/state/settings.svelte';
import { exportCanvasBlob, isCanvasEmpty } from './engine';
import { getActiveOverlayImage } from './overlay';

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export async function saveDrawingIfEnabled() {
  if (!settings.saveOnDeleteEnabled) return;
  if (isCanvasEmpty()) return;

  const blob = await exportCanvasBlob(getActiveOverlayImage());
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `splotch-${timestamp()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
