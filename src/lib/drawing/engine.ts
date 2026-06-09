// Imperative drawing engine. Owns the <canvas>, the virtual canvas, the
// undo stack, and the pointer tracking. Svelte components mount this on
// onMount and adapt reactive state (active color, stroke width) by calling
// setColor() / setStrokeWidth() from $effect.

import { ERASER_SIZE_MULTIPLIER } from '$lib/state/strokeWidth.svelte';

interface DrawSoundData {
  speed: number;
}

interface PointerState {
  x: number;
  y: number;
  isDrawing: boolean;
  color: string;
  lineWidth: number;
  erase: boolean;
  lastTime: number;
  speedSamples: { t: number; distance: number }[];
}

interface UndoSnapshot {
  image: HTMLCanvasElement;
  wasEmpty: boolean;
}

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface InitOptions {
  onDrawSound?: ((data: DrawSoundData) => void) | null;
  onDrawStop?: (() => void) | null;
  onUndoStateChange?: ((canUndo: boolean) => void) | null;
  onCanvasEmptyChange?: ((empty: boolean) => void) | null;
  initialColor?: string;
}

interface ExportOptions {
  includePaperTexture?: boolean;
}

// Set in initDrawingCanvas() before any handler runs (definite-assignment `!`).
let canvas!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let currentColor = '';
let currentLineWidth = 8;
let eraserActive = false;
let lastColorChangeTime = 0;
let activePointerIds = new Set<number>();
let activePointers = new Map<number, PointerState>();
let onDrawSoundCallback: ((data: DrawSoundData) => void) | null = null;
let onDrawStopCallback: (() => void) | null = null;

let virtualCanvas: HTMLCanvasElement | null = null;
let virtualCtx: CanvasRenderingContext2D | null = null;

// Cached canvas geometry so the pointer hot path never calls
// getBoundingClientRect() (each call forces a synchronous reflow). Recomputed
// only on resize/scroll/orientation change — see refreshCanvasRect().
let canvasRect: CanvasRect = { left: 0, top: 0, width: 0, height: 0 };
let rectScaleX = 1;
let rectScaleY = 1;

let undoStack: UndoSnapshot[] = [];
const MAX_UNDO_STACK_SIZE = 10;
let canUndo = false;
let onUndoStateChange: ((canUndo: boolean) => void) | null = null;

let canvasEmpty = true;
let onCanvasEmptyChange: ((empty: boolean) => void) | null = null;

// Pointer speed (which drives the drawing sound) is averaged over the most
// recent slice of the stroke so the audio cue tracks gesture speed without
// reacting to every per-frame jitter.
const SPEED_WINDOW_MS = 100;

// After a color/tool change, ignore touch/mouse pointerdowns for a short window
// so the tap that picked the color doesn't immediately start a stray stroke.
// Pen input is precise enough to skip the debounce.
const COLOR_CHANGE_DEBOUNCE_MS = 100;

function setCanvasEmptyState(empty: boolean) {
  if (canvasEmpty === empty) return;
  canvasEmpty = empty;
  if (onCanvasEmptyChange) onCanvasEmptyChange(empty);
}

function scanCanvasIsEmpty(): boolean {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function growVirtualCanvas(
  existing: HTMLCanvasElement,
  newW: number,
  newH: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const grown = document.createElement('canvas');
  grown.width = newW;
  grown.height = newH;
  const grownCtx = grown.getContext('2d');
  if (grownCtx) {
    grownCtx.lineCap = 'round';
    grownCtx.lineJoin = 'round';
    grownCtx.drawImage(existing, 0, 0);
  }
  return { canvas: grown, ctx: grownCtx };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  if (!virtualCanvas) {
    virtualCanvas = document.createElement('canvas');
    virtualCanvas.width = Math.max(rect.width, rect.height) * 2;
    virtualCanvas.height = Math.max(rect.width, rect.height) * 2;
    virtualCtx = virtualCanvas.getContext('2d');
    if (virtualCtx) {
      virtualCtx.lineCap = 'round';
      virtualCtx.lineJoin = 'round';
    }
  } else if (rect.width * 2 > virtualCanvas.width || rect.height * 2 > virtualCanvas.height) {
    // Viewport grew beyond the initial virtual canvas (e.g. device rotated to a
    // larger dimension). Grow it and copy existing pixels so no drawing is lost.
    const newW = Math.max(rect.width * 2, virtualCanvas.width);
    const newH = Math.max(rect.height * 2, virtualCanvas.height);
    ({ canvas: virtualCanvas, ctx: virtualCtx } = growVirtualCanvas(virtualCanvas, newW, newH));
  }

  if (virtualCtx && canvas.width > 0 && canvas.height > 0) {
    virtualCtx.drawImage(canvas, 0, 0);
  }

  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);

  if (virtualCanvas) ctx.drawImage(virtualCanvas, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  refreshCanvasRect();
}

// Snapshot the canvas's client rect and the backing-pixel scale factors. Called
// only off the hot path (resize/scroll/orientation), so the per-pointermove
// pointerToCanvas() can stay reflow-free.
function refreshCanvasRect() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  rectScaleX = rect.width ? canvas.width / rect.width : 1;
  rectScaleY = rect.height ? canvas.height / rect.height : 1;
}

