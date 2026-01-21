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
import { initColorPalette } from './colorPalette.js';
import { initPWAUpdates } from './pwaUpdate.js';

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

// Initialize Color Palette
const { initialColor } = initColorPalette({
  openColorPicker,
  hasCustomColorSelected,
  getCustomColor,
  updateGradientSwatchRing,
  setColor,
  releaseAllPointers,
  updateColorChangeTime
});

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

// Initialize PWA auto-update system
initPWAUpdates();
