import { readInt, writeInt } from '../storage.js';

export const STROKE_SIZES = [1, 2, 3, 4, 5];
export const DEFAULT_SIZE = 3;

// The eraser reuses the pen's stroke-width levels but runs a bit larger at
// each level — matching the pen exactly makes precise erasing frustrating.
export const ERASER_SIZE_MULTIPLIER = 1.4;

const SIZE_KEY = 'splotch-stroke-width-size';

const SIZE_TO_PX = {
  1: 2,
  2: 4,
  3: 8,
  4: 14,
  5: 22
};

export const strokeState = $state({
  size: readInt(SIZE_KEY, DEFAULT_SIZE, STROKE_SIZES),
  menuOpen: false
});

export function setStrokeSize(size) {
  if (!STROKE_SIZES.includes(size)) return;
  strokeState.size = size;
  writeInt(SIZE_KEY, size);
}

export function getStrokeWidthPx(size = strokeState.size) {
  return SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE];
}

export function getEraserWidthPx(size = strokeState.size) {
  return getStrokeWidthPx(size) * ERASER_SIZE_MULTIPLIER;
}
