import { Howl } from 'howler';
import { initVersionBadge } from './version.js';
import {
  initColorPicker,
  openColorPicker,
  updateGradientSwatchRing,
  getCustomColor,
  hasCustomColorSelected
} from './colorPicker.js';
import { initClearButton } from './clearCanvas.js';
import {
  initDrawingCanvas,
  setColor,
  getCurrentColor,
  updateColorChangeTime,
  releaseAllPointers
} from './drawingCanvas.js';

// Canvas setup
const canvas = document.getElementById('drawingCanvas');

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
const initialColor = colorSwatches[0].dataset.color;
// Set initial Selection Ring color
colorSwatches[0].style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${initialColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;

// Prevent Color Palette from interfering with drawing
colorPalette.addEventListener('pointerdown', (e) => {
  releaseAllPointers();
  updateColorChangeTime();
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

      if (hasCustomColorSelected()) {
        setColor(getCustomColor());
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
      setColor(btn.dataset.color);

      // Set Selection Ring to match swatch color
      btn.style.boxShadow = `0 0 0 0.5px white, 0 0 0 4.5px ${btn.dataset.color}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
    }

    // Release all pointers and reset state
    releaseAllPointers();
    updateColorChangeTime();

    e.preventDefault();
    e.stopPropagation();
  });

  // Prevent pointer events from being captured by the canvas
  btn.addEventListener('pointerdown', (e) => {
    // Release all pointers and reset state
    releaseAllPointers();
    updateColorChangeTime();

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

// Initialize Drawing Canvas
const { ctx } = initDrawingCanvas(canvas, {
  initialColor: initialColor,
  onDrawSound: playDrawSound
});

// Initialize Color Picker
initColorPicker((selectedColor) => {
  // Callback when a color is selected
  setColor(selectedColor);
  updateGradientSwatchRing();
  releaseAllPointers();
  updateColorChangeTime();
});

// Initialize Clear Button
initClearButton(
  canvas,
  ctx,
  () => {
    // onClearStart callback - stop any drawing
    releaseAllPointers();
  },
  () => {
    // onClearComplete callback - stop any playing sounds
    if (soundEnabled && pencilSounds.playing()) {
      pencilSounds.stop();
    }
  }
);

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
