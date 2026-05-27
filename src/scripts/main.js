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
  releaseAllPointers,
  focusCanvas,
  undo,
  getCanUndo,
  isCanvasEmpty,
  setStrokeWidth
} from './drawingCanvas.js';
import { initColorPalette } from './colorPalette.js';
import { initActionsPanel, updateUndoButton, updateScreenshotButton } from './actionsPanel.js';
import { initPWAUpdates } from './pwaUpdate.js';
import { playDrawSound, stopDrawSound } from './drawingSound.js';
import { initParentHelp } from './parentHelp.js';
import { isScreenshotEnabled, saveScreenshot } from './screenshot.js';
import {
  isStrokeWidthControlEnabled,
  getStrokeSize,
  setStrokeSize,
  getStrokeWidthPx
} from './strokeWidth.js';
import {
  initColoringBook,
  isColoringBookEnabled,
  setColoringBookButtonVisible
} from './coloringBook.js';

// Canvas setup
const canvas = document.getElementById('drawingCanvas');

// Initialize Color Palette
const { initialColor } = initColorPalette({
  openColorPicker,
  hasCustomColorSelected,
  getCustomColor,
  updateGradientSwatchRing,
  setColor,
  releaseAllPointers,
  updateColorChangeTime,
  focusCanvas
});

// Initialize Drawing Canvas
initDrawingCanvas(canvas, {
  initialColor: initialColor,
  onDrawSound: playDrawSound,
  onDrawStop: stopDrawSound,
  onUndoStateChange: (canUndo) => {
    updateUndoButton(canUndo);
  },
  onCanvasEmptyChange: (empty) => {
    updateScreenshotButton(!empty);
  }
});

// Apply the persisted stroke width before any drawing happens
setStrokeWidth(getStrokeWidthPx());

// Initialize Actions Panel
initActionsPanel({
  onUndo: () => {
    undo();
  },
  onScreenshot: () => {
    saveScreenshot();
  },
  onStrokeSize: (size) => {
    setStrokeSize(size);
    setStrokeWidth(getStrokeWidthPx(size));
  },
  initialCanUndo: getCanUndo(),
  initialCanScreenshot: !isCanvasEmpty(),
  initialScreenshotVisible: isScreenshotEnabled(),
  initialStrokeWidthVisible: isStrokeWidthControlEnabled(),
  initialStrokeSize: getStrokeSize()
});

// Initialize Color Picker
initColorPicker((selectedColor) => {
  // Callback when a color is selected
  setColor(selectedColor);
  updateGradientSwatchRing();
  releaseAllPointers();
  updateColorChangeTime();

  // Focus canvas to ensure it can receive events immediately (iOS fix)
  focusCanvas();
});

// Initialize Clear Button
initClearButton(
  () => {
    // onClearStart callback - stop any drawing
    releaseAllPointers();
  },
  () => {
    // onClearComplete callback - stop any playing sounds
    stopDrawSound();
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

// Initialize PWA auto-update system
initPWAUpdates();

// Initialize Parent Help modal
initParentHelp();

// Initialize Coloring Book picker
initColoringBook();
setColoringBookButtonVisible(isColoringBookEnabled());
