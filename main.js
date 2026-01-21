import { Howl } from 'howler';
import { initVersionBadge } from './version.js';

// Curated color palette for hexagon grid (88 colors)
const CURATED_COLORS = [
  // Reds
  '#FF6B6B', '#EE5A6F', '#E63946', '#D62828', '#C1121F', '#9D0208', '#6A040F',
  '#FF8FA3', '#FFB3C1', '#FF758F', '#E85D75',
  // Oranges
  '#FF9E00', '#FF8C42', '#FB8500', '#F77F00', '#D36135', '#C34A36',
  '#FFAC81', '#FFA07A', '#FF9770', '#FF8552',
  // Yellows
  '#FFD60A', '#FFC300', '#FFB703', '#FFAA00', '#F9C74F', '#F9844A',
  '#FFDD4A', '#FFEA00', '#FFE66D', '#FFD23F',
  // Greens
  '#06D6A0', '#10B981', '#00C896', '#00B894', '#2ECC71', '#27AE60',
  '#8FD694', '#73E2A7', '#52B788', '#40916C', '#2D6A4F',
  '#AED581', '#9CCC65', '#7CB342',
  // Blues
  '#00B4D8', '#0096C7', '#0077B6', '#023E8A', '#03045E',
  '#4CC9F0', '#4EA8DE', '#5390D9', '#5E60CE', '#6A4C93',
  '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5',
  // Purples
  '#B565D8', '#9D4EDD', '#9B59B6', '#8E44AD', '#7209B7', '#5A189A',
  '#C77DFF', '#D8A7FF', '#E0AAFF', '#BA8AFF',
  // Pinks
  '#FF006E', '#E91E63', '#D81B60', '#C2185B',
  '#FF4081', '#F06292', '#EC407A', '#E91E63',
  // Browns & Neutrals
  '#8D6E63', '#795548', '#6D4C41', '#5D4037',
  '#A1887F', '#BCAAA4',
  // Grays & Blacks
  '#546E7A', '#607D8B', '#455A64', '#37474F', '#263238',
  '#78909C', '#90A4AE', '#B0BEC5'
];

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

// Custom color picker state (defined early for use in event handlers)
let customColor = '#AB71E1'; // Default purple
let customColorSelected = false; // Track if user chose a custom color
let currentHoveredHex = null; // Track currently hovered hexagon
let colorPickerOverlay, colorPickerContainer, hexagonGrid; // Will be initialized later

// Color picker functions (defined early for use in event handlers)
function openColorPicker() {
  if (colorPickerOverlay) {
    colorPickerOverlay.classList.add('visible');
    releaseAllPointers(); // Stop any drawing
    lastColorChangeTime = Date.now();
  }
}

function closeColorPicker(selectedColor = null) {
  if (colorPickerOverlay) {
    colorPickerOverlay.classList.remove('visible');

    // Clear any hover state
    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
      currentHoveredHex = null;
    }

    // Update custom color if one was selected
    if (selectedColor) {
      customColor = selectedColor;
      customColorSelected = true;
      currentColor = selectedColor;
      updateGradientSwatchRing();
    }
  }
}

