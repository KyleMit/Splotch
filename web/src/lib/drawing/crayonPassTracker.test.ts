import { describe, it, expect } from 'vitest';
import { CrayonPassTracker, type CrayonPoint } from './crayonPassTracker';

// The mid-stroke pass splitter (ported from the swept-passes experiment): a
// continuous gesture re-covering its own paper must start a new pass — a fresh
// seed phase in this design — while straight lines, gentle curves, ordinary
// corners, and hand jitter never split. Mirrors how the engine drives it: one
// tracker per pass, re-seeded at the previous point on each split.

const WIDTH = 16;

function runTracker(points: CrayonPoint[]): number[] {
  const splits: number[] = [];
  let tracker = new CrayonPassTracker(points[0].x, points[0].y, WIDTH);
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (tracker.advance(p) === 'split') {
      splits.push(i);
      tracker = new CrayonPassTracker(last.x, last.y, WIDTH);
      tracker.advance(p);
    }
    last = p;
  }
  return splits;
}

function trackLine(x0: number, y0: number, x1: number, y1: number, step = 4): CrayonPoint[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / step));
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    y: y0 + ((y1 - y0) * i) / n,
  }));
}

describe('CrayonPassTracker', () => {
  it('never splits a straight line', () => {
    expect(runTracker(trackLine(0, 0, 400, 0))).toEqual([]);
  });

  it('never splits a gentle curve', () => {
    const arc: CrayonPoint[] = [];
    for (let a = 0; a <= Math.PI / 2; a += 0.02) {
      arc.push({ x: 150 * Math.cos(a), y: 150 * Math.sin(a) });
    }
    expect(runTracker(arc)).toEqual([]);
  });

  it('tolerates jitter while the finger holds roughly still', () => {
    // Deterministic sub-pixel wobble, short enough that its accumulated arc
    // stays under the re-entry exclusion window. (A long dwell WILL slowly
    // re-deposit under the tip — a wiggling crayon held in place darkens its
    // dot, which is the physical behavior.)
    const jitter: CrayonPoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: 100 + Math.sin(i * 2.399) * 0.7,
      y: 100 + Math.cos(i * 1.731) * 0.7,
    }));
    expect(runTracker(jitter)).toEqual([]);
  });

  it('splits promptly on a sharp reversal', () => {
    const out = trackLine(0, 0, 60, 0);
    const back = trackLine(60, 0, 0, 0).slice(1);
    const splits = runTracker([...out, ...back]);
    expect(splits.length).toBe(1);
    // The split lands within a few samples of the turn, so nearly the whole
    // return leg deposits as a second pass.
    expect(splits[0]).toBeGreaterThanOrEqual(out.length);
    expect(splits[0]).toBeLessThanOrEqual(out.length + 3);
  });

  it('does not split at an ordinary 90° corner', () => {
    expect(runTracker([...trackLine(0, 0, 80, 0), ...trackLine(80, 0, 80, 80).slice(1)])).toEqual(
      []
    );
  });

  it('splits when a loop closes back onto its own strip', () => {
    const loop = [
      ...trackLine(0, 0, 90, 0),
      ...trackLine(90, 0, 90, 90).slice(1),
      ...trackLine(90, 90, 0, 90).slice(1),
      ...trackLine(0, 90, 0, -20).slice(1),
    ];
    const splits = runTracker(loop);
    expect(splits.length).toBe(1);
    // The split fires as the tip re-enters near the starting strip, not
    // anywhere along the open legs.
    const at = loop[splits[0]];
    expect(Math.hypot(at.x - 0, at.y - 0)).toBeLessThan(WIDTH);
  });

  it('a triple back-and-forth yields a pass per sweep', () => {
    const zigzag = [
      ...trackLine(0, 0, 80, 0),
      ...trackLine(80, 0, 0, 0).slice(1),
      ...trackLine(0, 0, 80, 0).slice(1),
    ];
    expect(runTracker(zigzag).length).toBe(2);
  });
});
