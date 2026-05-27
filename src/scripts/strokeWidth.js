// Persisted stroke-width preferences: the parental-control toggle that
// shows the picker button, and the currently selected size (1–5).

const CONTROL_ENABLED_KEY = 'splotch-stroke-width-control';
const SIZE_KEY = 'splotch-stroke-width-size';

export const STROKE_SIZES = [1, 2, 3, 4, 5];
export const DEFAULT_SIZE = 3;

// Pixel widths for each size. Size 3 (default) preserves the historical 8px line.
const SIZE_TO_PX = {
  1: 2,
  2: 4,
  3: 8,
  4: 14,
  5: 22
};

let controlEnabled = localStorage.getItem(CONTROL_ENABLED_KEY) !== 'false';

const storedSize = parseInt(localStorage.getItem(SIZE_KEY), 10);
let currentSize = STROKE_SIZES.includes(storedSize) ? storedSize : DEFAULT_SIZE;

export function isStrokeWidthControlEnabled() {
  return controlEnabled;
}

export function setStrokeWidthControlEnabled(enabled) {
  controlEnabled = enabled;
  localStorage.setItem(CONTROL_ENABLED_KEY, enabled.toString());
}

export function getStrokeSize() {
  return currentSize;
}

export function setStrokeSize(size) {
  if (!STROKE_SIZES.includes(size)) return;
  currentSize = size;
  localStorage.setItem(SIZE_KEY, size.toString());
}

export function getStrokeWidthPx(size = currentSize) {
  return SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE];
}
