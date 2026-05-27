// Persisted "show a screenshot button in the actions panel" preference,
// and the action that saves the current drawing as a PNG.
import { exportCanvasBlob } from './drawingCanvas.js';

const SCREENSHOT_KEY = 'splotch-screenshot-enabled';

let screenshotEnabled = localStorage.getItem(SCREENSHOT_KEY) === 'true';

export function isScreenshotEnabled() {
  return screenshotEnabled;
}

export function setScreenshotEnabled(enabled) {
  screenshotEnabled = enabled;
  localStorage.setItem(SCREENSHOT_KEY, enabled.toString());
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export async function saveScreenshot() {
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
