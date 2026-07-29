import { describe, it, expect } from 'vitest';
import { alphaDataHasInk, EMPTY_SCAN_ALPHA_THRESHOLD } from './emptyScan';

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
