// Drawing canvas functionality with multi-touch support

let canvas, ctx;
let currentColor = '';
let lastColorChangeTime = 0;
let activePointerIds = new Set();
let activePointers = new Map();
let onDrawSoundCallback = null;
let onDrawStopCallback = null;

// Set canvas size to fill container
function resizeCanvas() {
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  // Store current drawing if canvas has content using a temporary canvas
  // This preserves the ENTIRE drawing, not just what fits in the new dimensions
  let tempCanvas = null;
  if (canvas.width > 0 && canvas.height > 0) {
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);
  }

  canvas.width = rect.width;
  canvas.height = rect.height;

  // Restore drawing if it existed
  if (tempCanvas) {
    ctx.drawImage(tempCanvas, 0, 0);
  }

  // Set drawing properties
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// Helper function to force release all pointer captures
function releaseAllPointers() {
  ctx.beginPath();

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
  // Use shorter delay for Apple Pencil (20ms) vs other inputs (100ms)
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 20 : 100;
  if (timeSinceColorChange < requiredDelay) {
    return;
  }

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

// Initialize drawing canvas
export function initDrawingCanvas(canvasElement, options = {}) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d', { willReadFrequently: false });

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
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

export { releaseAllPointers };
