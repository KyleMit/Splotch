import { describe, it, expect } from 'vitest';
import {
  rdpKeepIndices,
  rdpSimplify,
  isCornerAt,
  liveVertexAt,
  distToQuad,
  midpointToSegs,
  rawSamplesOf,
  rawPointsOf,
  sampleReducedSpans,
  splineReducedSpans,
  type Pt,
  type PathRunGeom,
} from './strokeSimplify';

const COS40 = Math.cos((40 * Math.PI) / 180);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Build a run of path ops exactly as the live draw records it
// (strokeSmoothSegments): pointerdown at samples[0], then one quadratic per
// sample — control = previous sample, endpoint = midpoint to the new sample.
// segsPerOp splits the run across op boundaries the way per-frame recording
// does (each op starting at the previous op's end anchor).
function liveRun(samples: Pt[], segsPerOp = Infinity): PathRunGeom[] {
  const run: PathRunGeom[] = [];
  let op: PathRunGeom = { startX: samples[0].x, startY: samples[0].y, segs: [] };
  for (let i = 1; i < samples.length; i++) {
    const end = mid(samples[i - 1], samples[i]);
    op.segs.push({ cx: samples[i - 1].x, cy: samples[i - 1].y, x: end.x, y: end.y });
    if (op.segs.length >= segsPerOp && i < samples.length - 1) {
      run.push(op);
      op = { startX: end.x, startY: end.y, segs: [] };
    }
  }
  run.push(op);
  return run;
}

const line = (n: number, step = 4): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));

const OPTS = { epsilon: 2, cornerCos: COS40, reduce: true };

describe('rdpKeepIndices', () => {
  it('collapses a straight line to its endpoints', () => {
    expect(rdpKeepIndices(line(50), 1)).toEqual([0, 49]);
  });

  it('keeps a point that deviates beyond epsilon', () => {
    const pts = line(21);
    pts[10] = { x: 40, y: 5 };
    const kept = rdpKeepIndices(pts, 2);
    expect(kept).toContain(10);
  });

  it('drops a point that deviates less than epsilon', () => {
    const pts = line(21);
    pts[10] = { x: 40, y: 1 };
    expect(rdpKeepIndices(pts, 2)).toEqual([0, 20]);
  });

  it('pins forced indices and still simplifies the spans between them', () => {
    const kept = rdpKeepIndices(line(50), 1, [20]);
    expect(kept).toEqual([0, 20, 49]);
  });

  it('returns everything for two or fewer points', () => {
    expect(rdpKeepIndices(line(2), 1)).toEqual([0, 1]);
  });

  it('rdpSimplify maps kept indices back to points', () => {
    const pts = line(10);
    expect(rdpSimplify(pts, 1)).toEqual([pts[0], pts[9]]);
  });
});

describe('isCornerAt', () => {
  it('detects a right-angle turn', () => {
    expect(isCornerAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, COS40)).toBe(true);
  });

  it('ignores a gentle bend', () => {
    expect(isCornerAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 3 }, COS40)).toBe(false);
  });

  it('cannot see an angle hidden behind a zero-length chord', () => {
    // The duplicate-sample blind spot: the caller must collapse duplicates first.
    expect(isCornerAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, COS40)).toBe(false);
  });
});

describe('liveVertexAt', () => {
  it('sits an eighth of the neighbour offset inside the sample', () => {
    // Symmetric reversal: neighbours coincide, so the live curve reaches only
    // 3/4 of the way to the apex sample... vertex = p + (prev + next - 2p)/8.
    const v = liveVertexAt({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 0 });
    expect(v).toEqual({ x: 6, y: 0 });
  });

  it('is the sample itself on a straight run', () => {
    const v = liveVertexAt({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 });
    expect(v).toEqual({ x: 4, y: 0 });
  });
});

