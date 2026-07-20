import { describe, expect, it } from 'vitest';
import {
  CRAYON_TILE_CSS_PX,
  CRAYON_BANDS,
  CrayonPassTracker,
  crayonAlphaField,
  crayonBandDepositAlpha,
  crayonDepositAlpha,
  crayonToothHeight,
  parseCrayonColor,
  type CrayonPoint,
} from './crayonBrush';
import { commandSegmentCount, type CrayonOp, type StrokeOp } from './strokeOps';
import { simplifyCommandOps } from './commandSimplify';

describe('crayon tooth height field', () => {
  it('is deterministic — the same paper on every call', () => {
    for (const [u, v] of [
      [0, 0],
      [10.5, 200.25],
      [255.9, 3.1],
      [1000.4, -512.7],
    ]) {
      expect(crayonToothHeight(u, v)).toBe(crayonToothHeight(u, v));
    }
  });

  it('stays within [0, 1]', () => {
    for (let i = 0; i < 500; i++) {
      const h = crayonToothHeight(i * 3.7, i * 5.3);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it('tiles seamlessly at the repeat period', () => {
    for (const [u, v] of [
      [1.25, 7.5],
      [100.1, 33.3],
      [200.9, 250.2],
    ]) {
      expect(crayonToothHeight(u + CRAYON_TILE_CSS_PX, v)).toBeCloseTo(crayonToothHeight(u, v), 10);
      expect(crayonToothHeight(u, v + CRAYON_TILE_CSS_PX)).toBeCloseTo(crayonToothHeight(u, v), 10);
    }
  });

  it('actually varies — this is tooth, not a flat wash', () => {
    let min = 1;
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const h = crayonToothHeight(i * 1.7, i * 2.9);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(max - min).toBeGreaterThan(0.2);
  });
});

describe('crayon deposit transfer', () => {
  it('never deposits zero (no permanent white pits) and never fully saturates', () => {
    for (let h = 0; h <= 1.001; h += 0.01) {
      const a = crayonDepositAlpha(h);
      expect(a).toBeGreaterThan(0.02);
      expect(a).toBeLessThan(1);
    }
  });

  it('is continuous and monotonic in height', () => {
    let prev = crayonDepositAlpha(0);
    for (let h = 0.01; h <= 1.001; h += 0.01) {
      const a = crayonDepositAlpha(h);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a - prev).toBeLessThan(0.2);
      prev = a;
    }
  });

  it('leaves visible first-pass headroom for buildup', () => {
    // A second pass must be perceptibly denser: the mean extra deposit of
    // overdraw, mean(a)·(1−mean(a)), needs to be non-trivial across the field.
    const { alpha } = crayonAlphaField(1);
    let sum = 0;
    for (let i = 0; i < alpha.length; i++) sum += alpha[i];
    const mean = sum / alpha.length / 255;
    expect(mean * (1 - mean)).toBeGreaterThan(0.1);
    // And the field must not already be near-solid — the #417 failure mode.
    expect(mean).toBeLessThan(0.85);
  });

  it('keeps the current body deposit while thinning the outer edge', () => {
    expect(CRAYON_BANDS).toEqual([
      { band: 'edge', widthScale: 1 },
      { band: 'core', widthScale: 0.68 },
    ]);

    for (let height = 0; height <= 1.001; height += 0.01) {
      const deposit = crayonDepositAlpha(height);
      const edge = crayonBandDepositAlpha(height, 'edge');
      const core = crayonBandDepositAlpha(height, 'core');
      expect(edge).toBeGreaterThan(0);
      expect(edge).toBeLessThan(deposit);
      expect(edge + core * (1 - edge)).toBeCloseTo(deposit, 10);
    }

    expect(crayonBandDepositAlpha(1, 'edge')).toBeGreaterThan(
      crayonBandDepositAlpha(0, 'edge') * 50
    );
  });
});

describe('crayon alpha field', () => {
  it('is cached per render scale and byte-deterministic', () => {
    const a = crayonAlphaField(1);
    const b = crayonAlphaField(1);
    expect(b).toBe(a);
    expect(a.size).toBe(CRAYON_TILE_CSS_PX);
    expect(a.alpha.length).toBe(CRAYON_TILE_CSS_PX * CRAYON_TILE_CSS_PX);
  });

  it('holds every texel inside the transfer bounds', () => {
    const { alpha } = crayonAlphaField(1);
    let min = 255;
    let max = 0;
    for (let i = 0; i < alpha.length; i++) {
      min = Math.min(min, alpha[i]);
      max = Math.max(max, alpha[i]);
    }
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(255);
    expect(max - min).toBeGreaterThan(60);
  });
});

describe('parseCrayonColor', () => {
  it('parses 6- and 3-digit hex', () => {
    expect(parseCrayonColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCrayonColor('#AB71E1')).toEqual({ r: 171, g: 113, b: 225 });
    expect(parseCrayonColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('rejects non-hex colors (canvas fallback territory)', () => {
    expect(parseCrayonColor('red')).toBeNull();
    expect(parseCrayonColor('rgb(1,2,3)')).toBeNull();
  });
});

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

function line(x0: number, y0: number, x1: number, y1: number, step = 4): CrayonPoint[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / step));
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    y: y0 + ((y1 - y0) * i) / n,
  }));
}

