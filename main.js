import { Howl } from 'howler';
import { initVersionBadge } from './version.js';

// Canvas setup
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });

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

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Drawing state
let currentColor = ''; // Will be set from first color button
let lastColorChangeTime = 0; // Track when color was last changed
let activePointerIds = new Set(); // Track all active pointer IDs
let activePointers = new Map(); // Track each pointer's state: { x, y, isDrawing }

// Sound setup
let soundEnabled = true;
const pencilSounds = new Howl({
  src: ['/sounds/pencil.mp3'],
  sprite: {
    draw1: [0, 100],
    draw2: [100, 100],
    draw3: [200, 100]
  },
  volume: 0.3
});

let lastSoundTime = 0;
const soundThrottle = 50; // Play sound at most every 50ms

function playDrawSound() {
  if (!soundEnabled) return;

  const now = Date.now();
  if (now - lastSoundTime < soundThrottle) return;

  lastSoundTime = now;
  const randomSound = `draw${Math.floor(Math.random() * 3) + 1}`;
  pencilSounds.play(randomSound);
}

// Color Palette
const colorSwatches = document.querySelectorAll('.color-swatch');
const colorPalette = document.querySelector('.color-palette');

// Set initial color from first swatch
currentColor = colorSwatches[0].dataset.color;
// Set initial Selection Ring color
colorSwatches[0].style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${currentColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;

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

// Prevent Color Palette from interfering with drawing
colorPalette.addEventListener('pointerdown', (e) => {
  releaseAllPointers();
  lastColorChangeTime = Date.now();
  e.preventDefault();
  e.stopPropagation();
});

colorPalette.addEventListener('pointerup', (e) => {
  e.stopPropagation();
});

colorSwatches.forEach(btn => {
  // Use pointerup instead of click for better stylus/touch support
  btn.addEventListener('pointerup', (e) => {
    colorSwatches.forEach(b => {
      b.classList.remove('active');
      b.style.boxShadow = ''; // Clear Selection Ring
    });
    btn.classList.add('active');
    currentColor = btn.dataset.color;

    // Set Selection Ring to match swatch color
    btn.style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${currentColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;

    // Release all pointers and reset state
    releaseAllPointers();
    lastColorChangeTime = Date.now();

    e.preventDefault();
    e.stopPropagation();
  });

  // Prevent pointer events from being captured by the canvas
  btn.addEventListener('pointerdown', (e) => {
    // Release all pointers and reset state
    releaseAllPointers();
    lastColorChangeTime = Date.now();

    e.preventDefault();
    e.stopPropagation();
  });

  // Handle pointer cancel
  btn.addEventListener('pointercancel', (e) => {
    releaseAllPointers();
    e.stopPropagation();
  });
});

// Hide buttons that don't fully fit in the available space
function updateVisibleButtons() {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const pickerRect = colorPalette.getBoundingClientRect();

  if (isPortrait) {
    // Portrait: horizontal layout
    const padding = 10;
    const gap = 10;
    const buttonSize = 60;
    const availableWidth = pickerRect.width - (padding * 2);

    let currentWidth = 0;
    colorSwatches.forEach((btn, index) => {
      const btnWidth = buttonSize + (index > 0 ? gap : 0);

      if (currentWidth + btnWidth <= availableWidth) {
        btn.style.display = 'block';
        currentWidth += btnWidth;
      } else {
        btn.style.display = 'none';
      }
    });
  } else {
    // Landscape: 1 or 2-column grid layout depending on available height
    const padding = 12;
    const gap = 12;
    const buttonSize = 60;
    const availableHeight = pickerRect.height - (padding * 2);

    // Calculate how many buttons can fit vertically
    const totalButtons = colorSwatches.length;
    const heightNeededFor1Column = (buttonSize * totalButtons) + (gap * (totalButtons - 1));

    // Use 1 column if all buttons fit, otherwise use 2 columns
    if (heightNeededFor1Column <= availableHeight) {
      // 1 column - all buttons fit
      colorPalette.style.gridTemplateColumns = '1fr';
      colorSwatches.forEach(btn => {
        btn.style.display = 'block';
      });
    } else {
      // 2 columns - calculate how many rows fit
      colorPalette.style.gridTemplateColumns = 'repeat(2, 1fr)';
      const numRows = Math.floor((availableHeight + gap) / (buttonSize + gap));
      const maxButtons = numRows * 2;

      colorSwatches.forEach((btn, index) => {
        if (index < maxButtons) {
          btn.style.display = 'block';
        } else {
          btn.style.display = 'none';
        }
      });
    }
  }
}

// Update on load and resize
window.addEventListener('resize', updateVisibleButtons);
window.addEventListener('orientationchange', updateVisibleButtons);
// Run after initial layout
setTimeout(updateVisibleButtons, 100);

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

  playDrawSound();

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

  playDrawSound();
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

// Pointer events for drawing
canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointerout', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// Clear Button drag functionality
const clearButton = document.getElementById('clearButton');
let isDragging = false;
let savedCanvas = null;
let initialButtonY = 0;
let dragOffsetY = 0;

// Create Clear Preview Line indicator
const clearLine = document.createElement('div');
clearLine.className = 'clear-line';
document.body.appendChild(clearLine);

// Create Clear Accept Zone indicator
const acceptZone = document.createElement('div');
acceptZone.className = 'clear-accept-zone';
document.body.appendChild(acceptZone);

// Create Page Turn Overlay
const pageTurnOverlay = document.createElement('div');
pageTurnOverlay.className = 'page-turn-overlay';
document.body.appendChild(pageTurnOverlay);

function startClearDrag(e) {
  isDragging = true;
  releaseAllPointers(); // Stop any drawing
  clearButton.classList.add('dragging');

  // Save current canvas state
  savedCanvas = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Store initial button position and drag offset
  const rect = clearButton.getBoundingClientRect();
  initialButtonY = rect.top;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  dragOffsetY = clientY - rect.top;

  // Show Clear Preview Line and Accept Zone
  clearLine.style.display = 'block';
  acceptZone.style.display = 'block';
  const acceptY = window.innerHeight * 0.85;
  const acceptHeight = window.innerHeight - acceptY;
  acceptZone.style.height = `${acceptHeight}px`;
  console.log('Accept zone height:', acceptHeight);

  e.preventDefault();
  e.stopPropagation();
}

function dragClear(e) {
  if (!isDragging) return;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  const newY = clientY - dragOffsetY;

  // Check if entered Accept Zone
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85;
  const isPastThreshold = clientY >= acceptThreshold;

  // Visual feedback when in Accept Zone
  if (isPastThreshold) {
    clearButton.classList.add('delete-ready');
  } else {
    clearButton.classList.remove('delete-ready');
  }

  // Only allow dragging downward
  if (newY > initialButtonY) {
    clearButton.style.top = `${newY}px`;
    clearButton.style.transition = 'none';

    // Get canvas position on screen
    const canvasRect = canvas.getBoundingClientRect();
    const canvasTop = canvasRect.top;

    // Calculate clear height relative to canvas
    const clearScreenY = newY + 45; // 45 is half the button height
    const clearCanvasY = clearScreenY - canvasTop;
    const clearHeight = Math.max(0, clearCanvasY);

    // Preview the clear: clear from top of canvas to button position
    ctx.putImageData(savedCanvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, clearHeight);

    // Position the clear line at the edge of cleared area (in screen coordinates)
    clearLine.style.top = `${clearScreenY}px`;
    clearLine.style.visibility = 'visible';
  }

  e.preventDefault();
  e.stopPropagation();
}

function stopClearDrag(e) {
  if (!isDragging) return;

  isDragging = false;
  clearButton.classList.remove('dragging');
  clearButton.classList.remove('delete-ready');

  // Hide Clear Preview Line and Accept Zone
  clearLine.style.display = 'none';
  acceptZone.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const acceptThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const initialTop = isPortrait ? '100px' : '20px';

  if (clientY >= acceptThreshold) {
    // Clear confirmed - trigger Page Turn Overlay animation
    pageTurnOverlay.classList.add('animating');

    // Stop any playing sounds
    if (soundEnabled && pencilSounds.playing()) {
      pencilSounds.stop();
    }

    // Clear canvas halfway through animation
    setTimeout(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      savedCanvas = null;
    }, 300);

    // Remove animation and reset button after animation completes
    setTimeout(() => {
      pageTurnOverlay.classList.remove('animating');
      clearButton.style.transition = 'none';
      clearButton.style.top = initialTop;
    }, 600);
  } else {
    // Restore canvas
    if (savedCanvas) {
      ctx.putImageData(savedCanvas, 0, 0);
      savedCanvas = null;
    }

    // Bounce back with animation
    clearButton.style.transition = 'top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    clearButton.style.top = initialTop;
  }

  e.preventDefault();
  e.stopPropagation();
}

clearButton.addEventListener('pointerdown', startClearDrag);
document.addEventListener('pointermove', dragClear);
document.addEventListener('pointerup', stopClearDrag);
document.addEventListener('pointercancel', stopClearDrag);

// Prevent context menu on long press
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Request wake lock to prevent screen sleep
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock activated');
    }
  } catch (err) {
    console.log('Wake lock error:', err);
  }
}

// Request wake lock on first user interaction
document.addEventListener('pointerdown', requestWakeLock, { once: true });

// Re-request wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

// Initialize Version Badge display
initVersionBadge(releaseAllPointers);
