import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scanCanvasIsEmpty, resetEmptyScanScratch } from './emptyScan';

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
