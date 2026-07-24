// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDialProgress } from './aiDialProgress';

const ESTIMATE = 10000;

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

    let prev = -1;
    let revealedFrame = -1;
    // The done-ramp ignores `now`; a fixed timestamp exercises the pure ease.
    for (let i = 0; i < 200; i++) {
      const { progress, waiting, revealed } = dial.tick(5000);
      expect(waiting).toBe(false);
      expect(progress).toBeGreaterThanOrEqual(prev);
      if (revealed) {
        expect(progress).toBe(1);
        revealedFrame = i;
        break;
      }
      expect(progress).toBeLessThan(1);
      prev = progress;
    }
    expect(revealedFrame).toBeGreaterThanOrEqual(0);
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
