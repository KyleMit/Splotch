// Persisted "show a screenshot button in the actions panel" preference,
// and the action that saves the current drawing as a PNG.
import { exportCanvasBlob } from './drawingCanvas.js';
import { getActiveOverlayImage } from './coloringBook.js';

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
  const blob = await exportCanvasBlob(getActiveOverlayImage());
  if (!blob) return;

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `splotch-${timestamp()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  playPolaroidAnimation(url);
}

// Camera-flash + polaroid fly-in animation. The keyframe duration in CSS
// matches the cleanup timeout below.
const POLAROID_DURATION_MS = 1900;

function playPolaroidAnimation(imageUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'polaroid-overlay';

  const flash = document.createElement('div');
  flash.className = 'polaroid-flash';

  const frame = document.createElement('div');
  frame.className = 'polaroid-frame';

  const img = document.createElement('img');
  img.className = 'polaroid-image';
  img.src = imageUrl;
  img.alt = '';

  // Anchor the entrance to the camera button so the polaroid appears to
  // pop out of the button that took the shot.
  const button = document.getElementById('screenshotButton');
  if (button) {
    const rect = button.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const fromX = Math.round(cx - window.innerWidth / 2);
    const fromY = Math.round(cy - window.innerHeight / 2);
    frame.style.setProperty('--from-x', `${fromX}px`);
    frame.style.setProperty('--from-y', `${fromY}px`);
  }

  frame.appendChild(img);
  overlay.appendChild(flash);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
    URL.revokeObjectURL(imageUrl);
  }, POLAROID_DURATION_MS);
}
