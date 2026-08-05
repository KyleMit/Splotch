import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import {
  STROKE_SIZES,
  DEFAULT_SIZE,
  ERASER_SIZE_MULTIPLIER,
  strokeState,
  setStrokeSize,
  activeStrokeSize,
  getStrokeWidthPx,
  getEraserWidthPx,
  reloadStrokeWidth,
  type StrokeSize,
} from './strokeWidth.svelte';
import { selectBrush } from './tool.svelte';

beforeEach(() => {
  localStorage.clear();
  // Reset the live store + active tool to a known baseline for each test.
  strokeState.penSize = DEFAULT_SIZE;
  strokeState.eraserSize = DEFAULT_SIZE;
  selectBrush('pen');
});

describe('getStrokeWidthPx', () => {
  it('maps each stroke level to its pixel width', () => {
    expect(STROKE_SIZES.map((s) => getStrokeWidthPx(s))).toEqual([2, 4, 8, 14, 22]);
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
    selectBrush('pen');
    setStrokeSize(5);
    expect(strokeState.penSize).toBe(5);
    expect(activeStrokeSize()).toBe(5);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('5');
    expect(localStorage.getItem(STORAGE_KEYS.eraserWidthSize)).toBeNull();
  });

  it('writes the eraser level to the eraser key when the eraser is active', () => {
    selectBrush('eraser');
    setStrokeSize(1);
    expect(strokeState.eraserSize).toBe(1);
    expect(activeStrokeSize()).toBe(1);
    expect(localStorage.getItem(STORAGE_KEYS.eraserWidthSize)).toBe('1');
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBeNull();
  });

  it('keeps pen and eraser levels independent', () => {
    selectBrush('pen');
    setStrokeSize(2);
    selectBrush('eraser');
    setStrokeSize(5);

    expect(strokeState.penSize).toBe(2);
    expect(strokeState.eraserSize).toBe(5);

    // Switching tools surfaces that tool's own remembered level.
    expect(activeStrokeSize()).toBe(5); // eraser active
    selectBrush('pen');
    expect(activeStrokeSize()).toBe(2); // pen active
  });

  it('ignores levels outside STROKE_SIZES and persists nothing', () => {
    selectBrush('pen');
    setStrokeSize(3);
    setStrokeSize(7 as StrokeSize); // invalid
    setStrokeSize(0 as StrokeSize); // invalid
    expect(strokeState.penSize).toBe(3);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('3');
  });
});

describe('reloadStrokeWidth', () => {
  it('re-reads persisted levels into the live store (durable-recovery path)', () => {
    localStorage.setItem(STORAGE_KEYS.strokeWidthSize, '4');
    localStorage.setItem(STORAGE_KEYS.eraserWidthSize, '1');
    reloadStrokeWidth();
    expect(strokeState.penSize).toBe(4);
    expect(strokeState.eraserSize).toBe(1);
  });

  it('rejects a persisted level not in STROKE_SIZES, keeping the current value', () => {
    strokeState.penSize = 2;
    localStorage.setItem(STORAGE_KEYS.strokeWidthSize, '99'); // not an allowed level
    reloadStrokeWidth();
    expect(strokeState.penSize).toBe(2);
  });
});
