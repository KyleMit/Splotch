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
  midX: number;
  midY: number;
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

// Strokes rasterize at the device pixel ratio so they stay crisp on mobile
// screens, capped at 2× — DPR-3 panels would cost 9× the pixels for detail a
// finger-drawn stroke can't use (see ADR 0015). Fixed for the session at init:
// a mid-session DPR change (desktop zoom, monitor move) would otherwise need
// every pixel surface (virtual canvas, undo stack) rescaled in place.
const MAX_RENDER_SCALE = 2;
let renderScale = 1;

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

// iOS/WebKit can silently merge a fast tap-then-drag into one pointer stream: it
// drops the intervening pointerup + pointerdown and resumes the SAME pointerId
// at the new spot, with no coalesced samples bridging the gap. draw() then
// curves from the old position to the resumed one — a stray straight line
// joining what should be two separate strokes. A long idle gap AND a jump too
// large for continuous contact together mean the finger really lifted, so the
// stroke is restarted at the resumed point. The jump is a fraction of the
// canvas's shorter side, so it scales with canvas size and render scale.
const POINTER_RESUME_GAP_MS = 100;
const POINTER_RESUME_JUMP_RATIO = 0.1;

function setCanvasEmptyState(empty: boolean) {
  if (canvasEmpty === empty) return;
  canvasEmpty = empty;
  if (onCanvasEmptyChange) onCanvasEmptyChange(empty);
}

// Emptiness is scanned on a small CPU-side scratch canvas instead of the main
// canvas: reading the (GPU-backed) main canvas directly would either force a
// slow readback or require willReadFrequently, which de-accelerates every
// stroke. Downscaling shrinks the pixel loop ~16× and the drawImage stays
// GPU→GPU until the tiny scratch readback.
const EMPTY_SCAN_SCALE = 0.25;
// Downscale rounding can smear residue to near-zero alpha; anything below this
// counts as empty.
const EMPTY_SCAN_ALPHA_THRESHOLD = 4;
let emptyScanCanvas: HTMLCanvasElement | null = null;
let emptyScanCtx: CanvasRenderingContext2D | null = null;

function scanCanvasIsEmpty(): boolean {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return true;
  if (!emptyScanCanvas) {
    emptyScanCanvas = document.createElement('canvas');
    emptyScanCtx = emptyScanCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!emptyScanCtx) return true;
  // Scan relative to CSS pixels so the readback loop stays the same size
  // regardless of renderScale.
  const w = Math.max(1, Math.ceil((canvas.width * EMPTY_SCAN_SCALE) / renderScale));
  const h = Math.max(1, Math.ceil((canvas.height * EMPTY_SCAN_SCALE) / renderScale));
  if (emptyScanCanvas.width !== w || emptyScanCanvas.height !== h) {
    emptyScanCanvas.width = w;
    emptyScanCanvas.height = h;
  } else {
    emptyScanCtx.clearRect(0, 0, w, h);
  }
  emptyScanCtx.drawImage(canvas, 0, 0, w, h);
  const { data } = emptyScanCtx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= EMPTY_SCAN_ALPHA_THRESHOLD) return false;
  }
  return true;
}

