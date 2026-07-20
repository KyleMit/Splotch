import { describe, it, expect, afterEach } from 'vitest';
import {
  seedPhase,
  getCrayonOptions,
  setCrayonOptions,
  getCrayonPasses,
  waxTone,
  shadeWaxChannel,
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

describe('waxTone', () => {
  it('is deterministic and bounded to [-1, 1]', () => {
    for (const h of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const s = waxTone(h);
      expect(s).toBe(waxTone(h));
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('shades thick wax darker and thin wax lighter, monotonic in tooth height', () => {
    expect(waxTone(0.9)).toBeGreaterThan(0);
    expect(waxTone(0.1)).toBeLessThan(0);
    expect(waxTone(0.5)).toBeCloseTo(0, 5);
    expect(waxTone(0.7)).toBeGreaterThan(waxTone(0.6));
  });
});

describe('shadeWaxChannel', () => {
  it('is the identity at zero amplitude or zero tone (flat body colour)', () => {
    for (const c of [0, 54, 128, 226, 255]) {
      expect(shadeWaxChannel(c, 1, 0)).toBe(c);
      expect(shadeWaxChannel(c, -1, 0)).toBe(c);
      expect(shadeWaxChannel(c, 0, 0.2)).toBe(c);
    }
  });

  it('darkens toward black and lightens toward white, staying in 0..255', () => {
    for (const c of [0, 54, 128, 226, 255]) {
      const dark = shadeWaxChannel(c, 1, 0.12);
      const light = shadeWaxChannel(c, -1, 0.12);
      expect(dark).toBeLessThanOrEqual(c);
      expect(light).toBeGreaterThanOrEqual(c);
      expect(dark).toBeGreaterThanOrEqual(0);
      expect(light).toBeLessThanOrEqual(255);
    }
    // Even a saturated channel keeps headroom in the direction it has room for.
    expect(shadeWaxChannel(255, 1, 0.12)).toBeLessThan(255);
    expect(shadeWaxChannel(0, -1, 0.12)).toBeGreaterThan(0);
  });

  it('stays subtle at the tuned default amplitude', () => {
    const amp = CRAYON_DEFAULTS.toneVariation;
    for (const c of [0, 54, 128, 226, 255]) {
      expect(Math.abs(shadeWaxChannel(c, 1, amp) - c)).toBeLessThanOrEqual(255 * amp + 1);
      expect(Math.abs(shadeWaxChannel(c, -1, amp) - c)).toBeLessThanOrEqual(255 * amp + 1);
    }
  });
});

// Mimics the engine's split loop: on 'split' a fresh tracker is re-seeded at
// the previous point (the split point is not consumed) — exactly what advances
// the seed for mid-gesture buildup.
const WIDTH = 16;

function line(x0: number, y0: number, x1: number, y1: number): CrayonPoint[] {
  const pts: CrayonPoint[] = [];
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4));
  for (let i = 0; i <= n; i++) {
    pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
  }
  return pts;
}

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
    // return leg deposits as a fresh phase.
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

  it('a triple back-and-forth yields a fresh phase per sweep', () => {
    const zigzag = [
      ...line(0, 0, 80, 0),
      ...line(80, 0, 0, 0).slice(1),
      ...line(0, 0, 80, 0).slice(1),
    ];
    expect(runTracker(zigzag).length).toBe(2);
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

  it('mixes colour with the under-ink a little, but only a little (crayons barely mix)', () => {
    expect(CRAYON_DEFAULTS.colorMix).toBeGreaterThan(0);
    expect(CRAYON_DEFAULTS.colorMix).toBeLessThanOrEqual(0.3);
  });

  it('setCrayonOptions overrides then restores (the dev A/B seam)', () => {
    setCrayonOptions({ passes: [{ widthScale: 1, coverage: 0.9 }] });
    expect(getCrayonPasses()).toHaveLength(1);
    setCrayonOptions(CRAYON_DEFAULTS);
    expect(getCrayonPasses().length).toBe(CRAYON_DEFAULTS.passes.length);
  });
});
