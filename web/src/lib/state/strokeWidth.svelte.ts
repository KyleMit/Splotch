import { STORAGE_KEYS, readInt, writeInt, onDurableRestore, type StorageKey } from '../storage';
import { toolState } from './tool.svelte';
import type { CommonIconName } from '$lib/components/iconTypes';

export type StrokeSize = 1 | 2 | 3 | 4 | 5;
export const STROKE_SIZES: readonly StrokeSize[] = [1, 2, 3, 4, 5];
export const DEFAULT_SIZE: StrokeSize = 3;

// Spelled out rather than built from a template string: each literal is checked
// against the generated icon union, so a renamed or deleted SVG is a compile
// error here instead of a blank icon at runtime. The literals are also what
// keeps these SVGs off the orphan list — icon-orphans.test.ts counts an icon as
// referenced only where a quoted string literal of its name appears in non-test
// source, so deriving the names would stop these maps from vouching for their
// own assets. The pairing each map spells out is held by a drift guard in
// strokeWidth.svelte.test.ts.
export const SIZE_ICON: Record<StrokeSize, CommonIconName> = {
  1: 'size-brush-1',
  2: 'size-brush-2',
  3: 'size-brush-3',
  4: 'size-brush-4',
  5: 'size-brush-5',
};

export const MAGIC_SIZE_ICON: Record<StrokeSize, CommonIconName> = {
  1: 'size-magic-1',
  2: 'size-magic-2',
  3: 'size-magic-3',
  4: 'size-magic-4',
  5: 'size-magic-5',
};

export const ERASER_SIZE_ICON: Record<StrokeSize, CommonIconName> = {
  1: 'size-eraser-1',
  2: 'size-eraser-2',
  3: 'size-eraser-3',
  4: 'size-eraser-4',
  5: 'size-eraser-5',
};

// The eraser runs noticeably larger than the pen at the same stroke level — a
// toddler erasing wants big sweeps, not precision, and 1.4× was too subtle to
// feel. Matching the pen exactly makes precise erasing frustrating.
export const ERASER_SIZE_MULTIPLIER = 2;

const SIZE_TO_PX: Record<StrokeSize, number> = {
  1: 2,
  2: 4,
  3: 8,
  4: 14,
  5: 22,
};

function readStrokeLevel(key: StorageKey, fallback: StrokeSize): StrokeSize {
  return readInt(key, fallback, STROKE_SIZES) as StrokeSize;
}

// Drawing brushes (pen/crayon/magic) share one remembered level and the eraser
// keeps its own, persisted separately, so switching tools restores the size the
// child last used for that tool.
export const strokeState = $state({
  penSize: readStrokeLevel(STORAGE_KEYS.strokeWidthSize, DEFAULT_SIZE),
  eraserSize: readStrokeLevel(STORAGE_KEYS.eraserWidthSize, DEFAULT_SIZE),
});

// Re-read the persisted pen/eraser levels into the live store after the durable
// storage layer recovers values evicted by the native WebView (see storage.ts).
export function reloadStrokeWidth() {
  strokeState.penSize = readStrokeLevel(STORAGE_KEYS.strokeWidthSize, strokeState.penSize);
  strokeState.eraserSize = readStrokeLevel(STORAGE_KEYS.eraserWidthSize, strokeState.eraserSize);
}

onDurableRestore(reloadStrokeWidth);

// The level for the tool that's currently active. Reads toolState so it stays
// reactive inside $derived, $effect, and template expressions.
export function activeStrokeSize(): StrokeSize {
  return toolState.brush === 'eraser' ? strokeState.eraserSize : strokeState.penSize;
}

// Set the level for the active tool, persisting only that tool's value.
export function setStrokeSize(size: StrokeSize) {
  if (!STROKE_SIZES.includes(size)) return;
  if (toolState.brush === 'eraser') {
    strokeState.eraserSize = size;
    writeInt(STORAGE_KEYS.eraserWidthSize, size);
  } else {
    strokeState.penSize = size;
    writeInt(STORAGE_KEYS.strokeWidthSize, size);
  }
}

export function getStrokeWidthPx(size: StrokeSize): number {
  return SIZE_TO_PX[size];
}

export function getEraserWidthPx(size: StrokeSize): number {
  return getStrokeWidthPx(size) * ERASER_SIZE_MULTIPLIER;
}
