import { describe, it, expect, beforeEach } from 'vitest';
import { toolState, selectPen, selectEraser, toggleEraser } from './tool.svelte';

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
});
