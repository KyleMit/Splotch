import { readInt, writeInt } from '../storage.js';
import { toolState } from './tool.svelte.js';

export const STROKE_SIZES = [1, 2, 3, 4, 5];
export const DEFAULT_SIZE = 3;

// The eraser runs a bit larger than the pen at the same stroke level — matching
// the pen exactly makes precise erasing frustrating.
export const ERASER_SIZE_MULTIPLIER = 1.4;

// Pen and eraser each remember their own level, persisted separately, so
// switching tools restores the size the child last used for that tool.
const PEN_SIZE_KEY = 'splotch-stroke-width-size'; // pen (existing key)
const ERASER_SIZE_KEY = 'splotch-eraser-width-size'; // eraser (independent)

const SIZE_TO_PX = {
  1: 2,
  2: 4,
  3: 8,
  4: 14,
  5: 22
};

export const strokeState = $state({
  penSize: readInt(PEN_SIZE_KEY, DEFAULT_SIZE, STROKE_SIZES),
  eraserSize: readInt(ERASER_SIZE_KEY, DEFAULT_SIZE, STROKE_SIZES),
  menuOpen: false
});

// The level for the tool that's currently active. Reads toolState so it stays
// reactive inside $derived, $effect, and template expressions.
export function activeStrokeSize() {
  return toolState.eraser ? strokeState.eraserSize : strokeState.penSize;
}

// Set the level for the active tool, persisting only that tool's value.
export function setStrokeSize(size) {
  if (!STROKE_SIZES.includes(size)) return;
  if (toolState.eraser) {
    strokeState.eraserSize = size;
    writeInt(ERASER_SIZE_KEY, size);
  } else {
    strokeState.penSize = size;
    writeInt(PEN_SIZE_KEY, size);
  }
}

export function getStrokeWidthPx(size = strokeState.penSize) {
  return SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE];
}

export function getEraserWidthPx(size = strokeState.eraserSize) {
  return getStrokeWidthPx(size) * ERASER_SIZE_MULTIPLIER;
}
