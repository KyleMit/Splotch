import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StrokeGroupCommand } from './strokeOps';
import { createTiledUndoPatches } from './tiledUndoPatches';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  }));
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe('tiled undo patches', () => {
  it('crops a command snapshot at most once', () => {
    const patches = createTiledUndoPatches();
    const command: StrokeGroupCommand = { ops: [], wasEmpty: false };
    const source = document.createElement('canvas');
    source.width = 100;
    source.height = 100;

    patches.capture(command, { canvas: source, width: 100, height: 100 }, 0, {
      x0: 10,
      y0: 20,
      x1: 30,
      y1: 50,
    });
    patches.crop(command);
    const cropped = patches.get(command)?.get(0)?.canvas;

    patches.crop(command);

    expect(patches.get(command)?.get(0)?.canvas).toBe(cropped);
  });
});
