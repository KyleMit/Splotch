import { describe, expect, it } from 'vitest';
import { countOpaquePixels, countStrokeRedPixels, opaqueBounds } from './pixelReadback.ts';

function image(width: number, height: number, pixels: [number, number, number[]][] = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, rgba] of pixels) data.set(rgba, (y * width + x) * 4);
  return { data, width, height };
}

const RED = [255, 0, 0, 255];
const PAPER = [250, 245, 235, 255];

describe('countStrokeRedPixels', () => {
  it('counts pure red and ignores paper and transparent pixels', () => {
    const img = image(3, 1, [
      [0, 0, RED],
      [1, 0, PAPER],
    ]);
    expect(countStrokeRedPixels(img)).toBe(1);
  });

  it('rejects reds whose other channels reach the threshold', () => {
    expect(countStrokeRedPixels(image(1, 1, [[0, 0, [255, 100, 0, 255]]]))).toBe(0);
    expect(countStrokeRedPixels(image(1, 1, [[0, 0, [200, 0, 0, 255]]]))).toBe(0);
  });
});

describe('countOpaquePixels', () => {
  it('counts every pixel with nonzero alpha', () => {
    const img = image(2, 2, [
      [0, 0, [0, 0, 0, 1]],
      [1, 1, PAPER],
      [1, 0, [255, 255, 255, 0]],
    ]);
    expect(countOpaquePixels(img)).toBe(2);
  });
});

describe('opaqueBounds', () => {
  it('is null for a fully transparent image', () => {
    expect(opaqueBounds(image(4, 3))).toBeNull();
  });

  it('collapses to the single opaque pixel', () => {
    expect(opaqueBounds(image(4, 3, [[2, 1, RED]]))).toEqual({
      minX: 2,
      minY: 1,
      maxX: 2,
      maxY: 1,
    });
  });

  it('reaches the far edges', () => {
    const img = image(4, 3, [
      [0, 2, RED],
      [3, 0, RED],
    ]);
    expect(opaqueBounds(img)).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 2 });
  });
});