function pointerToCanvas(e: PointerEvent) {
  return {
    x: (e.clientX - canvasRect.left) * rectScaleX,
    y: (e.clientY - canvasRect.top) * rectScaleY
  };
}

// The cached canvas client rect, so components can position pointer-following
// UI (e.g. the eraser cursor) without their own per-move getBoundingClientRect.
export function getCanvasRect(): CanvasRect {
  return canvasRect;
}

// Every drawing op must also land on the off-screen virtualCtx so the picture
// survives a resize (resizeCanvas replays it). Yield whichever contexts exist
// so each op is written once instead of being hand-mirrored.
function activeContexts(): CanvasRenderingContext2D[] {
  return virtualCtx ? [ctx, virtualCtx] : [ctx];
}

// The canvas backing a given context — their pixel dimensions differ, so
// clearRect callers need the right one.
function canvasFor(c: CanvasRenderingContext2D): HTMLCanvasElement {
  return c === ctx ? canvas : virtualCanvas!;
}

function strokeSegment(c: CanvasRenderingContext2D, ps: PointerState, x: number, y: number) {
  c.globalCompositeOperation = ps.erase ? 'destination-out' : 'source-over';
  c.strokeStyle = ps.color;
  c.lineWidth = ps.lineWidth;
  c.beginPath();
  c.moveTo(ps.x, ps.y);
  c.lineTo(x, y);
  c.stroke();
  c.globalCompositeOperation = 'source-over';
}

export function releaseAllPointers() {
  if (!ctx) return;
  ctx.beginPath();
  if (virtualCtx) virtualCtx.beginPath();

  activePointers.clear();

  activePointerIds.forEach((pointerId) => {
    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {}
  });

  activePointerIds.clear();
}

function startDrawing(e: PointerEvent) {
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 0 : COLOR_CHANGE_DEBOUNCE_MS;
  if (timeSinceColorChange < requiredDelay) return;

  saveUndoSnapshot();
  setCanvasEmptyState(false);

  const { x, y } = pointerToCanvas(e);

  // The eraser runs a bit larger than the pen at the same stroke level.
  const lineWidth = eraserActive
    ? currentLineWidth * ERASER_SIZE_MULTIPLIER
    : currentLineWidth;

  activePointers.set(e.pointerId, {
    x,
    y,
    isDrawing: true,
    color: currentColor,
    lineWidth,
    erase: eraserActive,
    lastTime: Date.now(),
    // Time-stamped distance samples for the sliding speed window. The first
    // entry is a zero-distance anchor so the very first move has a span to
    // divide by.
    speedSamples: [{ t: Date.now(), distance: 0 }]
  });
  activePointerIds.add(e.pointerId);

  const dotRadius = lineWidth / 2;

  // Erasing clears pixels via destination-out; the stroke color is irrelevant
  // there, only its (opaque) alpha matters.
  const op = eraserActive ? 'destination-out' : 'source-over';

  for (const c of activeContexts()) {
    c.globalCompositeOperation = op;
    c.strokeStyle = currentColor;
    c.fillStyle = currentColor;
    c.beginPath();
    c.arc(x, y, dotRadius, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x, y);
    c.globalCompositeOperation = 'source-over';
  }

  if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });

  if (e.pointerType !== 'pen') {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  }
}

function draw(e: PointerEvent) {
  const pointerState = activePointers.get(e.pointerId);
  if (!pointerState || !pointerState.isDrawing) return;

  e.preventDefault();

  const { x, y } = pointerToCanvas(e);
  const deltaX = x - pointerState.x;
  const deltaY = y - pointerState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const now = Date.now();
  // Honest sliding window: stamp each move's distance with its time, drop
  // samples older than SPEED_WINDOW_MS, then divide the distance covered since
  // the oldest surviving sample by that elapsed span. (The oldest sample is the
  // anchor for the span, so its own distance — travelled before it — is excluded.)
  const samples = pointerState.speedSamples;
  samples.push({ t: now, distance });
  const cutoff = now - SPEED_WINDOW_MS;
  while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
  let windowDistance = 0;
  for (let i = 1; i < samples.length; i++) windowDistance += samples[i].distance;
  const windowSpan = Math.max(now - samples[0].t, 1);
  const speed = windowDistance / windowSpan;

  for (const c of activeContexts()) {
    strokeSegment(c, pointerState, x, y);
  }

  pointerState.x = x;
  pointerState.y = y;
  pointerState.lastTime = now;

  if (onDrawSoundCallback) onDrawSoundCallback({ speed });
}

function stopDrawing(e?: PointerEvent) {
  if (!e) return;

  const wasErasing = activePointers.get(e.pointerId)?.erase;

  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();
  if (virtualCtx) virtualCtx.beginPath();

  // Erasing can leave the canvas blank; defer the scan so it runs after the
  // gesture frame instead of blocking pointer-event processing.
  if (wasErasing) {
    const scan = () => setCanvasEmptyState(scanCanvasIsEmpty());
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(scan);
    } else {
      setTimeout(scan, 0);
    }
  }

  if (onDrawStopCallback) onDrawStopCallback();

  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
}

