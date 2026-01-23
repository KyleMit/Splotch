// Drawing canvas functionality with multi-touch support

let canvas, ctx;
let currentColor = '';
let lastColorChangeTime = 0;
let activePointerIds = new Set();
let activePointers = new Map();
let onDrawSoundCallback = null;
let onDrawStopCallback = null;

// Virtual canvas to preserve content across orientation changes
let virtualCanvas = null;
let virtualCtx = null;
let maxWidth = 0;
let maxHeight = 0;

// Undo history - store stack of snapshots (max 10)
let undoStack = [];
const MAX_UNDO_STACK_SIZE = 10;
let canUndo = false;
let onUndoStateChange = null;

// Set canvas size to fill container
function resizeCanvas() {
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  // Initialize virtual canvas on first run
  if (!virtualCanvas) {
    virtualCanvas = document.createElement('canvas');
    virtualCanvas.width = Math.max(rect.width, rect.height) * 2; // Large enough for any orientation
    virtualCanvas.height = Math.max(rect.width, rect.height) * 2;
    virtualCtx = virtualCanvas.getContext('2d');
    virtualCtx.lineWidth = 8;
    virtualCtx.lineCap = 'round';
    virtualCtx.lineJoin = 'round';
  }

  // Save current canvas content to virtual canvas before resizing
  if (canvas.width > 0 && canvas.height > 0) {
    virtualCtx.drawImage(canvas, 0, 0);
    maxWidth = Math.max(maxWidth, canvas.width);
    maxHeight = Math.max(maxHeight, canvas.height);
  }

  // Resize main canvas
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Restore from virtual canvas
  ctx.drawImage(virtualCanvas, 0, 0);

  // Set drawing properties
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Helper function to force release all pointer captures
function releaseAllPointers() {
  ctx.beginPath();
  if (virtualCtx) {
    virtualCtx.beginPath();
  }

  // Clear all active pointers
  activePointers.clear();

  // Try to release all tracked pointer IDs
  activePointerIds.forEach(pointerId => {
    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch (err) {
      // Ignore errors
    }
  });

  activePointerIds.clear();
}

// Drawing functions
function startDrawing(e) {
  // Prevent drawing immediately after color change
  // Use minimal delay for Apple Pencil (0ms) vs other inputs (100ms)
  // Apple Pencil has better precision and doesn't need delay
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 0 : 100;
  if (timeSinceColorChange < requiredDelay) {
    return;
  }

  // Save canvas state before starting new stroke (for undo)
  saveUndoSnapshot();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Track this pointer's state
  if (e.pointerId !== undefined) {
    activePointers.set(e.pointerId, {
      x: x,
      y: y,
      isDrawing: true,
      color: currentColor,
      lastTime: Date.now(),
      distanceWindow: [], // Track recent movements for better speed calculation
      windowStartTime: Date.now()
    });
    activePointerIds.add(e.pointerId);
  }

  ctx.strokeStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(x, y);

  // Also start drawing on virtual canvas
  if (virtualCtx) {
    virtualCtx.strokeStyle = currentColor;
    virtualCtx.beginPath();
    virtualCtx.moveTo(x, y);
  }

  // Notify callback to play draw sound (starting with speed 0)
  if (onDrawSoundCallback) {
    onDrawSoundCallback({ speed: 0 });
  }

  // Don't use pointer capture with Apple Pencil - it causes issues
  if (e.pointerType !== 'pen') {
    try {
      if (e.pointerId !== undefined) {
        canvas.setPointerCapture(e.pointerId);
      }
    } catch (err) {
      // Ignore pointer capture errors
    }
  }
}

function draw(e) {
  // Check if this pointer is actively drawing
  const pointerState = activePointers.get(e.pointerId);
  if (!pointerState || !pointerState.isDrawing) return;

  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Calculate movement distance
  const deltaX = x - pointerState.x;
  const deltaY = y - pointerState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const now = Date.now();

  // Add distance to rolling window
  pointerState.distanceWindow.push(distance);

  // Keep window at ~100ms of data (remove old entries)
  const windowDuration = 100; // ms
  if (now - pointerState.windowStartTime > windowDuration) {
    pointerState.distanceWindow.shift();
    pointerState.windowStartTime = now;
  }

  // Calculate speed as total distance in window / window time
  const totalDistance = pointerState.distanceWindow.reduce((sum, d) => sum + d, 0);
  const windowTime = Math.max(now - pointerState.windowStartTime, 1);
  const speed = totalDistance / windowTime; // pixels per millisecond

  // Use the color from when this pointer started drawing
  ctx.strokeStyle = pointerState.color;
  ctx.beginPath();
  ctx.moveTo(pointerState.x, pointerState.y);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Also draw to virtual canvas
  if (virtualCtx) {
    virtualCtx.strokeStyle = pointerState.color;
    virtualCtx.beginPath();
    virtualCtx.moveTo(pointerState.x, pointerState.y);
    virtualCtx.lineTo(x, y);
    virtualCtx.stroke();
  }

  // Update this pointer's state
  pointerState.x = x;
  pointerState.y = y;
  pointerState.lastTime = now;

  // Notify callback with speed data
  if (onDrawSoundCallback) {
    onDrawSoundCallback({ speed });
  }
}

function stopDrawing(e) {
  if (!e || e.pointerId === undefined) return;

  // Remove this pointer from active tracking
  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();
  if (virtualCtx) {
    virtualCtx.beginPath();
  }

  // Notify callback to stop draw sound
  if (onDrawStopCallback) {
    onDrawStopCallback();
  }

  // Release pointer capture
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (err) {
    // Ignore errors if pointer capture wasn't set
  }
}

// Save canvas snapshot for undo
function saveUndoSnapshot() {
  if (!canvas || !ctx) return;

  // Create new snapshot canvas
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;

  // Copy current canvas state
  const snapshotCtx = snapshot.getContext('2d');
  snapshotCtx.drawImage(canvas, 0, 0);

  // Add to undo stack
  undoStack.push(snapshot);

  // Limit stack size to MAX_UNDO_STACK_SIZE
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift(); // Remove oldest snapshot
  }

  // Update undo availability
  canUndo = true;
  if (onUndoStateChange) {
    onUndoStateChange(canUndo);
  }
}

