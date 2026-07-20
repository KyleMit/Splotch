import { describe, it, expect, afterEach } from 'vitest';
import {
  seedPhase,
  getCrayonOptions,
  setCrayonOptions,
  getCrayonPasses,
  shadeShift,
  CrayonPassTracker,
  CRAYON_DEFAULTS,
  type CrayonPoint,
} from './crayonBrush';

// The crayon's wax buildup comes from phase-shifting one deterministic tooth
// field per stroke seed (ADR-0065). These cover the pure, DOM-free half of that
// contract; the rendered look + buildup live in the engine E2E spec.

describe('seedPhase', () => {
  it('is deterministic — the same seed always yields the same phase', () => {
    expect(seedPhase(42, 256)).toEqual(seedPhase(42, 256));
    expect(seedPhase(7, 128)).toEqual(seedPhase(7, 128));
  });

  it('stays within the tile so the pattern tiles seamlessly', () => {
    for (const seed of [0, 1, 2, 999, 65535, 1234567]) {
      const [px, py] = seedPhase(seed, 256);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThan(256);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThan(256);
    }
  });

  it('spreads consecutive seeds to distinct phases (so consecutive strokes build up)', () => {
    const phases = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) phases.add(seedPhase(seed, 256).join(','));
    // Consecutive stroke seeds must not collapse onto one phase, or a redraw
    // would re-punch the same tooth pits and never fill in.
    expect(phases.size).toBeGreaterThan(25);
  });
});

describe('shadeShift', () => {
  it('is zero when the amplitude is zero (flat body colour)', () => {
    expect(Math.abs(shadeShift(0.9, 0.1, 0))).toBe(0);
    expect(Math.abs(shadeShift(0.2, 0.8, 0))).toBe(0);
  });

  it('never exceeds the amplitude in either direction', () => {
    for (const h of [0, 0.25, 0.5, 0.7, 0.9, 1]) {
      for (const b of [0, 0.5, 1]) {
        expect(Math.abs(shadeShift(h, b, 0.08))).toBeLessThanOrEqual(0.08 + 1e-12);
      }
    }
  });

  it('darkens thick deposit and lightens sparse patches', () => {
    // Taller tooth bump (thicker wax) at the same body value → darker.
    expect(shadeShift(0.95, 0.5, 0.08)).toBeLessThan(shadeShift(0.5, 0.5, 0.08));
    // Higher body value thins waxAlpha's coverage — shade must lighten with it
    // so mottled-sparse patches read lighter, not darker.
    expect(shadeShift(0.7, 0.9, 0.08)).toBeGreaterThan(shadeShift(0.7, 0.1, 0.08));
  });

  it('is deterministic — a paper texel always gets the same shift', () => {
    expect(shadeShift(0.63, 0.41, 0.08)).toBe(shadeShift(0.63, 0.41, 0.08));
  });
});

describe('crayon options seam', () => {
  afterEach(() => setCrayonOptions(CRAYON_DEFAULTS));

  it('exposes the tuned default passes (widest-first, denser core last)', () => {
    const passes = getCrayonPasses();
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(passes[0].widthScale).toBe(1);
    expect(passes.at(-1)!.coverage).toBeGreaterThan(passes[0].coverage);
  });

  it('ships a low but nonzero colour mix — crayons barely mix, but they do', () => {
    expect(CRAYON_DEFAULTS.colorMix).toBeGreaterThan(0);
    expect(CRAYON_DEFAULTS.colorMix).toBeLessThanOrEqual(0.25);
  });

  it('ships a nonzero but very subtle shade variation by default', () => {
    // The splat pattern already varies coverage, so the colour wobble must stay
    // gentle — a default past ~0.12 reads as mottled paint, not wax.
    expect(CRAYON_DEFAULTS.shadeVariation).toBeGreaterThan(0);
    expect(CRAYON_DEFAULTS.shadeVariation).toBeLessThanOrEqual(0.12);
  });

  it('setCrayonOptions overrides then restores (the dev A/B seam)', () => {
    setCrayonOptions({ passes: [{ widthScale: 1, coverage: 0.9 }] });
    expect(getCrayonPasses()).toHaveLength(1);
    setCrayonOptions(CRAYON_DEFAULTS);
    expect(getCrayonPasses().length).toBe(CRAYON_DEFAULTS.passes.length);
  });
});

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
