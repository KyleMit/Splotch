// Imperative drawing engine. Owns the <canvas>, the virtual canvas, the
// undo stack, and the pointer tracking. Svelte components mount this on
// onMount and adapt reactive state (active color, stroke width) by calling
// setColor() / setStrokeWidth() from $effect.

let canvas, ctx;
let currentColor = '';
let currentLineWidth = 8;
let lastColorChangeTime = 0;
let activePointerIds = new Set();
let activePointers = new Map();
let onDrawSoundCallback = null;
let onDrawStopCallback = null;

let virtualCanvas = null;
let virtualCtx = null;

let undoStack = [];
const MAX_UNDO_STACK_SIZE = 10;
let canUndo = false;
let onUndoStateChange = null;

let canvasEmpty = true;
let onCanvasEmptyChange = null;

function setCanvasEmptyState(empty) {
  if (canvasEmpty === empty) return;
  canvasEmpty = empty;
  if (onCanvasEmptyChange) onCanvasEmptyChange(empty);
}

function scanCanvasIsEmpty() {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  if (!virtualCanvas) {
    virtualCanvas = document.createElement('canvas');
    virtualCanvas.width = Math.max(rect.width, rect.height) * 2;
    virtualCanvas.height = Math.max(rect.width, rect.height) * 2;
    virtualCtx = virtualCanvas.getContext('2d');
    virtualCtx.lineCap = 'round';
    virtualCtx.lineJoin = 'round';
  }

  if (canvas.width > 0 && canvas.height > 0) {
    virtualCtx.drawImage(canvas, 0, 0);
  }

  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);

  ctx.drawImage(virtualCanvas, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function pointerToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
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

function startDrawing(e) {
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 0 : 100;
  if (timeSinceColorChange < requiredDelay) return;

  saveUndoSnapshot();
  setCanvasEmptyState(false);

  const { x, y } = pointerToCanvas(e);

  if (e.pointerId !== undefined) {
    activePointers.set(e.pointerId, {
      x,
      y,
      isDrawing: true,
      color: currentColor,
      lineWidth: currentLineWidth,
      lastTime: Date.now(),
      distanceWindow: [],
      windowStartTime: Date.now()
    });
    activePointerIds.add(e.pointerId);
  }

  ctx.strokeStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(x, y);

  if (virtualCtx) {
    virtualCtx.strokeStyle = currentColor;
    virtualCtx.beginPath();
    virtualCtx.moveTo(x, y);
  }

  if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });

  if (e.pointerType !== 'pen') {
    try {
      if (e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
    } catch {}
  }
}

function draw(e) {
  const pointerState = activePointers.get(e.pointerId);
  if (!pointerState || !pointerState.isDrawing) return;

  e.preventDefault();

  const { x, y } = pointerToCanvas(e);
  const deltaX = x - pointerState.x;
  const deltaY = y - pointerState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const now = Date.now();
  pointerState.distanceWindow.push(distance);
  const windowDuration = 100;
  if (now - pointerState.windowStartTime > windowDuration) {
    pointerState.distanceWindow.shift();
    pointerState.windowStartTime = now;
  }
  const totalDistance = pointerState.distanceWindow.reduce((sum, d) => sum + d, 0);
  const windowTime = Math.max(now - pointerState.windowStartTime, 1);
  const speed = totalDistance / windowTime;

  ctx.strokeStyle = pointerState.color;
  ctx.lineWidth = pointerState.lineWidth;
  ctx.beginPath();
  ctx.moveTo(pointerState.x, pointerState.y);
  ctx.lineTo(x, y);
  ctx.stroke();

  if (virtualCtx) {
    virtualCtx.strokeStyle = pointerState.color;
    virtualCtx.lineWidth = pointerState.lineWidth;
    virtualCtx.beginPath();
    virtualCtx.moveTo(pointerState.x, pointerState.y);
    virtualCtx.lineTo(x, y);
    virtualCtx.stroke();
  }

  pointerState.x = x;
  pointerState.y = y;
  pointerState.lastTime = now;

  if (onDrawSoundCallback) onDrawSoundCallback({ speed });
}

function stopDrawing(e) {
  if (!e || e.pointerId === undefined) return;

  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();
  if (virtualCtx) virtualCtx.beginPath();

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
  snapshotCtx.drawImage(canvas, 0, 0);

  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO_STACK_SIZE) undoStack.shift();

  canUndo = true;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

export function undo() {
  if (!canUndo || undoStack.length === 0 || !canvas || !ctx) return;

  const snapshot = undoStack.pop();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snapshot, 0, 0);

  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
    virtualCtx.drawImage(snapshot, 0, 0);
  }

  setCanvasEmptyState(scanCanvasIsEmpty());

  canUndo = undoStack.length > 0;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

export function initDrawingCanvas(canvasElement, options = {}) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d', { willReadFrequently: false });

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  onCanvasEmptyChange = options.onCanvasEmptyChange || null;
  currentColor = options.initialColor || '#AB71E1';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerout', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  return {
    teardown() {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('pointerdown', startDrawing);
      canvas.removeEventListener('pointermove', draw);
      canvas.removeEventListener('pointerup', stopDrawing);
      canvas.removeEventListener('pointerout', stopDrawing);
      canvas.removeEventListener('pointercancel', stopDrawing);
    }
  };
}

export function setColor(color) {
  currentColor = color;
  lastColorChangeTime = Date.now();
}

export function setStrokeWidth(widthPx) {
  currentLineWidth = widthPx;
}

export function clearCanvas() {
  saveUndoSnapshot();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
  }
  setCanvasEmptyState(true);
}

export function isCanvasEmpty() {
  return canvasEmpty;
}

let paperTextureImage = null;
let paperTexturePromise = null;
function loadPaperTexture() {
  if (paperTextureImage) return Promise.resolve(paperTextureImage);
  if (paperTexturePromise) return paperTexturePromise;
  paperTexturePromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTextureImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = '/icons/handmade-paper.png';
  });
  return paperTexturePromise;
}

export async function exportCanvasBlob(overlayImage = null, options = {}) {
  const { includePaperTexture = true } = options;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const w = canvas.width;
  const h = canvas.height;

  const out = document.createElement('canvas');
  out.width = Math.round(w * dpr);
  out.height = Math.round(h * dpr);
  const outCtx = out.getContext('2d');
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

export function getActiveCanvas() {
  return canvas;
}