describe('distToQuad', () => {
  it('reads ~0 for a point ON a long straight span far from the parameter midpoint', () => {
    // The regression that mattered: a coarse sampled-distance metric read this
    // as tens of px and made the bulge refinement keep every sample.
    const d = distToQuad({ x: 480, y: 0 }, { x: 0, y: 0 }, { x: 250, y: 0 }, { x: 500, y: 0 });
    expect(d).toBeLessThan(0.01);
  });

  it('measures perpendicular distance from a straight span', () => {
    const d = distToQuad({ x: 250, y: 7 }, { x: 0, y: 0 }, { x: 250, y: 0 }, { x: 500, y: 0 });
    expect(d).toBeCloseTo(7, 3);
  });

  it('reads ~0 at the bulge point of a curved quad', () => {
    const a1 = { x: 0, y: 0 };
    const c = { x: 50, y: 40 };
    const a2 = { x: 100, y: 0 };
    const vertex = { x: (a1.x + 2 * c.x + a2.x) / 4, y: (a1.y + 2 * c.y + a2.y) / 4 };
    expect(distToQuad(vertex, a1, c, a2)).toBeLessThan(0.01);
  });
});

describe('rawSamplesOf', () => {
  const samples: Pt[] = [
    { x: 0, y: 0 },
    { x: 4, y: 2 },
    { x: 9, y: 3 },
    { x: 15, y: 1 },
    { x: 22, y: 6 },
  ];

  it('round-trips the samples of a single-op run', () => {
    expect(rawSamplesOf(liveRun(samples))).toEqual(samples);
  });

  it('round-trips across per-frame op boundaries', () => {
    expect(rawSamplesOf(liveRun(samples, 1))).toEqual(samples);
  });
});

describe('sampleReducedSpans', () => {
  it('collapses a straight stroke to one short span with exact endpoints', () => {
    const samples = line(60);
    const { spans, rawCount, keptCount } = sampleReducedSpans(liveRun(samples), OPTS);
    expect(rawCount).toBe(60);
    expect(keptCount).toBeLessThan(8);
    expect(spans).toHaveLength(1);
    expect(spans[0].startX).toBe(samples[0].x);
    // The rebuilt stroke must end exactly on the live end anchor —
    // mid(s[n-2], s[n-1]) — not shrink toward the last kept point.
    const last = spans[0].segs[spans[0].segs.length - 1];
    const liveEnd = mid(samples[58], samples[59]);
    expect(last.x).toBeCloseTo(liveEnd.x, 9);
    expect(last.y).toBeCloseTo(liveEnd.y, 9);
  });

  it('reproduces the live segs verbatim with reduce=false', () => {
    const samples: Pt[] = Array.from({ length: 12 }, (_, i) => ({
      x: i * 6,
      y: Math.round(20 * Math.sin(i / 2)),
    }));
    const run = liveRun(samples, 3);
    const { spans } = sampleReducedSpans(run, { ...OPTS, reduce: false });
    expect(spans).toHaveLength(1);
    expect(spans[0].startX).toBe(run[0].startX);
    expect(spans[0].segs).toEqual(run.flatMap((op) => op.segs));
  });

  it('pins a sharp apex and its neighbours so the tip rebuilds exactly', () => {
    // Long approach, sharp reversal, long exit — RDP alone would keep the apex
    // but drop its neighbours, moving the rebuilt tip.
    const out = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 }));
    const apex = { x: 100, y: 4 };
    const back = Array.from({ length: 20 }, (_, i) => ({ x: 95 - i * 5, y: 8 }));
    const samples = [...out, apex, ...back];
    const { spans } = sampleReducedSpans(liveRun(samples), OPTS);
    const segs = spans.flatMap((s) => s.segs);
    // The apex and both immediate neighbours survive as verbatim controls, so
    // the two quadratics around the tip are numerically the live ones.
    expect(segs.some((s) => s.cx === apex.x && s.cy === apex.y)).toBe(true);
    expect(segs.some((s) => s.cx === out[19].x && s.cy === out[19].y)).toBe(true);
    expect(segs.some((s) => s.cx === back[0].x && s.cy === back[0].y)).toBe(true);
  });

  it('splits at a hold-still duplicate so both caps land exactly on the corner', () => {
    const arm1 = Array.from({ length: 15 }, (_, i) => ({ x: i * 6, y: 0 }));
    const corner = { x: 90, y: 0 };
    const arm2 = Array.from({ length: 15 }, (_, i) => ({ x: 90, y: (i + 1) * 6 }));
    // The finger pauses at the corner: the duplicate is where the live curve
    // passes THROUGH the point and breaks tangent continuity.
    const samples = [...arm1, corner, corner, ...arm2];
    const { spans } = sampleReducedSpans(liveRun(samples), OPTS);
    expect(spans).toHaveLength(2);
    const endOfFirst = spans[0].segs[spans[0].segs.length - 1];
    expect(endOfFirst.x).toBe(corner.x);
    expect(endOfFirst.y).toBe(corner.y);
    expect(spans[1].startX).toBe(corner.x);
    expect(spans[1].startY).toBe(corner.y);
  });

  it('re-inserts neighbours at a moderate turn the corner test misses (bulge refinement)', () => {
    // ~30° bend — below the 40° corner threshold — between two long straight
    // arms. RDP keeps only the bend sample; without refinement its rebuilt
    // bulge would flatten by ~an eighth of the kept-neighbour distance.
    const arm1 = Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: 0 }));
    const bend = { x: 150, y: 0 };
    const arm2 = Array.from({ length: 30 }, (_, i) => {
      const t = (i + 1) * 5;
      return { x: 150 + t * Math.cos(Math.PI / 6), y: t * Math.sin(Math.PI / 6) };
    });
    const samples = [...arm1, bend, ...arm2];
    const { spans } = sampleReducedSpans(liveRun(samples), OPTS);
    const segs = spans.flatMap((s) => s.segs);
    // The bend's original neighbours come back as verbatim controls, restoring
    // the exact local live geometry.
    expect(segs.some((s) => s.cx === arm1[29].x && s.cy === arm1[29].y)).toBe(true);
    expect(segs.some((s) => s.cx === bend.x && s.cy === bend.y)).toBe(true);
  });
});

