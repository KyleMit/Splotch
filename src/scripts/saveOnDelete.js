// Persisted "save the drawing as PNG when the canvas is cleared" preference.
import { exportCanvasBlob } from './drawingCanvas.js';

const SAVE_ON_DELETE_KEY = 'splotch-save-on-delete';

let saveOnDeleteEnabled = localStorage.getItem(SAVE_ON_DELETE_KEY) === 'true';

export function isSaveOnDeleteEnabled() {
  return saveOnDeleteEnabled;
}

export function setSaveOnDeleteEnabled(enabled) {
  saveOnDeleteEnabled = enabled;
  localStorage.setItem(SAVE_ON_DELETE_KEY, enabled.toString());
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export async function saveDrawingIfEnabled() {
  if (!saveOnDeleteEnabled) return;

  const blob = await exportCanvasBlob();
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
