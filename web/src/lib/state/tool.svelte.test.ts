import { describe, it, expect, beforeEach } from 'vitest';
import {
  toolState,
  selectPen,
  selectEraser,
  selectMagic,
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

  it('eraser and magic are mutually exclusive', () => {
    selectEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.magic).toBe(false);

    selectMagic();
    expect(toolState.magic).toBe(true);
    expect(toolState.eraser).toBe(false);

    selectEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.magic).toBe(false);
  });

  it('toggleMagic flips between pen and magic, and always leaves magic for the pen', () => {
    expect(toolState.magic).toBe(false);
    toggleMagic();
    expect(toolState.magic).toBe(true);
    toggleMagic();
    expect(toolState.magic).toBe(false);
    expect(toolState.eraser).toBe(false);
  });

  it('toggleEraser from magic lands on the eraser (not back to magic)', () => {
    selectMagic();
    toggleEraser();
    expect(toolState.eraser).toBe(true);
    expect(toolState.magic).toBe(false);
  });

  it('selectPen clears both modifiers', () => {
    selectMagic();
    selectPen();
    expect(toolState.magic).toBe(false);
    expect(toolState.eraser).toBe(false);
  });

  it('resetToolAfterClear switches back to the pen when erasing', () => {
    selectEraser();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.magic).toBe(false);
  });

  it('resetToolAfterClear switches back to the pen when using the magic brush', () => {
    selectMagic();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.magic).toBe(false);
  });

  it('resetToolAfterClear leaves the pen active unchanged', () => {
    selectPen();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.magic).toBe(false);
  });
});
