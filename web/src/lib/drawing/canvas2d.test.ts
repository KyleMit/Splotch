import { describe, expect, it } from 'vitest';
import { require2dContext } from './canvas2d';

function canvasReturning(context: CanvasRenderingContext2D | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => context) as HTMLCanvasElement['getContext'];
  return canvas;
}

describe('require2dContext', () => {
  it('returns the canvas 2D context', () => {
    const context = { lineCap: 'butt' } as CanvasRenderingContext2D;
    expect(require2dContext(canvasReturning(context))).toBe(context);
  });

  it('throws a named error when the browser refuses a context', () => {
    expect(() => require2dContext(canvasReturning(null))).toThrow('2D canvas context unavailable');
  });
});
