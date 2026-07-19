import { describe, it, expect, afterEach } from 'vitest';
import {
  groupPathOpsByPointer,
  splitIntoContinuousRuns,
  simplifyCommandOps,
  setSimplifyOptions,
  getSimplifyCounters,
} from './commandSimplify';
import type { PathOp, StrokeOp } from './strokeOps';

type Pt = { x: number; y: number };
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const STYLE = { color: '#111111', lineWidth: 8, erase: false };

// Build a finger's path ops exactly as the live draw records them
// (strokeSmoothSegments): pointerdown at samples[0], then one op per "frame"
// holding one midpoint-smoothed quadratic — control = previous sample,
// endpoint = midpoint to the new sample — each op starting at the previous
// op's end anchor.
function liveOps(pid: number, samples: Pt[], style: Partial<PathOp> = {}): PathOp[] {
  const ops: PathOp[] = [];
  let start = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const end = mid(samples[i - 1], samples[i]);
    ops.push({
      kind: 'path',
      pid,
      startX: start.x,
      startY: start.y,
      segs: [{ cx: samples[i - 1].x, cy: samples[i - 1].y, x: end.x, y: end.y }],
      ...STYLE,
      ...style,
    });
    start = end;
  }
  return ops;
}

const line = (n: number, step = 4, y = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * step, y }));

const segCount = (ops: StrokeOp[]) =>
  ops.reduce((n, op) => n + (op.kind === 'path' ? op.segs.length : 0), 0);

afterEach(() => {
  // The options and counters are module-level (the engine's dev seam mutates
  // them at runtime); restore the shipping defaults so tests stay independent.
  setSimplifyOptions({
    fraction: 0.03,
    min: 1,
    max: 6,
    cornerAngleDeg: 40,
    mode: 'samples',
    reduce: true,
    enabled: true,
    split: 'corner',
  });
});

describe('groupPathOpsByPointer', () => {
  it('regroups interleaved multi-touch ops per finger, preserving order', () => {
    const a = liveOps(1, line(4));
    const b = liveOps(2, line(4, 4, 50));
    const interleaved: StrokeOp[] = [a[0], b[0], a[1], b[1], a[2], b[2]];
    const byPid = groupPathOpsByPointer(interleaved);
    expect([...byPid.keys()]).toEqual([1, 2]);
    expect(byPid.get(1)).toEqual(a);
    expect(byPid.get(2)).toEqual(b);
  });

  it('skips dots and clears', () => {
    const ops: StrokeOp[] = [
      { kind: 'dot', x: 0, y: 0, radius: 4, color: '#111111', erase: false },
      { kind: 'clear' },
      ...liveOps(1, line(3)),
    ];
    expect(groupPathOpsByPointer(ops).get(1)).toHaveLength(2);
  });
});

describe('splitIntoContinuousRuns', () => {
  it('keeps a continuous same-style stroke as one run', () => {
    const ops = liveOps(1, line(6));
    expect(splitIntoContinuousRuns(ops)).toEqual([ops]);
  });

  it('splits where a resumed pointer jumps (op does not start at the previous anchor)', () => {
    const before = liveOps(1, line(4));
    const after = liveOps(1, line(4, 4, 100));
    const runs = splitIntoContinuousRuns([...before, ...after]);
    expect(runs).toEqual([before, after]);
  });

  it('splits on a mid-stroke style change even when spatially continuous', () => {
    const ops = liveOps(1, line(5));
    const recolored = ops.map((op, i) => (i >= 2 ? { ...op, color: '#222222' } : op));
    const runs = splitIntoContinuousRuns(recolored);
    expect(runs.map((r) => r.length)).toEqual([2, 2]);
  });

  it('splits when the eraser or magic flag flips', () => {
    const ops = liveOps(1, line(5));
    const flipped = ops.map((op, i) => (i >= 3 ? { ...op, magic: true } : op));
    expect(splitIntoContinuousRuns(flipped).map((r) => r.length)).toEqual([3, 1]);
  });
});

describe('simplifyCommandOps', () => {
  it('reduces a long straight stroke to far fewer segments', () => {
    const ops = liveOps(1, line(60));
    const out = simplifyCommandOps(ops);
    expect(segCount(out)).toBeLessThan(segCount(ops) / 2);
    for (const op of out) {
      expect(op.kind).toBe('path');
      if (op.kind === 'path') expect(op).toMatchObject({ pid: 1, ...STYLE });
    }
  });

  it('passes dots and clears through in place', () => {
    const dot: StrokeOp = { kind: 'dot', x: 0, y: 0, radius: 4, color: '#111111', erase: false };
    const out = simplifyCommandOps([dot, ...liveOps(1, line(20)), { kind: 'clear' }]);
    expect(out[0]).toEqual(dot);
    expect(out[out.length - 1]).toEqual({ kind: 'clear' });
  });

  it('passes non-idempotent crayon geometry through unchanged', () => {
    const crayon: StrokeOp = {
      kind: 'crayon',
      color: '#ab71e1',
      polygons: [
        {
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
            { x: 5, y: 2 },
          ],
        },
      ],
    };
    expect(simplifyCommandOps([crayon])).toEqual([crayon]);
  });

  it('emits each finger of a multi-touch command as its own reduced stroke', () => {
    const a = liveOps(1, line(20));
    const b = liveOps(2, line(20, 4, 50), { color: '#222222' });
    const interleaved = a.flatMap((op, i) => [op, b[i]]);
    const out = simplifyCommandOps(interleaved);
    const colors = out.filter((op) => op.kind === 'path').map((op) => (op as PathOp).color);
    // Finger 1's reduced ops all land at its first op's position, then finger 2's.
    expect(colors).toEqual([...colors].sort());
    expect(new Set(colors)).toEqual(new Set(['#111111', '#222222']));
  });

  it('returns the ops untouched when simplification is disabled', () => {
    setSimplifyOptions({ enabled: false });
    const ops = liveOps(1, line(30));
    expect(simplifyCommandOps(ops)).toBe(ops);
  });

  it('tracks lifetime raw/kept counters and resets them on option changes', () => {
    setSimplifyOptions({}); // reset counters
    simplifyCommandOps(liveOps(1, line(40)));
    const { rawPoints, keptPoints } = getSimplifyCounters();
    expect(rawPoints).toBeGreaterThan(0);
    expect(keptPoints).toBeGreaterThan(0);
    expect(keptPoints).toBeLessThan(rawPoints);
    setSimplifyOptions({});
    expect(getSimplifyCounters()).toEqual({ rawPoints: 0, keptPoints: 0 });
  });
});