function saveUndoSnapshot() {
  if (!canvas || !ctx) return;

  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const snapshotCtx = snapshot.getContext('2d');
  if (snapshotCtx) snapshotCtx.drawImage(canvas, 0, 0);

  // Capture emptiness alongside the pixels. This runs before the stroke that
  // prompted the snapshot dirties the canvas, so `canvasEmpty` exactly describes
  // these pixels — letting undo() restore the empty state without re-scanning.
  undoStack.push({ image: snapshot, wasEmpty: canvasEmpty });
  if (undoStack.length > MAX_UNDO_STACK_SIZE) undoStack.shift();

  canUndo = true;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

export function undo() {
  if (!canUndo || undoStack.length === 0 || !canvas || !ctx) return;

  const snapshot = undoStack.pop();
  if (!snapshot) return;
  for (const c of activeContexts()) {
    const target = canvasFor(c);
    c.clearRect(0, 0, target.width, target.height);
    c.drawImage(snapshot.image, 0, 0);
  }

  setCanvasEmptyState(snapshot.wasEmpty);

  canUndo = undoStack.length > 0;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  canvas = canvasElement;
  // willReadFrequently keeps the backing store CPU-side so the empty-check
  // getImageData (on erase-end) is a cheap memcpy instead of a synchronous
  // GPU→CPU texture readback. This canvas is read for empty-checks/snapshots
  // and never WebGL-composited, so a CPU backing store is the right tradeoff.
  ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  onCanvasEmptyChange = options.onCanvasEmptyChange || null;
  currentColor = options.initialColor || '#AB71E1';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  // Scroll/orientation move the canvas in the viewport without resizing it, so
  // refresh the cached rect (left/top) without the full backing-store rebuild.
  window.addEventListener('scroll', refreshCanvasRect, true);
  window.addEventListener('orientationchange', refreshCanvasRect);

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerout', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  return {
    teardown() {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('scroll', refreshCanvasRect, true);
      window.removeEventListener('orientationchange', refreshCanvasRect);
      canvas.removeEventListener('pointerdown', startDrawing);
      canvas.removeEventListener('pointermove', draw);
      canvas.removeEventListener('pointerup', stopDrawing);
      canvas.removeEventListener('pointerout', stopDrawing);
      canvas.removeEventListener('pointercancel', stopDrawing);
    }
  };
}

export function setColor(color: string) {
  currentColor = color;
  lastColorChangeTime = Date.now();
}

export function setStrokeWidth(widthPx: number) {
  currentLineWidth = widthPx;
}

export function setEraserMode(active: boolean) {
  eraserActive = active;
}

export function clearCanvas() {
  saveUndoSnapshot();
  for (const c of activeContexts()) {
    const target = canvasFor(c);
    c.clearRect(0, 0, target.width, target.height);
  }
  setCanvasEmptyState(true);
}

export function isCanvasEmpty(): boolean {
  return canvasEmpty;
}

let paperTextureImage: HTMLImageElement | null = null;
let paperTexturePromise: Promise<HTMLImageElement | null> | null = null;
function loadPaperTexture(): Promise<HTMLImageElement | null> {
  if (paperTextureImage) return Promise.resolve(paperTextureImage);
  if (paperTexturePromise) return paperTexturePromise;
  paperTexturePromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTextureImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = '/icons/handmade-paper.webp';
  });
  return paperTexturePromise;
}

export async function exportCanvasBlob(
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true } = options;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const w = canvas.width;
  const h = canvas.height;

  const out = document.createElement('canvas');
  out.width = Math.round(w * dpr);
  out.height = Math.round(h * dpr);
  const outCtx = out.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.scale(dpr, dpr);

  outCtx.fillStyle = '#fcfbf8';
  outCtx.fillRect(0, 0, w, h);

  if (includePaperTexture) {
    const paper = await loadPaperTexture();
    if (paper) {
      const pattern = outCtx.createPattern(paper, 'repeat');
      if (pattern) {
        outCtx.fillStyle = pattern;
        outCtx.fillRect(0, 0, w, h);
      }
    }
  }

  outCtx.drawImage(canvas, 0, 0, w, h);

  if (overlayImage && overlayImage.naturalWidth > 0 && overlayImage.naturalHeight > 0) {
    const scale = Math.min(
      w / overlayImage.naturalWidth,
      h / overlayImage.naturalHeight
    );
    const drawnW = overlayImage.naturalWidth * scale;
    const drawnH = overlayImage.naturalHeight * scale;
    const offsetX = (w - drawnW) / 2;
    const offsetY = (h - drawnH) / 2;
    outCtx.globalCompositeOperation = 'multiply';
    outCtx.drawImage(overlayImage, offsetX, offsetY, drawnW, drawnH);
    outCtx.globalCompositeOperation = 'source-over';
  }

  return await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

export function focusCanvas() {
  if (canvas) canvas.focus();
}

export function getActiveCanvas(): HTMLCanvasElement {
  return canvas;
}
