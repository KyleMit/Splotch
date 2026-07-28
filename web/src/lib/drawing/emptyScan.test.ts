import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scanCanvasIsEmpty,
  resetEmptyScanScratch,
  alphaDataHasInk,
  EMPTY_SCAN_ALPHA_THRESHOLD,
} from './emptyScan';

// The scratch canvas is allocated lazily on the first scan and then reused for
// the process lifetime (a deliberate perf cache). These cover the test-only
// reset seam: the module state is a singleton, so proving re-allocation is by
// counting how many <canvas> elements a scan creates. happy-dom's <canvas> has
// no 2D context, so scanCanvasIsEmpty short-circuits to `true` after allocating
// the scratch — which is all this seam needs to observe.

describe('emptyScan scratch reset seam', () => {
  beforeEach(() => resetEmptyScanScratch());
  afterEach(() => {
    resetEmptyScanScratch();
    vi.restoreAllMocks();
  });

  it('allocates the scratch once, reuses it, and re-allocates after a reset', () => {
    // Build the source BEFORE spying so it isn't counted as a scratch alloc.
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 32;

    const spy = vi.spyOn(document, 'createElement');
    const scratchAllocs = () => spy.mock.calls.filter((c) => c[0] === 'canvas').length;

    // First scan lazily allocates the scratch canvas.
    expect(typeof scanCanvasIsEmpty(source, 1)).toBe('boolean');
    expect(scratchAllocs()).toBe(1);

    // Second scan reuses it — no new canvas.
    scanCanvasIsEmpty(source, 1);
    expect(scratchAllocs()).toBe(1);

    // The reset seam drops the cached scratch...
    resetEmptyScanScratch();

    // ...so the next scan re-allocates cleanly and still works.
    expect(typeof scanCanvasIsEmpty(source, 1)).toBe('boolean');
    expect(scratchAllocs()).toBe(2);
  });
});

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
