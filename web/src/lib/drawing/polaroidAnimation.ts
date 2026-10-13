import { getViewState } from './engine';
import type { ExportOptions } from './exportDrawing';
import { SCREENSHOT_BUTTON_ID } from '$lib/state/ui.svelte';
import { POLAROID_CLEANUP_TIMEOUT_MS } from './screenshotTiming';
import { stampMotionAtStart } from '$lib/platform/reducedMotion';
import { polaroidCssSize } from './polaroidGeometry';

const POLAROID_MAX_RENDER_SCALE = 2;

interface PolaroidSize {
  cssWidth: number;
  cssHeight: number;
  rasterWidth: number;
}

const POLAROID_DISCARDED_CLASS = 'polaroid-discarded';

type PolaroidPreviewRequest = NonNullable<ExportOptions['preview']>;

interface PolaroidPreview extends PolaroidPreviewRequest {
  discard(): void;
}

function polaroidSize(): PolaroidSize | null {
  const { paperCssWidth, paperCssHeight } = getViewState();
  const size = polaroidCssSize(
    { width: paperCssWidth, height: paperCssHeight },
    { width: window.innerWidth, height: window.innerHeight }
  );
  if (!size) return null;
  const renderScale = Math.min(window.devicePixelRatio || 1, POLAROID_MAX_RENDER_SCALE);
  return {
    cssWidth: size.width,
    cssHeight: size.height,
    rasterWidth: Math.max(1, Math.round(size.width * renderScale)),
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
  stampMotionAtStart(flash);

  const frame = document.createElement('div');
  frame.className = 'polaroid-frame';
  stampMotionAtStart(frame);
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
  return overlay;
}

function paintPolaroidPreview(canvas: HTMLCanvasElement, preview: ImageBitmap) {
  const context = canvas.getContext('2d');
  if (!context) {
    preview.close();
    return false;
  }
  canvas.width = preview.width;
  canvas.height = preview.height;
  context.drawImage(preview, 0, 0);
  preview.close();
  return true;
}

export function createPolaroidPreviewRequest(): PolaroidPreview | null {
  const size = polaroidSize();
  if (!size) return null;
  let canvas: HTMLCanvasElement | null = null;
  let overlay: HTMLElement | null = null;
  let discarded = false;
  return {
    width: size.rasterWidth,
    onReady: (preview) => {
      if (discarded || (canvas && !canvas.isConnected)) {
        preview.close();
        return;
      }
      const target = canvas ?? document.createElement('canvas');
      if (!paintPolaroidPreview(target, preview)) return;
      if (!canvas) {
        canvas = target;
        overlay = mountPolaroidAnimation(canvas, size);
      }
    },
    discard: () => {
      discarded = true;
      overlay?.classList.add(POLAROID_DISCARDED_CLASS);
    },
  };
}