// Undo last action
export function undo() {
  if (!canUndo || undoStack.length === 0 || !canvas || !ctx) return;

  // Pop the most recent snapshot from the stack
  const snapshot = undoStack.pop();

  // Restore snapshot to canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snapshot, 0, 0);

  // Also restore to virtual canvas
  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
    virtualCtx.drawImage(snapshot, 0, 0);
  }

  // Update undo availability based on remaining stack size
  canUndo = undoStack.length > 0;
  if (onUndoStateChange) {
    onUndoStateChange(canUndo);
  }
}

// Check if undo is available
export function getCanUndo() {
  return undoStack.length > 0;
}

// Initialize drawing canvas
export function initDrawingCanvas(canvasElement, options = {}) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d', { willReadFrequently: false });

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  currentColor = options.initialColor || '#AB71E1';

  // Setup canvas and resize handler
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Add pointer event listeners for drawing
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerout', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  return {
    canvas,
    ctx
  };
}

// Public API
export function setColor(color) {
  currentColor = color;
  lastColorChangeTime = Date.now();
}

export function getCurrentColor() {
  return currentColor;
}

export function updateColorChangeTime() {
  lastColorChangeTime = Date.now();
}

export function clearCanvas() {
  // Clear both the main canvas and virtual canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (virtualCtx && virtualCanvas) {
    virtualCtx.clearRect(0, 0, virtualCanvas.width, virtualCanvas.height);
  }

  // Clear undo history
  undoStack = [];
  canUndo = false;
  if (onUndoStateChange) {
    onUndoStateChange(canUndo);
  }
}

export function focusCanvas() {
  // Focus the canvas to ensure it can receive pointer events immediately
  if (canvas) {
    canvas.focus();
  }
}

export { releaseAllPointers };