describe('splineReducedSpans (retired comparison mode)', () => {
  const splineOpts = { ...OPTS, midpoint: false, split: 'corner' as const };

  it('reaches the true end of a two-point span instead of halving it', () => {
    const samples: Pt[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ];
    const { spans } = splineReducedSpans(liveRun(samples), splineOpts);
    const last = spans[0].segs[spans[0].segs.length - 1];
    const liveEnd = mid(samples[0], samples[1]);
    expect(last.x).toBeCloseTo(liveEnd.x, 9);
    expect(last.y).toBeCloseTo(liveEnd.y, 9);
  });

  it('splits a hook at its corner into spans that share the corner point', () => {
    const arm1 = Array.from({ length: 20 }, (_, i) => ({ x: i * 6, y: 0 }));
    const arm2 = Array.from({ length: 10 }, (_, i) => ({ x: 114 - i * 2, y: (i + 1) * 7 }));
    const { spans } = splineReducedSpans(liveRun([...arm1, ...arm2]), splineOpts);
    expect(spans.length).toBeGreaterThan(1);
    for (let i = 1; i < spans.length; i++) {
      const prevEnd = spans[i - 1].segs[spans[i - 1].segs.length - 1];
      expect(spans[i].startX).toBe(prevEnd.x);
      expect(spans[i].startY).toBe(prevEnd.y);
    }
  });

  it('rawPointsOf recovers on-curve anchors, not controls', () => {
    const samples = line(5);
    const pts = rawPointsOf(liveRun(samples), COS40);
    // Straight run: start + each segment anchor (midpoints), no apex splices.
    expect(pts[0]).toEqual(samples[0]);
    expect(pts[1]).toEqual(mid(samples[0], samples[1]));
    expect(pts).toHaveLength(5);
  });
});

describe('midpointToSegs', () => {
  it('matches the live per-frame construction', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 4 },
      { x: 18, y: 12 },
    ];
    expect(midpointToSegs(pts)).toEqual(liveRun(pts).flatMap((op) => op.segs));
  });
});