function updateGradientSwatchRing() {
  const gradientSwatch = document.querySelector('.gradient-swatch');
  if (gradientSwatch && gradientSwatch.classList.contains('active')) {
    gradientSwatch.style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${customColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
  }
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
    // Check if this is the gradient swatch
    if (btn.classList.contains('gradient-swatch')) {
      // Always make active and open picker
      colorSwatches.forEach(b => {
        b.classList.remove('active');
        b.style.boxShadow = ''; // Clear Selection Ring
      });
      btn.classList.add('active');

      if (customColorSelected) {
        currentColor = customColor;
        updateGradientSwatchRing();
      }

      openColorPicker();
    } else {
      // Regular color swatch
      colorSwatches.forEach(b => {
        b.classList.remove('active');
        b.style.boxShadow = ''; // Clear Selection Ring
      });
      btn.classList.add('active');
      currentColor = btn.dataset.color;

      // Set Selection Ring to match swatch color
      btn.style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${currentColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
    }

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
  const gradientSwatch = document.querySelector('.gradient-swatch');

  if (isPortrait) {
    // Portrait: horizontal layout
    const padding = 10;
    const gap = 8;
    const buttonSize = 55;
    const availableWidth = pickerRect.width - (padding * 2);

    // Always reserve space for gradient swatch at the end
    const gradientSwatchWidth = buttonSize + gap;
    const availableWidthWithoutGradient = availableWidth - gradientSwatchWidth;

    let currentWidth = 0;
    let visibleCount = 0;

    colorSwatches.forEach((btn, index) => {
      // Skip gradient swatch in initial pass
      if (btn.classList.contains('gradient-swatch')) {
        return;
      }

      const btnWidth = buttonSize + (index > 0 ? gap : 0);

      if (currentWidth + btnWidth <= availableWidthWithoutGradient) {
        btn.style.display = 'block';
        currentWidth += btnWidth;
        visibleCount++;
      } else {
        btn.style.display = 'none';
      }
    });

    // Always show gradient swatch last
    if (gradientSwatch) {
      gradientSwatch.style.display = 'block';
    }
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

      // Always ensure gradient swatch is visible by counting from end
      let visibleCount = 0;
      for (let i = colorSwatches.length - 1; i >= 0; i--) {
        const btn = colorSwatches[i];
        if (visibleCount < maxButtons) {
          btn.style.display = 'block';
          visibleCount++;
        } else {
          btn.style.display = 'none';
        }
      }
    }
  }
}

// Update on load and resize
window.addEventListener('resize', updateVisibleButtons);
window.addEventListener('orientationchange', updateVisibleButtons);
// Run after initial layout
setTimeout(updateVisibleButtons, 100);

// Hexagon generation functions
function generateHexagonPath(centerX, centerY, size) {
  const points = [];
  // Start at 30 degrees (Math.PI/6) for flat-top hexagons
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + (Math.PI / 6); // 60 degrees apart, offset by 30
    const x = centerX + size * Math.cos(angle);
    const y = centerY + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return `M ${points.join(' L ')} Z`;
}

function createHexagonGrid(colors, containerWidth, maxHeight) {
  const hexSize = 26; // Radius of hexagon (distance from center to corner) - slightly smaller

  // For flat-top hexagons
  const hexWidth = hexSize * Math.sqrt(3); // Flat edge to flat edge
  const hexHeight = hexSize * 2; // Point to point

  // Tight honeycomb tessellation - hexagons just touching
  const horizontalSpacing = hexWidth; // Distance between centers in same row (tight)
  const verticalSpacing = hexHeight * 0.75; // Distance between row centers (3/4 height)
  const rowOffset = hexWidth / 2; // Odd rows shift by half width for nesting

  // Calculate columns to fit width
  const columns = Math.max(Math.floor((containerWidth - hexWidth) / horizontalSpacing) + 1, 8);

  // Calculate maximum rows that can fit in the available height
  const padding = 10;
  const maxRows = Math.floor((maxHeight - hexHeight - padding * 2) / verticalSpacing) + 1;

  // Limit rows to what can fit
  const rows = Math.min(maxRows, Math.ceil(colors.length / columns));

  // Limit colors to what we can render
  const maxColors = rows * columns;
  const colorsToRender = colors.slice(0, maxColors);

  // Create SVG container with minimal padding
  const svgWidth = (columns - 1) * horizontalSpacing + hexWidth + rowOffset + 10;
  const svgHeight = (rows - 1) * verticalSpacing + hexHeight + 10;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgWidth);
  svg.setAttribute('height', svgHeight);
  svg.style.display = 'block';
  svg.style.margin = '0 auto';

  let colorIndex = 0;
  for (let row = 0; row < rows && colorIndex < colorsToRender.length; row++) {
    for (let col = 0; col < columns && colorIndex < colorsToRender.length; col++) {
      // Offset odd rows by half the horizontal spacing for interlocking
      const offsetX = row % 2 === 1 ? rowOffset : 0;
      const centerX = col * horizontalSpacing + hexWidth / 2 + 5 + offsetX;
      const centerY = row * verticalSpacing + hexSize + 5;

      const hexPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hexPath.setAttribute('d', generateHexagonPath(centerX, centerY, hexSize));
      hexPath.setAttribute('fill', colorsToRender[colorIndex]);
      hexPath.setAttribute('stroke', 'white');
      hexPath.setAttribute('stroke-width', '1.5');
      hexPath.classList.add('hexagon');
      hexPath.dataset.color = colorsToRender[colorIndex];

      svg.appendChild(hexPath);
      colorIndex++;
    }
  }

  return svg;
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

// Create Color Picker Modal (assign to existing variables)
colorPickerOverlay = document.createElement('div');
colorPickerOverlay.className = 'color-picker-overlay';

colorPickerContainer = document.createElement('div');
colorPickerContainer.className = 'color-picker-container';

hexagonGrid = document.createElement('div');
hexagonGrid.className = 'hexagon-grid';

// Generate hexagon grid with curated colors
// Calculate available space based on viewport
const isPortraitMode = window.matchMedia('(orientation: portrait)').matches;
const modalMaxHeight = isPortraitMode ? window.innerHeight * 0.75 : window.innerHeight * 0.8;
const modalMaxWidth = isPortraitMode ? window.innerWidth * 0.95 : window.innerWidth * 0.9;

// Account for container padding (20px) and grid padding (10px) on both sides
const gridMaxHeight = modalMaxHeight - 60;
const gridMaxWidth = modalMaxWidth - 60;

const hexagonSVG = createHexagonGrid(CURATED_COLORS, gridMaxWidth, gridMaxHeight);
hexagonGrid.appendChild(hexagonSVG);

colorPickerContainer.appendChild(hexagonGrid);
colorPickerOverlay.appendChild(colorPickerContainer);
document.body.appendChild(colorPickerOverlay);

// Hexagon grid interaction handlers
let isTrackingHexDrag = false;

hexagonGrid.addEventListener('pointerdown', (e) => {
  const target = e.target;
  if (target.classList.contains('hexagon')) {
    isTrackingHexDrag = true;

    // Clear previous hover
    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
    }

    // Add hover to current
    currentHoveredHex = target;
    target.classList.add('hover');

    e.preventDefault();
    e.stopPropagation();
  }
});

