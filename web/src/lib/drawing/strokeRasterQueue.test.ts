import { beforeEach, describe, expect, it, vi } from 'vitest';

// PERF_MARKS is a compile-time literal that is false in a normal build, so the
// marking behaviour is only observable with it forced on.
vi.mock('./perf', () => ({ PERF_MARKS: true }));

const { createStrokeRasterQueue } = await import('./strokeRasterQueue');

type TestPointer = {
  pendingRaster: { points: { x: number; y: number }[]; at: number }[];
  crayon: boolean;
  erase: boolean;
  x: number;
  y: number;
  lastTime: number;
};

const pointer = (overrides: Partial<TestPointer> = {}): TestPointer => ({
  pendingRaster: [],
  crayon: false,
  erase: false,
  x: 0,
  y: 0,
  lastTime: 0,
  ...overrides,
});

function harness(pointers: Map<number, TestPointer>) {
  const stroked: { points: { x: number; y: number }[]; moveCount: number }[] = [];
  const queue = createStrokeRasterQueue<TestPointer>({
    activePointers: pointers,
    paperMinEdge: () => 1000,
    pointerWasResumed: () => false,
    restartStrokeIfResumed: () => {},
    strokeSpeed: () => 0,
    strokeSegments: (_ps, points, moveCount) => stroked.push({ points, moveCount }),
    onFlushed: () => {},
  });
  return { queue, stroked };
}

describe('createStrokeRasterQueue', () => {
  let measures: string[];

  beforeEach(() => {
    measures = [];
    vi.stubGlobal('performance', {
      mark: () => {},
      measure: (name: string) => measures.push(name),
      now: () => 0,
    });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('measures the raster a pointer-up flushes, not just the frame-scheduled one', () => {
    // The lift path is synchronous: stopDrawing and releaseAllPointers call
    // flushAll rather than waiting for a frame. Measured on a physical iPad, 37
    // of 40 strokes had no engine.draw between their last move and the lift,
    // because only the rAF path was wrapped.
    const ps = pointer({ pendingRaster: [{ points: [{ x: 1, y: 1 }], at: 10 }] });
    const { queue, stroked } = harness(new Map([[1, ps]]));

    queue.flushAll();

    expect(stroked).toHaveLength(1);
    expect(measures).toEqual(['engine.draw']);
  });

  it('does not emit an empty measure when there is nothing queued', () => {
    const { queue, stroked } = harness(new Map([[1, pointer()]]));

    queue.flushAll();

    expect(stroked).toHaveLength(0);
    expect(measures).toEqual([]);
  });

  it('drains every active pointer under one measure', () => {
    const pointers = new Map([
      [1, pointer({ pendingRaster: [{ points: [{ x: 1, y: 1 }], at: 10 }] })],
      [2, pointer({ pendingRaster: [{ points: [{ x: 2, y: 2 }], at: 11 }] })],
    ]);
    const { queue, stroked } = harness(pointers);

    queue.flushAll();

    expect(stroked).toHaveLength(2);
    expect(measures).toEqual(['engine.draw']);
  });

  it('keeps crayon at one op per pointermove while merging every other brush', () => {
    const batches = [
      { points: [{ x: 1, y: 1 }], at: 10 },
      { points: [{ x: 2, y: 2 }], at: 20 },
    ];
    const merged = harness(new Map([[1, pointer({ pendingRaster: [...batches] })]]));
    merged.queue.flushAll();

    expect(merged.stroked).toHaveLength(1);
    expect(merged.stroked[0].moveCount).toBe(2);

    const crayon = harness(new Map([[1, pointer({ crayon: true, pendingRaster: [...batches] })]]));
    crayon.queue.flushAll();

    expect(crayon.stroked).toHaveLength(2);
    expect(crayon.stroked.every((op) => op.moveCount === 1)).toBe(true);
  });
});
