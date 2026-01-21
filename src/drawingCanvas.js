// Drawing canvas functionality with multi-touch support

let canvas, ctx;
let currentColor = '';
let lastColorChangeTime = 0;
let activePointerIds = new Set();
let activePointers = new Map();
let onDrawSoundCallback = null;

// Set canvas size to fill container
function resizeCanvas() {
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  // Store current drawing if canvas has content
  const imageData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

  canvas.width = rect.width;
  canvas.height = rect.height;

  // Restore drawing if it existed
  if (imageData) {
    ctx.putImageData(imageData, 0, 0);
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
  // Prevent drawing immediately after color change (helps with Apple Pencil)
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  if (timeSinceColorChange < 100) {
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
      color: currentColor
    });
    activePointerIds.add(e.pointerId);
  }

  ctx.strokeStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(x, y);

  // Notify callback to play draw sound
  if (onDrawSoundCallback) {
    onDrawSoundCallback();
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

  // Use the color from when this pointer started drawing
  ctx.strokeStyle = pointerState.color;
  ctx.beginPath();
  ctx.moveTo(pointerState.x, pointerState.y);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Update this pointer's last position
  pointerState.x = x;
  pointerState.y = y;

  // Notify callback to play draw sound
  if (onDrawSoundCallback) {
    onDrawSoundCallback();
  }
}

function stopDrawing(e) {
  if (!e || e.pointerId === undefined) return;

  // Remove this pointer from active tracking
  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();

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