// Viewport grew beyond the current virtual canvas (e.g. a desktop window
// stretched larger). Grow it and copy existing pixels so no drawing is lost.
function growVirtualCanvas(
  existing: HTMLCanvasElement,
  newW: number,
  newH: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const grown = document.createElement('canvas');
  grown.width = newW;
  grown.height = newH;
  const grownCtx = grown.getContext('2d');
  if (grownCtx) grownCtx.drawImage(existing, 0, 0);
  return { canvas: grown, ctx: grownCtx };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  // A max(w,h) square covers both orientations, so rotation never loses pixels;
  // anything larger (e.g. a resized desktop window) goes through the grow path.
  const squareSide = Math.ceil(Math.max(rect.width, rect.height) * renderScale);
  if (!virtualCanvas) {
    virtualCanvas = document.createElement('canvas');
    virtualCanvas.width = squareSide;
    virtualCanvas.height = squareSide;
    virtualCtx = virtualCanvas.getContext('2d');
  } else if (squareSide > virtualCanvas.width || squareSide > virtualCanvas.height) {
    const newW = Math.max(squareSide, virtualCanvas.width);
    const newH = Math.max(squareSide, virtualCanvas.height);
    ({ canvas: virtualCanvas, ctx: virtualCtx } = growVirtualCanvas(virtualCanvas, newW, newH));
  }

  syncVirtualCanvas();

  canvas.width = Math.round(rect.width * renderScale);
  canvas.height = Math.round(rect.height * renderScale);

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

// The picture must survive resize/rotation, so the visible canvas is copied
// into the off-screen virtual canvas after each completed drawing op (rather
// than mirroring every stroke segment in the pointer hot path). The visible
// region maps 1:1 to the virtual canvas at the origin, and the clearRect is
// required so erased pixels propagate.
function syncVirtualCanvas() {
  if (!virtualCtx || canvas.width === 0 || canvas.height === 0) return;
  virtualCtx.clearRect(0, 0, canvas.width, canvas.height);
  virtualCtx.drawImage(canvas, 0, 0);
}

// One quadratic segment per input point: the path runs midpoint-to-midpoint
// with the raw point as the control, so consecutive segments share a tangent
// and the stroke curves smoothly instead of showing straight-chord corners.
function strokeSmoothSegments(ps: PointerState, points: { x: number; y: number }[]) {
  ctx.globalCompositeOperation = ps.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ps.color;
  ctx.lineWidth = ps.lineWidth;
  ctx.beginPath();
  ctx.moveTo(ps.midX, ps.midY);
  for (const { x, y } of points) {
    const midX = (ps.x + x) / 2;
    const midY = (ps.y + y) / 2;
    ctx.quadraticCurveTo(ps.x, ps.y, midX, midY);
    ps.x = x;
    ps.y = y;
    ps.midX = midX;
    ps.midY = midY;
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function releaseAllPointers() {
  if (!ctx) return;
  ctx.beginPath();

  if (activePointers.size > 0) syncVirtualCanvas();
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

  // One snapshot per stroke group (active-pointer count going 0 → 1), not per
  // finger: a multi-touch gesture undoes as a single unit, and later fingers
  // skip the full-canvas copy so they start instantly.
  if (activePointers.size === 0) saveUndoSnapshot();
  setCanvasEmptyState(false);

  const { x, y } = pointerToCanvas(e);

  // The eraser runs a bit larger than the pen at the same stroke level. Stroke
  // widths are authored in CSS pixels, so they scale to backing-store pixels.
  const lineWidth =
    (eraserActive ? currentLineWidth * ERASER_SIZE_MULTIPLIER : currentLineWidth) * renderScale;

  activePointers.set(e.pointerId, {
    x,
    y,
    midX: x,
    midY: y,
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

  ctx.globalCompositeOperation = op;
  ctx.strokeStyle = currentColor;
  ctx.fillStyle = currentColor;
  ctx.beginPath();
  ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.globalCompositeOperation = 'source-over';

  if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });

  if (e.pointerType !== 'pen') {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  }
}

// Honest sliding window: stamp each move's distance with its time, drop
// samples older than windowMs, then divide the distance covered since the
// oldest surviving sample by that elapsed span. (The oldest sample is the
// anchor for the span, so its own distance — travelled before it — is excluded.)
function calculateStrokeSpeed(
  samples: { t: number; distance: number }[],
  newSample: { t: number; distance: number },
  windowMs: number
): number {
  samples.push(newSample);
  const cutoff = newSample.t - windowMs;
  while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
  let windowDistance = 0;
  for (let i = 1; i < samples.length; i++) windowDistance += samples[i].distance;
  const windowSpan = Math.max(newSample.t - samples[0].t, 1);
  return windowDistance / windowSpan;
}

function draw(e: PointerEvent) {
  const pointerState = activePointers.get(e.pointerId);
  if (!pointerState || !pointerState.isDrawing) return;

  e.preventDefault();

  // Browsers coalesce fast input to ~one pointermove per frame but keep the
  // intermediate samples; replay them all so quick scribbles don't render as
  // straight chords. Synthetic/untrusted events report an empty list — fall
  // back to the event itself.
  const coalesced = e.getCoalescedEvents?.() ?? [];
  const events = coalesced.length > 0 ? coalesced : [e];
  const points = events.map(pointerToCanvas);

  const now = Date.now();

  // A resumed pointer (see POINTER_RESUME_GAP_MS) reappears far from where it
  // left off after an idle gap, with no coalesced samples bridging the two.
  // Restart the path there so the next segment doesn't span the gap.
  const resume = points[0];
  const resumeDeltaX = resume.x - pointerState.x;
  const resumeDeltaY = resume.y - pointerState.y;
  const jump = Math.sqrt(resumeDeltaX * resumeDeltaX + resumeDeltaY * resumeDeltaY);
  const jumpThreshold = POINTER_RESUME_JUMP_RATIO * Math.min(canvas.width, canvas.height);
  if (now - pointerState.lastTime > POINTER_RESUME_GAP_MS && jump > jumpThreshold) {
    pointerState.x = resume.x;
    pointerState.y = resume.y;
    pointerState.midX = resume.x;
    pointerState.midY = resume.y;
    pointerState.speedSamples = [{ t: now, distance: 0 }];
    ctx.beginPath();
  }

  // Speed is sampled from the final event only: one chord per pointermove,
  // matching the cadence the sliding window was tuned for.
  const last = points[points.length - 1];
  const deltaX = last.x - pointerState.x;
  const deltaY = last.y - pointerState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const speed = calculateStrokeSpeed(
    pointerState.speedSamples,
    { t: now, distance },
    SPEED_WINDOW_MS
  );

  strokeSmoothSegments(pointerState, points);

  pointerState.lastTime = now;

  if (onDrawSoundCallback) onDrawSoundCallback({ speed });
}

function stopDrawing(e?: PointerEvent) {
  if (!e) return;

  const pointerState = activePointers.get(e.pointerId);

  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();

  if (pointerState) {
    syncVirtualCanvas();
    if (pointerState.erase) setCanvasEmptyState(scanCanvasIsEmpty());
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snapshot.image, 0, 0);
  // Wipe the whole virtual canvas (not just the visible region) so undone
  // content doesn't reappear from off-screen after a rotation.
  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
    virtualCtx.drawImage(snapshot.image, 0, 0);
  }

  setCanvasEmptyState(snapshot.wasEmpty);

  canUndo = undoStack.length > 0;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  onCanvasEmptyChange = options.onCanvasEmptyChange || null;
  currentColor = options.initialColor || '#AB71E1';

  renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);

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

  // Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
  // first export. Safari lacks requestIdleCallback.
  const warmTexture = () => void loadPaperTexture();
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmTexture);
  } else {
    setTimeout(warmTexture, 0);
  }

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
  // Only a genuine change arms the debounce. The reactive bridge in
  // DrawingCanvas re-pushes the current color on mount (and on unrelated
  // store updates); arming on those would swallow the user's first stroke.
  if (color === currentColor) return;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
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

  // Snapshot the strokes before any await: save-on-delete fire-and-forgets the
  // export and then clears the live canvas synchronously, so reading `canvas`
  // after the paper-texture await (even a cache hit yields a microtask) would
  // export a blank page.
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d')!.drawImage(canvas, 0, 0);

  // Compose in CSS-pixel coordinates at an export scale of at least 2×, so the
  // paper texture and overlay keep their on-screen proportions while the
  // already-high-res strokes pass through with minimal resampling.
  const exportScale = Math.max(window.devicePixelRatio || 1, 2);
  const w = snapshot.width / renderScale;
  const h = snapshot.height / renderScale;

  const out = document.createElement('canvas');
  out.width = Math.round(w * exportScale);
  out.height = Math.round(h * exportScale);
  const outCtx = out.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.scale(exportScale, exportScale);

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

  outCtx.drawImage(snapshot, 0, 0, w, h);

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
