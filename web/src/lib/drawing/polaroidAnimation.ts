import { getViewState } from './engine';
import type { ExportOptions } from './exportDrawing';
import { SCREENSHOT_BUTTON_ID } from '$lib/state/ui.svelte';
import { POLAROID_CLEANUP_TIMEOUT_MS } from './screenshotTiming';

const POLAROID_MAX_WIDTH_PX = 480;
const POLAROID_PREFERRED_MIN_WIDTH_PX = 260;
const POLAROID_VIEWPORT_WIDTH_FRACTION = 0.54;
const POLAROID_VIEWPORT_MAX_WIDTH_FRACTION = 0.8;
const POLAROID_MAX_HEIGHT_FRACTION = 0.7;
const POLAROID_MAX_RENDER_SCALE = 2;

interface PolaroidSize {
  cssWidth: number;
  cssHeight: number;
  rasterWidth: number;
}

type PolaroidPreviewRequest = NonNullable<ExportOptions['preview']>;

function polaroidSize(): PolaroidSize | null {
  const { paperCssWidth, paperCssHeight } = getViewState();
  if (paperCssWidth <= 0 || paperCssHeight <= 0) return null;

  const aspectRatio = paperCssWidth / paperCssHeight;
  const preferredWidth = Math.max(
    POLAROID_PREFERRED_MIN_WIDTH_PX,
    Math.min(POLAROID_MAX_WIDTH_PX, window.innerWidth * POLAROID_VIEWPORT_WIDTH_FRACTION)
  );
  const cssWidth = Math.min(
    preferredWidth,
    window.innerWidth * POLAROID_VIEWPORT_MAX_WIDTH_FRACTION,
    window.innerHeight * POLAROID_MAX_HEIGHT_FRACTION * aspectRatio
  );
  const cssHeight = cssWidth / aspectRatio;
  const renderScale = Math.min(window.devicePixelRatio || 1, POLAROID_MAX_RENDER_SCALE);
  return {
    cssWidth,
    cssHeight,
    rasterWidth: Math.max(1, Math.round(cssWidth * renderScale)),
  };
}

function setFrameOrigin(frame: HTMLElement) {
  const button = document.getElementById(SCREENSHOT_BUTTON_ID);
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const buttonCenterX = (rect.left + rect.right) / 2;
  const buttonCenterY = (rect.top + rect.bottom) / 2;
  frame.style.setProperty('--from-x', `${Math.round(buttonCenterX - window.innerWidth / 2)}px`);
  frame.style.setProperty('--from-y', `${Math.round(buttonCenterY - window.innerHeight / 2)}px`);
}

function mountPolaroidAnimation(canvas: HTMLCanvasElement, size: PolaroidSize) {
  const overlay = document.createElement('div');
  overlay.className = 'polaroid-overlay';

  const flash = document.createElement('div');
  flash.className = 'polaroid-flash';

  const frame = document.createElement('div');
  frame.className = 'polaroid-frame';
  setFrameOrigin(frame);

  canvas.className = 'polaroid-image';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${size.cssWidth}px`;
  canvas.style.height = `${size.cssHeight}px`;

  frame.appendChild(canvas);
  overlay.appendChild(flash);
  overlay.appendChild(frame);
  const removeOverlay = () => {
    window.clearTimeout(cleanupTimer);
    overlay.remove();
  };
  const cleanupTimer = window.setTimeout(removeOverlay, POLAROID_CLEANUP_TIMEOUT_MS);
  frame.addEventListener('animationend', removeOverlay, { once: true });
  document.body.appendChild(overlay);
}

function playPolaroidAnimation(preview: ImageBitmap, size: PolaroidSize) {
  const canvas = document.createElement('canvas');
  canvas.width = preview.width;
  canvas.height = preview.height;
  const context = canvas.getContext('2d');
  if (!context) {
    preview.close();
    return;
  }
  context.drawImage(preview, 0, 0);
  preview.close();
  mountPolaroidAnimation(canvas, size);
}

export function createPolaroidPreviewRequest(): PolaroidPreviewRequest | null {
  const size = polaroidSize();
  if (!size) return null;
  return {
    width: size.rasterWidth,
    onReady: (preview) => playPolaroidAnimation(preview, size),
  };
}
