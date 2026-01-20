import { Howl } from 'howler';

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
let isDrawing = false;
let currentColor = ''; // Will be set from first color button
let lastX = 0;
let lastY = 0;

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

// Color picker
const colorButtons = document.querySelectorAll('.color-btn');
const colorPicker = document.querySelector('.color-picker');

// Set initial color from first button
currentColor = colorButtons[0].dataset.color;

colorButtons.forEach(btn => {
  // Use pointerup instead of click for better stylus/touch support
  btn.addEventListener('pointerup', (e) => {
    colorButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    e.stopPropagation();
  });

  // Prevent pointer events from being captured by the canvas
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
});

// Hide buttons that don't fully fit in the available space
function updateVisibleButtons() {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const pickerRect = colorPicker.getBoundingClientRect();

  if (isPortrait) {
    // Portrait: horizontal layout
    const padding = 10;
    const gap = 10;
    const buttonSize = 60;
    const availableWidth = pickerRect.width - (padding * 2);

    let currentWidth = 0;
    colorButtons.forEach((btn, index) => {
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
    const totalButtons = colorButtons.length;
    const heightNeededFor1Column = (buttonSize * totalButtons) + (gap * (totalButtons - 1));

    // Use 1 column if all buttons fit, otherwise use 2 columns
    if (heightNeededFor1Column <= availableHeight) {
      // 1 column - all buttons fit
      colorPicker.style.gridTemplateColumns = '1fr';
      colorButtons.forEach(btn => {
        btn.style.display = 'block';
      });
    } else {
      // 2 columns - calculate how many rows fit
      colorPicker.style.gridTemplateColumns = 'repeat(2, 1fr)';
      const numRows = Math.floor((availableHeight + gap) / (buttonSize + gap));
      const maxButtons = numRows * 2;

      colorButtons.forEach((btn, index) => {
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
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;

  ctx.strokeStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);

  playDrawSound();

  // Capture pointer to ensure smooth drawing
  canvas.setPointerCapture(e.pointerId);
}

function draw(e) {
  if (!isDrawing) return;

  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.lineTo(x, y);
  ctx.stroke();

  lastX = x;
  lastY = y;

  playDrawSound();
}

function stopDrawing(e) {
  if (!isDrawing) return;

  isDrawing = false;
  ctx.beginPath();

  // Release pointer capture
  if (e && e.pointerId !== undefined) {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore errors if pointer capture wasn't set
    }
  }
}

// Pointer events for drawing
canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointerout', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// Trash button drag functionality
const trashButton = document.getElementById('trashButton');
let isDragging = false;
let savedCanvas = null;
let initialButtonY = 0;
let dragOffsetY = 0;

// Create clear line indicator
const clearLine = document.createElement('div');
clearLine.className = 'clear-line';
document.body.appendChild(clearLine);

// Create delete threshold indicator
const thresholdLine = document.createElement('div');
thresholdLine.className = 'threshold-line';
document.body.appendChild(thresholdLine);

// Create page turn overlay
const pageTurnOverlay = document.createElement('div');
pageTurnOverlay.className = 'page-turn-overlay';
document.body.appendChild(pageTurnOverlay);

function startTrashDrag(e) {
  isDragging = true;
  trashButton.classList.add('dragging');

  // Save current canvas state
  savedCanvas = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Store initial button position and drag offset
  const rect = trashButton.getBoundingClientRect();
  initialButtonY = rect.top;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  dragOffsetY = clientY - rect.top;

  // Show clear line and threshold indicator
  clearLine.style.display = 'block';
  thresholdLine.style.display = 'block';
  const thresholdY = window.innerHeight * 0.85;
  const thresholdHeight = window.innerHeight - thresholdY;
  thresholdLine.style.height = `${thresholdHeight}px`;
  console.log('Threshold zone height:', thresholdHeight);

  e.preventDefault();
  e.stopPropagation();
}

function dragTrash(e) {
  if (!isDragging) return;

  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  const newY = clientY - dragOffsetY;

  // Check if past delete threshold
  const screenHeight = window.innerHeight;
  const bottomThreshold = screenHeight * 0.85;
  const isPastThreshold = clientY >= bottomThreshold;

  // Visual feedback when past threshold
  if (isPastThreshold) {
    trashButton.classList.add('delete-ready');
  } else {
    trashButton.classList.remove('delete-ready');
  }

  // Only allow dragging downward
  if (newY > initialButtonY) {
    trashButton.style.top = `${newY}px`;
    trashButton.style.transition = 'none';

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

function stopTrashDrag(e) {
  if (!isDragging) return;

  isDragging = false;
  trashButton.classList.remove('dragging');
  trashButton.classList.remove('delete-ready');

  // Hide clear line and threshold indicator
  clearLine.style.display = 'none';
  thresholdLine.style.display = 'none';

  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
  const screenHeight = window.innerHeight;
  const bottomThreshold = screenHeight * 0.85; // Bottom 15%

  // Get the correct initial position (check if portrait or landscape)
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const initialTop = isPortrait ? '100px' : '20px';

  if (clientY >= bottomThreshold) {
    // Clear confirmed - trigger page turn animation
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
      trashButton.style.transition = 'none';
      trashButton.style.top = initialTop;
    }, 600);
  } else {
    // Restore canvas
    if (savedCanvas) {
      ctx.putImageData(savedCanvas, 0, 0);
      savedCanvas = null;
    }

    // Bounce back with animation
    trashButton.style.transition = 'top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    trashButton.style.top = initialTop;
  }

  e.preventDefault();
  e.stopPropagation();
}

trashButton.addEventListener('pointerdown', startTrashDrag);
document.addEventListener('pointermove', dragTrash);
document.addEventListener('pointerup', stopTrashDrag);
document.addEventListener('pointercancel', stopTrashDrag);

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
