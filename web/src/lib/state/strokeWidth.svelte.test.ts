import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import {
  STROKE_SIZES,
  DEFAULT_SIZE,
  SIZE_ICON,
  MAGIC_SIZE_ICON,
  ERASER_SIZE_ICON,
  ERASER_SIZE_MULTIPLIER,
  createStrokeWidth,
  getStrokeWidthPx,
  getEraserWidthPx,
  type StrokeSize,
  type StrokeWidthState,
} from './strokeWidth.svelte';
import { createTool, type ToolState } from './tool.svelte';

let tool: ToolState;
let strokeWidth: StrokeWidthState;

beforeEach(() => {
  localStorage.clear();
  // A fresh tool and store read the cleared storage: pen held, both levels at the default.
  tool = createTool();
  strokeWidth = createStrokeWidth(tool);
});

// The icon names are spelled out as literals in both maps on purpose (see the
// comment there — icon-orphans.test.ts counts only quoted literals), so nothing
// but this asserts each level still points at its own icon. Without it, renaming
// a level or an SVG leaves the pairing silently crossed — or the two maps
// swapped, painting eraser holes for a pen — since every name still type-checks
// against the generated icon union.
describe('SIZE_ICON / MAGIC_SIZE_ICON / ERASER_SIZE_ICON', () => {
  it('names each stroke-preview icon after its size and tool', () => {
    for (const size of STROKE_SIZES) {
      expect(SIZE_ICON[size]).toBe(`size-brush-${size}`);
      expect(MAGIC_SIZE_ICON[size]).toBe(`size-magic-${size}`);
      expect(ERASER_SIZE_ICON[size]).toBe(`size-eraser-${size}`);
    }
  });
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
  it('starts both levels at the default', () => {
    expect(strokeWidth.penSize).toBe(DEFAULT_SIZE);
    expect(strokeWidth.eraserSize).toBe(DEFAULT_SIZE);
  });

  it('writes the pen level to the pen key when the pen is active', () => {
    tool.selectBrush('pen');
    strokeWidth.setStrokeSize(5);
    expect(strokeWidth.penSize).toBe(5);
    expect(strokeWidth.activeStrokeSize()).toBe(5);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('5');
    expect(localStorage.getItem(STORAGE_KEYS.eraserWidthSize)).toBeNull();
  });

  it('writes the eraser level to the eraser key when the eraser is active', () => {
    tool.selectBrush('eraser');
    strokeWidth.setStrokeSize(1);
    expect(strokeWidth.eraserSize).toBe(1);
    expect(strokeWidth.activeStrokeSize()).toBe(1);
    expect(localStorage.getItem(STORAGE_KEYS.eraserWidthSize)).toBe('1');
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBeNull();
  });

  it('keeps pen and eraser levels independent', () => {
    tool.selectBrush('pen');
    strokeWidth.setStrokeSize(2);
    tool.selectBrush('eraser');
    strokeWidth.setStrokeSize(5);

    expect(strokeWidth.penSize).toBe(2);
    expect(strokeWidth.eraserSize).toBe(5);

    // Switching tools surfaces that tool's own remembered level.
    expect(strokeWidth.activeStrokeSize()).toBe(5); // eraser active
    tool.selectBrush('pen');
    expect(strokeWidth.activeStrokeSize()).toBe(2); // pen active
  });

  it('ignores levels outside STROKE_SIZES and persists nothing', () => {
    tool.selectBrush('pen');
    strokeWidth.setStrokeSize(3);
    strokeWidth.setStrokeSize(7 as StrokeSize); // invalid
    strokeWidth.setStrokeSize(0 as StrokeSize); // invalid
    expect(strokeWidth.penSize).toBe(3);
    expect(localStorage.getItem(STORAGE_KEYS.strokeWidthSize)).toBe('3');
  });
});

describe('reloadStrokeWidth', () => {
  it('re-reads persisted levels into the live store (durable-recovery path)', () => {
    localStorage.setItem(STORAGE_KEYS.strokeWidthSize, '4');
    localStorage.setItem(STORAGE_KEYS.eraserWidthSize, '1');
    strokeWidth.reloadStrokeWidth();
    expect(strokeWidth.penSize).toBe(4);
    expect(strokeWidth.eraserSize).toBe(1);
  });

  it('rejects a persisted level not in STROKE_SIZES, keeping the current value', () => {
    strokeWidth.setStrokeSize(2);
    localStorage.setItem(STORAGE_KEYS.strokeWidthSize, '99'); // not an allowed level
    strokeWidth.reloadStrokeWidth();
    expect(strokeWidth.penSize).toBe(2);
  });
});