hexagonGrid.addEventListener('pointermove', (e) => {
  if (!isTrackingHexDrag) return;

  // Find element under pointer
  const element = document.elementFromPoint(e.clientX, e.clientY);

  if (element && element.classList.contains('hexagon') && element !== currentHoveredHex) {
    // Clear previous hover
    if (currentHoveredHex) {
      currentHoveredHex.classList.remove('hover');
    }

    // Add hover to new element
    currentHoveredHex = element;
    element.classList.add('hover');
  }

  e.preventDefault();
  e.stopPropagation();
});

hexagonGrid.addEventListener('pointerup', (e) => {
  if (!isTrackingHexDrag) return;

  isTrackingHexDrag = false;

  // Find element under pointer
  const element = document.elementFromPoint(e.clientX, e.clientY);

  if (element && element.classList.contains('hexagon')) {
    const selectedColor = element.dataset.color;
    closeColorPicker(selectedColor);
  }

  e.preventDefault();
  e.stopPropagation();
});

hexagonGrid.addEventListener('pointercancel', (e) => {
  isTrackingHexDrag = false;

  if (currentHoveredHex) {
    currentHoveredHex.classList.remove('hover');
    currentHoveredHex = null;
  }

  e.stopPropagation();
});

// Close picker when clicking outside the container
colorPickerOverlay.addEventListener('pointerdown', (e) => {
  if (e.target === colorPickerOverlay) {
    closeColorPicker(); // Close without selecting
    e.preventDefault();
    e.stopPropagation();
  }
});

// Prevent container clicks from closing
colorPickerContainer.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
});

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
