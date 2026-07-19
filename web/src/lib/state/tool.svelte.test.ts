import { describe, it, expect, beforeEach } from 'vitest';
import {
  toolState,
  selectPen,
  selectEraser,
  selectMagic,
  toggleEraser,
  toggleMagic,
  toggleCrayon,
  crayonSelected,
  resetToolAfterClear,
} from './tool.svelte';

describe('tool state', () => {
  beforeEach(() => {
    selectPen();
    toolState.crayon = false;
  });

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

  it('resetToolAfterClear keeps the magic brush selected', () => {
    selectMagic();
    resetToolAfterClear();
    expect(toolState.magic).toBe(true);
    expect(toolState.eraser).toBe(false);
  });

  it('resetToolAfterClear leaves the pen active unchanged', () => {
    selectPen();
    resetToolAfterClear();
    expect(toolState.eraser).toBe(false);
    expect(toolState.magic).toBe(false);
  });

  it('toggleCrayon flips the crayon tip on and off', () => {
    toggleCrayon();
    expect(crayonSelected()).toBe(true);
    toggleCrayon();
    expect(crayonSelected()).toBe(false);
    expect(toolState.crayon).toBe(false);
  });

  it('selecting the crayon releases eraser/magic modifiers', () => {
    selectMagic();
    toggleCrayon();
    expect(crayonSelected()).toBe(true);
    expect(toolState.magic).toBe(false);
    expect(toolState.eraser).toBe(false);
  });

  it('the crayon latch survives color picks (selectPen) and modifier detours', () => {
    toggleCrayon();
    selectPen();
    expect(crayonSelected()).toBe(true);

    selectEraser();
    expect(crayonSelected()).toBe(false);
    expect(toolState.crayon).toBe(true);

    selectPen();
    expect(crayonSelected()).toBe(true);
  });

  it('tapping crayon while a modifier overrides it selects the crayon, not unlatch', () => {
    toggleCrayon();
    selectMagic();
    expect(crayonSelected()).toBe(false);

    toggleCrayon();
    expect(crayonSelected()).toBe(true);
    expect(toolState.magic).toBe(false);
  });

  it('resetToolAfterClear keeps the crayon tip', () => {
    toggleCrayon();
    selectEraser();
    resetToolAfterClear();
    expect(crayonSelected()).toBe(true);
  });
});