describe('CrayonPassTracker', () => {
  it('never splits a straight line', () => {
    expect(runTracker(line(0, 0, 400, 0))).toEqual([]);
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
    const out = line(0, 0, 60, 0);
    const back = line(60, 0, 0, 0).slice(1);
    const splits = runTracker([...out, ...back]);
    expect(splits.length).toBe(1);
    // The split lands within a few samples of the turn, so nearly the whole
    // return leg composites as a second pass.
    expect(splits[0]).toBeGreaterThanOrEqual(out.length);
    expect(splits[0]).toBeLessThanOrEqual(out.length + 3);
  });

  it('does not split at an ordinary 90° corner', () => {
    expect(runTracker([...line(0, 0, 80, 0), ...line(80, 0, 80, 80).slice(1)])).toEqual([]);
  });

  it('splits when a loop closes back onto its own strip', () => {
    const loop = [
      ...line(0, 0, 90, 0),
      ...line(90, 0, 90, 90).slice(1),
      ...line(90, 90, 0, 90).slice(1),
      ...line(0, 90, 0, -20).slice(1),
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
      ...line(0, 0, 80, 0),
      ...line(80, 0, 0, 0).slice(1),
      ...line(0, 0, 80, 0).slice(1),
    ];
    expect(runTracker(zigzag).length).toBe(2);
  });
});

describe('crayon ops through the command pipeline', () => {
  const crayonOp = (points: CrayonPoint[]): CrayonOp => ({
    kind: 'crayon',
    pid: 1,
    points,
    color: '#ff0000',
    lineWidth: 8,
  });

  it('commandSegmentCount counts raw pass points so keyframing still triggers', () => {
    const cmd = {
      ops: [crayonOp(line(0, 0, 100, 0)), crayonOp(line(100, 0, 0, 0))] as StrokeOp[],
      wasEmpty: true,
    };
    const points = cmd.ops.reduce((n, op) => n + (op.kind === 'crayon' ? op.points.length : 0), 0);
    expect(points).toBeGreaterThan(0);
    expect(commandSegmentCount(cmd)).toBe(points);
  });

  it('commit-time simplification passes crayon ops through untouched, in order', () => {
    const a = crayonOp(line(0, 0, 100, 0));
    const b = crayonOp(line(100, 0, 40, 0));
    const ops: StrokeOp[] = [a, b];
    const out = simplifyCommandOps(ops);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
    expect(a.points.length).toBe(line(0, 0, 100, 0).length);
  });
});
