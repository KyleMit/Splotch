import { describe, it, expect, beforeEach } from 'vitest';
import {
  toolState,
  selectPen,
  selectEraser,
  selectMagic,
  selectBrush,
  selectColorBrush,
  toggleEraser,
  toggleMagic,
  resetToolAfterClear,
} from './tool.svelte';

describe('tool state', () => {
  beforeEach(() => selectPen());

  it('selectEraser / selectPen set the active tool', () => {
    selectEraser();
    expect(toolState.eraser).toBe(true);
    selectPen();
    expect(toolState.eraser).toBe(false);
  });

  it('toggleEraser flips between pen and eraser', () => {
    expect(toolState.eraser).toBe(false);
    toggleEraser();
    expect(toolState.eraser).toBe(true);
    toggleEraser();
    expect(toolState.eraser).toBe(false);
  });

  it('selectEraser keeps the remembered brush; selecting a brush leaves the eraser', () => {
    selectBrush('crayon');
    selectEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.brush).toBe('crayon'); // remembered under the eraser

    selectMagic();
    expect(toolState.brush).toBe('magic');
    expect(toolState.eraser).toBe(false);

    selectEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.brush).toBe('magic');
  });

  it('selectBrush sets the active brush and leaves the eraser', () => {
    selectEraser();
    selectBrush('watercolor');
    expect(toolState.brush).toBe('watercolor');
    expect(toolState.eraser).toBe(false);
  });

  it('toggleMagic flips between pen and magic, and always leaves magic for the pen', () => {
    expect(toolState.brush).toBe('pen');
    toggleMagic();
    expect(toolState.brush).toBe('magic');
    toggleMagic();
    expect(toolState.brush).toBe('pen');
    expect(toolState.eraser).toBe(false);
  });

  it('toggleEraser from magic lands on the eraser (not back to magic)', () => {
    selectMagic();
    toggleEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.brush).toBe('magic'); // remembered, but the eraser is the live tool
  });

  it('selectPen resets to the pen and clears the eraser', () => {
    selectMagic();
    selectEraser();
    selectPen();
    expect(toolState.brush).toBe('pen');
    expect(toolState.eraser).toBe(false);
  });

  it('selectColorBrush keeps a color-using brush but leaves the magic brush for the pen', () => {
    selectBrush('crayon');
    selectColorBrush();
    expect(toolState.brush).toBe('crayon'); // texture kept with the new color
    expect(toolState.eraser).toBe(false);

    selectMagic();
    selectColorBrush();
    expect(toolState.brush).toBe('pen'); // magic ignores color → fall back to the pen
  });

  it('resetToolAfterClear switches off the eraser (falling back to the brush)', () => {
    selectBrush('watercolor');
    selectEraser();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.brush).toBe('watercolor');
  });

  it('resetToolAfterClear keeps the magic brush selected', () => {
    selectMagic();
    resetToolAfterClear();
    expect(toolState.brush).toBe('magic');
    expect(toolState.eraser).toBe(false);
  });

  it('resetToolAfterClear leaves the pen active unchanged', () => {
    selectPen();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.brush).toBe('pen');
  });
});
