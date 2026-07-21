import { describe, it, expect, beforeEach } from 'vitest';
import {
  toolState,
  BRUSH_TYPES,
  isInkBrush,
  selectBrush,
  selectInkBrush,
  toggleEraser,
  resetToolAfterClear,
  reloadBrushType,
} from './tool.svelte';

const BRUSH_KEY = 'splotch-brush-type';

describe('tool state', () => {
  beforeEach(() => {
    localStorage.clear();
    selectBrush('pen');
    localStorage.clear();
  });

  it('presents the brushes in menu order', () => {
    expect(BRUSH_TYPES).toEqual(['pen', 'crayon', 'magic', 'eraser']);
  });

  it('selectBrush sets the single active brush', () => {
    for (const brush of BRUSH_TYPES) {
      selectBrush(brush);
      expect(toolState.brush).toBe(brush);
    }
  });

  it('persists pen, crayon, and magic selections', () => {
    selectBrush('crayon');
    expect(localStorage.getItem(BRUSH_KEY)).toBe('crayon');
    selectBrush('magic');
    expect(localStorage.getItem(BRUSH_KEY)).toBe('magic');
    selectBrush('pen');
    expect(localStorage.getItem(BRUSH_KEY)).toBe('pen');
  });

  it('never persists the eraser (a relaunch on a blank page must not restore it)', () => {
    selectBrush('crayon');
    selectBrush('eraser');
    expect(toolState.brush).toBe('eraser');
    expect(localStorage.getItem(BRUSH_KEY)).toBe('crayon');
  });

  it('toggleEraser flips between the ink brush and the eraser', () => {
    selectBrush('crayon');
    toggleEraser();
    expect(toolState.brush).toBe('eraser');
    toggleEraser();
    expect(toolState.brush).toBe('crayon');
  });

  it('toggleEraser from magic lands on the eraser, then leaves for the ink brush (never magic)', () => {
    selectBrush('pen');
    selectBrush('magic');
    toggleEraser();
    expect(toolState.brush).toBe('eraser');
    toggleEraser();
    expect(toolState.brush).toBe('pen');
  });

  it('selectInkBrush resumes the last color-laying brush from the eraser or magic', () => {
    selectBrush('crayon');
    selectBrush('eraser');
    selectInkBrush();
    expect(toolState.brush).toBe('crayon');

    selectBrush('magic');
    selectInkBrush();
    expect(toolState.brush).toBe('crayon');
  });

  it('resetToolAfterClear switches back to the ink brush when erasing', () => {
    selectBrush('crayon');
    selectBrush('eraser');
    resetToolAfterClear();
    expect(toolState.brush).toBe('crayon');
  });

  it('resetToolAfterClear keeps the magic brush selected', () => {
    selectBrush('magic');
    resetToolAfterClear();
    expect(toolState.brush).toBe('magic');
  });

  it('resetToolAfterClear leaves an active ink brush unchanged', () => {
    selectBrush('pen');
    resetToolAfterClear();
    expect(toolState.brush).toBe('pen');
  });

  it('isInkBrush is true only for pen and crayon', () => {
    expect(BRUSH_TYPES.filter(isInkBrush)).toEqual(['pen', 'crayon']);
  });
});

describe('reloadBrushType', () => {
  beforeEach(() => {
    localStorage.clear();
    selectBrush('pen');
    localStorage.clear();
  });

  it('re-reads the persisted brush into the live store (durable-recovery path)', () => {
    localStorage.setItem(BRUSH_KEY, 'crayon');
    reloadBrushType();
    expect(toolState.brush).toBe('crayon');
  });

  it('rejects garbage and a persisted eraser, keeping the current brush', () => {
    localStorage.setItem(BRUSH_KEY, 'sparkles');
    reloadBrushType();
    expect(toolState.brush).toBe('pen');

    localStorage.setItem(BRUSH_KEY, 'eraser');
    reloadBrushType();
    expect(toolState.brush).toBe('pen');
  });

  it('rebuilds the ink-brush memory from the recovered value', () => {
    localStorage.setItem(BRUSH_KEY, 'crayon');
    reloadBrushType();
    selectBrush('eraser');
    selectInkBrush();
    expect(toolState.brush).toBe('crayon');
  });
});
