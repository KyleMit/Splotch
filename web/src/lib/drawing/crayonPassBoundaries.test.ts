import { describe, expect, it } from 'vitest';

import {
  CRAYON_CHECKPOINT_OPS,
  createCrayonPassBoundaries,
  type CrayonPassCarrier,
} from './crayonPassBoundaries';
import type { StrokeOp } from './strokeOps';

function harness() {
  const rendered: StrokeOp[] = [];
  const recorded: StrokeOp[] = [];
  const passes = createCrayonPassBoundaries({
    renderOp: (op) => rendered.push(op),
    recordOp: (op) => recorded.push(op),
  });
  return { passes, rendered, recorded };
}

function carrier(overrides: Partial<CrayonPassCarrier> = {}): CrayonPassCarrier {
  return {
    x: 10,
    y: 20,
    lineWidth: 8,
    crayon: true,
    erase: false,
    seed: 0,
    passTracker: null,
    ...overrides,
  };
}

describe('crayon pass boundaries', () => {
  it('checkpoints once a pass has taken enough moves, not before', () => {
    const { passes, rendered } = harness();
    const ps = carrier();

    expect(passes.creditMoves(ps, CRAYON_CHECKPOINT_OPS - 1)).toBe(false);
    expect(rendered).toHaveLength(0);

    expect(passes.creditMoves(ps, 1)).toBe(true);
    expect(rendered).toEqual([{ kind: 'crayonFlush' }]);
  });

  it('counts moves rather than calls, so per-frame merging cannot stretch a pass', () => {
    const { passes, rendered } = harness();
    const ps = carrier();

    // One call carrying a whole frame's moves must checkpoint exactly as the
    // same number of single-move calls would (ADR-0085 trial 23).
    passes.creditMoves(ps, CRAYON_CHECKPOINT_OPS);

    expect(rendered).toHaveLength(1);
  });

  it('gives every new pass a fresh seed and a tracker anchored where it opened', () => {
    const { passes } = harness();
    const ps = carrier();
    const opened = passes.openStroke({ seeded: true, tracked: true, at: ps, lineWidth: 8 });
    Object.assign(ps, opened);

    passes.rollToNextPass(ps, { x: 99, y: 99 });

    // A seed bumped without its tracker replaced would keep the closed pass's
    // geometry and never split again.
    expect(ps.seed).not.toBe(opened.seed);
    expect(ps.passTracker).not.toBe(opened.passTracker);
    expect(ps.passTracker).not.toBeNull();
  });

  it('seeds an eraser or magic stroke without giving it a pass tracker', () => {
    const { passes } = harness();

    // The asymmetry is deliberate: every crayon-mode op carries a seed so a
    // replay reproduces its pattern phase, but a stroke that deposits no wax
    // has no pass to split.
    const opened = passes.openStroke({
      seeded: true,
      tracked: false,
      at: { x: 1, y: 2 },
      lineWidth: 8,
    });

    expect(opened.seed).toBeGreaterThan(0);
    expect(opened.passTracker).toBeNull();
  });

  it('flushes an open pass when a foreign op interleaves, and not otherwise', () => {
    const { passes, rendered } = harness();
    const ps = carrier();
    passes.creditMoves(ps, 1);

    // Still crayon: nothing to close.
    passes.closeBeforeForeignOp(ps);
    expect(rendered).toHaveLength(0);

    // Brush switched mid-gesture with wax already down: close the pass so tile
    // compositing preserves the operation order.
    passes.closeBeforeForeignOp(carrier({ crayon: false }));
    expect(rendered).toEqual([{ kind: 'crayonFlush' }]);
  });

  it('does not flush a foreign op when no wax has landed', () => {
    const { passes, rendered } = harness();

    passes.closeBeforeForeignOp(carrier({ crayon: false }));

    expect(rendered).toHaveLength(0);
  });

  it('records each flush for history as well as rendering it', () => {
    const { passes, rendered, recorded } = harness();

    passes.recordFlush();

    // A flush that renders but is not retained replays differently from the
    // live pixels.
    expect(rendered).toEqual([{ kind: 'crayonFlush' }]);
    expect(recorded).toEqual([{ kind: 'crayonFlush' }]);
  });

  it('gives each instance its own counter, so one drawing cannot seed another', () => {
    const first = harness().passes.openStroke({
      seeded: true,
      tracked: false,
      at: { x: 0, y: 0 },
      lineWidth: 8,
    });
    const second = harness().passes.openStroke({
      seeded: true,
      tracked: false,
      at: { x: 0, y: 0 },
      lineWidth: 8,
    });

    expect(second.seed).toBe(first.seed);
  });
});
