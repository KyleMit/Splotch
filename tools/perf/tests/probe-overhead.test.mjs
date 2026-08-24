import { describe, expect, it } from 'vitest';
import {
  centreSwipe,
  isKeepAliveRace,
  percentile,
  shouldRetryForward,
  summarizeDeltas,
} from '../split-capture/measure-probe-overhead.mjs';

describe('summarizeDeltas', () => {
  // Frames per second is derived from the deltas rather than from the wall-clock
  // window, so a report that arrives late or a beacon that fires early cannot make
  // one arm look faster than the other.
  it('derives the rate from the intervals, not from elapsed time', () => {
    const summary = summarizeDeltas(Array.from({ length: 120 }, () => 8.333));

    expect(summary.frames).toBe(120);
    expect(summary.perSecond).toBeCloseTo(120, 1);
    expect(summary.p50).toBeCloseTo(8.333, 3);
  });

  it('reports the tail separately from the middle', () => {
    const summary = summarizeDeltas([...Array.from({ length: 99 }, () => 8), 33.4]);

    expect(summary.p50).toBe(8);
    expect(summary.max).toBe(33.4);
  });

  it('reports nothing rather than zero for an empty sample', () => {
    expect(summarizeDeltas([])).toMatchObject({ frames: 0, perSecond: null, max: null });
  });
});

describe('percentile', () => {
  it('reads from the sorted sample and clamps at the top', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.99)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('centreSwipe', () => {
  // Derived from the screen rather than from the canvas rect, because reading the
  // rect needs an instrument in the page and the control arm is defined by not
  // having one. Both arms must get identical device-space coordinates.
  it('is a function of the screen alone, so both arms get the same gesture', () => {
    const screen = { width: 1080, height: 2340 };

    expect(centreSwipe(screen)).toEqual({ x0: 270, y0: 1170, x1: 810, y1: 1287 });
    expect(centreSwipe(screen)).toEqual(centreSwipe(screen));
  });
});

describe('the forward retry', () => {
  // The race it exists for: the bootstrap polls its plan every 400 ms for the length
  // of a run, and Node's default 5 s keep-alive timeout closes an idle upstream
  // socket at the moment undici reuses it.
  it('retries a keep-alive socket failure on an idempotent request', () => {
    for (const error of [
      { code: 'UND_ERR_SOCKET' },
      { code: 'ECONNRESET' },
      { cause: { code: 'ECONNRESET' } },
      new Error('socket hang up'),
      Object.assign(new Error('fetch failed'), { cause: new Error('other side closed') }),
    ]) {
      expect(isKeepAliveRace(error)).toBe(true);
      expect(shouldRetryForward('GET', error)).toBe(true);
    }
  });

  // The narrower point, and the one a blanket catch got wrong: a GET that failed for
  // any other reason must surface. Retrying it papers over a real fault with a
  // second attempt that happens to succeed, records nothing, and the sample is
  // reported clean — the same silent recovery this tool exists to expose.
  it('does not retry a GET that failed for any other reason', () => {
    for (const error of [
      { code: 'ENOTFOUND' },
      { code: 'ECONNREFUSED' },
      { cause: { code: 'ECONNREFUSED' } },
      { code: 'ABORT_ERR' },
      new Error('certificate has expired'),
    ]) {
      expect(isKeepAliveRace(error)).toBe(false);
      expect(shouldRetryForward('GET', error)).toBe(false);
    }
  });

  // Replaying a POST duplicates a report or a plan write the upstream may already
  // have processed, whatever the failure was.
  it('never retries a non-idempotent method, even on the race', () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect(shouldRetryForward(method, { code: 'UND_ERR_SOCKET' })).toBe(false);
    }
  });
});
