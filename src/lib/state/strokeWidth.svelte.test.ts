import { describe, it, expect, beforeEach } from 'vitest';
import {
  STROKE_SIZES,
  DEFAULT_SIZE,
  ERASER_SIZE_MULTIPLIER,
  strokeState,
  setStrokeSize,
  activeStrokeSize,
  getStrokeWidthPx,
  getEraserWidthPx,
  reloadStrokeWidth
} from './strokeWidth.svelte';
import { selectPen, selectEraser, toolState } from './tool.svelte';

const PEN_KEY = 'splotch-stroke-width-size';
const ERASER_KEY = 'splotch-eraser-width-size';

beforeEach(() => {
  localStorage.clear();
  // Reset the live store + active tool to a known baseline for each test.
  strokeState.penSize = DEFAULT_SIZE;
  strokeState.eraserSize = DEFAULT_SIZE;
  selectPen();
});

describe('getStrokeWidthPx', () => {
  it('maps each stroke level to its pixel width', () => {
    expect(STROKE_SIZES.map((s) => getStrokeWidthPx(s))).toEqual([2, 4, 8, 14, 22]);
  });

  it('falls back to the default level for out-of-range or garbage input', () => {
    const defaultPx = getStrokeWidthPx(DEFAULT_SIZE);
    expect(getStrokeWidthPx(0)).toBe(defaultPx);
    expect(getStrokeWidthPx(99)).toBe(defaultPx);
    expect(getStrokeWidthPx(undefined)).toBe(defaultPx);
  });
});

describe('getEraserWidthPx', () => {
  it('is the pen pixel width scaled by the eraser multiplier', () => {
    for (const s of STROKE_SIZES) {
      expect(getEraserWidthPx(s)).toBeCloseTo(getStrokeWidthPx(s) * ERASER_SIZE_MULTIPLIER);
    }
  });
});

describe('setStrokeSize / activeStrokeSize', () => {
  it('writes the pen level to the pen key when the pen is active', () => {
    selectPen();
    setStrokeSize(5);
    expect(strokeState.penSize).toBe(5);
    expect(activeStrokeSize()).toBe(5);
    expect(localStorage.getItem(PEN_KEY)).toBe('5');
    expect(localStorage.getItem(ERASER_KEY)).toBeNull();
  });

  it('writes the eraser level to the eraser key when the eraser is active', () => {
    selectEraser();
    setStrokeSize(1);
    expect(strokeState.eraserSize).toBe(1);
    expect(activeStrokeSize()).toBe(1);
    expect(localStorage.getItem(ERASER_KEY)).toBe('1');
    expect(localStorage.getItem(PEN_KEY)).toBeNull();
  });

  it('keeps pen and eraser levels independent', () => {
    selectPen();
    setStrokeSize(2);
    selectEraser();
    setStrokeSize(5);

    expect(strokeState.penSize).toBe(2);
    expect(strokeState.eraserSize).toBe(5);

    // Switching tools surfaces that tool's own remembered level.
    expect(activeStrokeSize()).toBe(5); // eraser active
    selectPen();
    expect(activeStrokeSize()).toBe(2); // pen active
  });

  it('ignores levels outside STROKE_SIZES and persists nothing', () => {
    selectPen();
    setStrokeSize(3);
    setStrokeSize(7); // invalid
    setStrokeSize(0); // invalid
    expect(strokeState.penSize).toBe(3);
    expect(localStorage.getItem(PEN_KEY)).toBe('3');
  });
});

describe('reloadStrokeWidth', () => {
  it('re-reads persisted levels into the live store (durable-recovery path)', () => {
    localStorage.setItem(PEN_KEY, '4');
    localStorage.setItem(ERASER_KEY, '1');
    reloadStrokeWidth();
    expect(strokeState.penSize).toBe(4);
    expect(strokeState.eraserSize).toBe(1);
  });

  it('rejects a persisted level not in STROKE_SIZES, keeping the current value', () => {
    strokeState.penSize = 2;
    localStorage.setItem(PEN_KEY, '99'); // not an allowed level
    reloadStrokeWidth();
    expect(strokeState.penSize).toBe(2);
  });
});
