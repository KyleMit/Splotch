import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import {
  toolState,
  BRUSH_OPTIONS,
  BRUSH_TYPES,
  isInkBrush,
  selectBrush,
  selectInkBrush,
  fallBackFromBrush,
  toggleEraser,
  resetToolAfterClear,
  reloadBrushType,
} from './tool.svelte';

beforeEach(() => {
  localStorage.clear();
  selectBrush('pen');
  // selectBrush persists the brush; tests expect to start with empty storage.
  localStorage.clear();
});

describe('tool state', () => {
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
    expect(localStorage.getItem(STORAGE_KEYS.brushType)).toBe('crayon');
    selectBrush('magic');
    expect(localStorage.getItem(STORAGE_KEYS.brushType)).toBe('magic');
    selectBrush('pen');
    expect(localStorage.getItem(STORAGE_KEYS.brushType)).toBe('pen');
  });

  it('never persists the eraser (a relaunch on a blank page must not restore it)', () => {
    selectBrush('crayon');
    selectBrush('eraser');
    expect(toolState.brush).toBe('eraser');
    expect(localStorage.getItem(STORAGE_KEYS.brushType)).toBe('crayon');
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

  it('forgetting Crayon also removes it as the remembered ink brush', () => {
    selectBrush('crayon');
    selectBrush('magic');

    fallBackFromBrush('crayon');
    selectInkBrush();

    expect(toolState.brush).toBe('pen');
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

  // The icon names are spelled out as literals in BRUSH_OPTIONS on purpose (see
  // the comment there — icon-orphans.test.ts counts only quoted literals), so
  // nothing but this asserts that each entry still points at its own icon.
  // Without it, renaming a BrushType or an SVG leaves the pairing silently
  // crossed: every name still type-checks against the generated icon union.
  it('names each brush icon after its BrushType', () => {
    for (const option of BRUSH_OPTIONS) {
      expect(option.icon).toBe(`brush-${option.brush}`);
    }
  });
});

describe('reloadBrushType', () => {
  it('re-reads the persisted brush into the live store (durable-recovery path)', () => {
    localStorage.setItem(STORAGE_KEYS.brushType, 'crayon');
    reloadBrushType();
    expect(toolState.brush).toBe('crayon');
  });

  it('rejects garbage and a persisted eraser, keeping the current brush', () => {
    localStorage.setItem(STORAGE_KEYS.brushType, 'sparkles');
    reloadBrushType();
    expect(toolState.brush).toBe('pen');

    localStorage.setItem(STORAGE_KEYS.brushType, 'eraser');
    reloadBrushType();
    expect(toolState.brush).toBe('pen');
  });

  it('rebuilds the ink-brush memory from the recovered value', () => {
    localStorage.setItem(STORAGE_KEYS.brushType, 'crayon');
    reloadBrushType();
    selectBrush('eraser');
    selectInkBrush();
    expect(toolState.brush).toBe('crayon');
  });
});
