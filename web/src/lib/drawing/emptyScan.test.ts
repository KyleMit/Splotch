import { describe, it, expect, afterEach } from 'vitest';
import { alphaDataHasInk, EMPTY_SCAN_ALPHA_THRESHOLD, scanCanvasIsEmpty } from './emptyScan';

describe('alphaDataHasInk', () => {
  const rgba = (pixels: number): Uint8ClampedArray => new Uint8ClampedArray(pixels * 4);

  it('reports no ink for an all-zero buffer', () => {
    expect(alphaDataHasInk(rgba(16))).toBe(false);
  });

  it('reports ink at exactly the threshold', () => {
    const data = rgba(16);
    data[3] = EMPTY_SCAN_ALPHA_THRESHOLD;
    expect(alphaDataHasInk(data)).toBe(true);
  });

  it('reports no ink one below the threshold', () => {
    const data = rgba(16);
    for (let i = 3; i < data.length; i += 4) data[i] = EMPTY_SCAN_ALPHA_THRESHOLD - 1;
    expect(alphaDataHasInk(data)).toBe(false);
  });

  it('reports ink in the final pixel', () => {
    const data = rgba(16);
    data[data.length - 1] = 255;
    expect(alphaDataHasInk(data)).toBe(true);
  });

  it('ignores opaque RGB bytes when every alpha byte is zero', () => {
    const data = rgba(16);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    expect(alphaDataHasInk(data)).toBe(false);
  });
});

describe('scanCanvasIsEmpty', () => {
  // happy-dom's <canvas> has no real 2D context; these cases stub
  // HTMLCanvasElement.getContext to simulate context-limit exhaustion, then
  // restore it so the file's other tests (and later cases in this file) don't
  // inherit the stub or a wedged module-scope scratch canvas.
  let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext;
  });

  function stubGetContext(returnValue: unknown): void {
    origGetContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      returnValue;
  }

  function stubWorkingContext(alpha: number): void {
    stubGetContext({
      clearRect() {},
      drawImage() {},
      getImageData(_x: number, _y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        data[3] = alpha;
        return { data } as ImageData;
      },
    } as unknown as CanvasRenderingContext2D);
  }

  function sourceCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    return canvas;
  }

  it('treats an unrecoverable getContext failure as non-empty, then retries on the next call', () => {
    stubGetContext(null);
    expect(scanCanvasIsEmpty(sourceCanvas(), 1)).toBe(false);

    stubWorkingContext(0);
    expect(scanCanvasIsEmpty(sourceCanvas(), 1)).toBe(true);
  });
});
