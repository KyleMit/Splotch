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

function harness(
  pointers: Map<number, TestPointer>,
  crayonOpGranularity: 'per-move' | 'per-frame' = 'per-move',
  pointerWasResumed: (elapsed: number, jump: number, edge: number) => boolean = () => false
) {
  const stroked: { points: { x: number; y: number }[]; moveCount: number }[] = [];
  const restarted: { x: number; y: number }[] = [];
  const queue = createStrokeRasterQueue<TestPointer>({
    activePointers: pointers,
    crayonOpGranularity,
    paperMinEdge: () => 1000,
    pointerWasResumed,
    restartStrokeIfResumed: (_ps, point) => restarted.push(point),
    strokeSpeed: () => 0,
    strokeSegments: (_ps, points, moveCount) => stroked.push({ points, moveCount }),
    onFlushed: () => {},
  });
  return { queue, stroked, restarted };
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

  // The native build flips crayon to per-frame merging: the WKWebView pays
  // more per op than per path-length, measured 1.74% -> 1.46% lost frame time
  // on the physical iPad (issue 1236) where Safari measures the same merge as
  // a regression. The engine picks the granularity from __IS_CAPACITOR__.
  it('merges crayon per frame when the granularity says so', () => {
    const batches = [
      { points: [{ x: 1, y: 1 }], at: 10 },
      { points: [{ x: 2, y: 2 }], at: 20 },
    ];
    const crayon = harness(
      new Map([[1, pointer({ crayon: true, pendingRaster: [...batches] })]]),
      'per-frame'
    );
    crayon.queue.flushAll();

    expect(crayon.stroked).toHaveLength(1);
    expect(crayon.stroked[0].points).toHaveLength(2);
    expect(crayon.stroked[0].moveCount).toBe(2);
  });

  // The crayon eraser merges under BOTH granularities — the per-move carve-out
  // is for wax deposition only, and deleting the !erase guard fails this.
  it('merges a crayon-eraser pointer under per-move granularity', () => {
    const batches = [
      { points: [{ x: 1, y: 1 }], at: 10 },
      { points: [{ x: 2, y: 2 }], at: 20 },
    ];
    const erasing = harness(
      new Map([[1, pointer({ crayon: true, erase: true, pendingRaster: [...batches] })]]),
      'per-move'
    );
    erasing.queue.flushAll();

    expect(erasing.stroked).toHaveLength(1);
    expect(erasing.stroked[0].moveCount).toBe(2);
  });

  // A stall accumulates unbounded moves; a single merged crayon op's bounding
  // box spans tiles the ink never enters, each paying two pattern passes. The
  // cap bounds one op's merge; within-pass parity makes the boundary invisible.
  it('caps how many moves one per-frame crayon op merges', () => {
    const batches = Array.from({ length: 20 }, (_, i) => ({
      points: [{ x: i, y: i }],
      at: 10 + i,
    }));
    const crayon = harness(
      new Map([[1, pointer({ crayon: true, pendingRaster: batches })]]),
      'per-frame'
    );
    crayon.queue.flushAll();

    expect(crayon.stroked.length).toBeGreaterThan(1);
    expect(Math.max(...crayon.stroked.map((op) => op.moveCount))).toBeLessThanOrEqual(8);
    expect(crayon.stroked.reduce((sum, op) => sum + op.moveCount, 0)).toBe(20);
    expect(crayon.stroked.flatMap((op) => op.points)).toHaveLength(20);
  });

  // The resume branch flushes the merged buffer BEFORE the restart decision so
  // ps position is fresh when restartStrokeIfResumed judges the gap — the
  // ordering per-frame crayon is the first configuration to reach with a
  // crayon pass open.
  it('flushes merged crayon before handling a resumed pointer, in both modes', () => {
    const resumedAt = (elapsed: number) => elapsed >= 800;
    for (const granularity of ['per-move', 'per-frame'] as const) {
      const batches = [
        { points: [{ x: 1, y: 1 }], at: 10 },
        { points: [{ x: 2, y: 2 }], at: 20 },
        { points: [{ x: 900, y: 900 }], at: 900 },
      ];
      const { queue, stroked } = harness(
        new Map([[1, pointer({ crayon: true, pendingRaster: [...batches] })]]),
        granularity,
        resumedAt
      );
      queue.flushAll();

      const flat = stroked.flatMap((op) => op.points.map((p) => p.x));
      expect(flat).toEqual([1, 2, 900]);
      const resumedOp = stroked[stroked.length - 1];
      expect(resumedOp.points).toEqual([{ x: 900, y: 900 }]);
    }
  });
});
