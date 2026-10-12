// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDialProgress } from './dialProgress';

const ESTIMATE = 10000;
// Frames to pump the done-ramp before calling it stuck — well past the ~20 the ease needs.
const DONE_RAMP_FRAME_BUDGET = 200;

describe('createDialProgress', () => {
  it('advances progress monotonically while filling, before markDone', () => {
    const dial = createDialProgress(ESTIMATE);
    dial.start(0);

    let prev = -1;
    for (let t = 0; t < ESTIMATE; t += 500) {
      const { progress, waiting, revealed } = dial.tick(t);
      expect(progress).toBeGreaterThan(prev);
      expect(waiting).toBe(false);
      expect(revealed).toBe(false);
      prev = progress;
    }
  });

  it('flips waiting true once elapsed crosses the estimate, still unrevealed', () => {
    const dial = createDialProgress(ESTIMATE);
    dial.start(0);

    expect(dial.tick(ESTIMATE - 1).waiting).toBe(false);

    const over = dial.tick(ESTIMATE + 3000);
    expect(over.waiting).toBe(true);
    expect(over.revealed).toBe(false);
    // Overrun asymptotes toward 0.98 (0.92 + 0.06) but never reaches it.
    expect(over.progress).toBeGreaterThan(0.92);
    expect(over.progress).toBeLessThan(0.98);
  });

  it('ramps to 1 after markDone, revealing only on the frame it crosses 0.999', () => {
    const dial = createDialProgress(ESTIMATE);
    dial.start(0);
    dial.tick(5000); // seed some fill so the done-ramp starts mid-way
    dial.markDone();

    // The done-ramp ignores `now`; a fixed timestamp exercises the pure ease.
    const frames = [];
    while (frames.length < DONE_RAMP_FRAME_BUDGET && !frames.at(-1)?.revealed) {
      frames.push(dial.tick(5000));
    }

    expect(
      frames.at(-1)?.revealed,
      `the ramp never revealed within ${DONE_RAMP_FRAME_BUDGET} frames`
    ).toBe(true);
    expect(frames.at(-1)?.progress, 'the revealing frame is full').toBe(1);
    expect(frames.some((frame) => frame.waiting)).toBe(false);
    expect(frames.slice(0, -1).every((frame) => frame.progress < 1)).toBe(true);
    for (const [index, frame] of frames.entries()) {
      expect(frame.progress, `frame ${index} moved backwards`).toBeGreaterThanOrEqual(
        frames[index - 1]?.progress ?? -1
      );
    }
  });

  it('does not reveal on the first frames after markDone from zero fill', () => {
    const dial = createDialProgress(ESTIMATE);
    dial.start(0);
    dial.markDone();

    const first = dial.tick(0);
    expect(first.revealed).toBe(false);
    expect(first.progress).toBeCloseTo(0.16, 5); // 0 + (1 - 0) * 0.16
  });
});
