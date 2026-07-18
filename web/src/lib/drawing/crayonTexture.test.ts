import { describe, it, expect } from 'vitest';
import {
  depositAlpha,
  cumulativeCoverage,
  getCrayonParams,
  setCrayonParams,
  DEFAULT_CRAYON_PARAMS,
} from './crayonTexture';
import { crayonNoiseBytes, CRAYON_NOISE_SIZE } from './crayonNoise';

// The crayon's look and its wax-buildup behaviour are governed by two pure
// functions plus the shipped blue-noise tooth (ADR-0065). happy-dom has no real
// 2D context, so the actual pixel compositing is exercised in the Playwright
// engine spec; here we lock down the deterministic math the renderer relies on.

describe('crayon tooth (blue noise)', () => {
  it('is a stable, deterministic permutation of 0..N (no RNG at load)', () => {
    const a = crayonNoiseBytes();
    const b = crayonNoiseBytes();
    // Same array every call — the tile is a shipped constant, so every device,
    // replay, and export samples identical tooth (bit-identical-replay invariant).
    expect(a).toBe(b);
    expect(a.length).toBe(CRAYON_NOISE_SIZE * CRAYON_NOISE_SIZE);
    // Void-and-cluster ranks are a permutation → each byte value is well spread.
    let sum = 0;
    let min = 255;
    let max = 0;
    for (const v of a) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBe(0);
    expect(max).toBe(255);
    // Mean sits near mid-grey for a uniform rank distribution.
    expect(sum / a.length).toBeGreaterThan(120);
    expect(sum / a.length).toBeLessThan(135);
  });
});

describe('depositAlpha coverage curve', () => {
  const p = DEFAULT_CRAYON_PARAMS;

  it('is monotonic non-decreasing in tooth height', () => {
    let prev = -1;
    for (let h = 0; h <= 1.0001; h += 0.05) {
      const a = depositAlpha(h, p);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('deposits the floor in the deepest valleys and the peak on the crest', () => {
    expect(depositAlpha(0, p)).toBeCloseTo(p.floor, 5);
    expect(depositAlpha(1, p)).toBeCloseTo(p.peak, 5);
  });

  it('keeps a positive floor so many passes can still fill the valleys', () => {
    expect(depositAlpha(0, p)).toBeGreaterThan(0);
  });
});

describe('wax buildup law (cumulativeCoverage)', () => {
  it('increases with every pass and converges toward opaque, never past it', () => {
    const a = 0.15; // a valley pixel
    const c1 = cumulativeCoverage(a, 1);
    const c2 = cumulativeCoverage(a, 2);
    const c3 = cumulativeCoverage(a, 3);
    expect(c1).toBeCloseTo(0.15, 5);
    expect(c2).toBeGreaterThan(c1);
    expect(c3).toBeGreaterThan(c2);
    expect(cumulativeCoverage(a, 50)).toBeGreaterThan(0.99);
    expect(cumulativeCoverage(a, 9999)).toBeLessThanOrEqual(1);
  });

  it('fills valleys gradually but leaves saturated peaks nearly unchanged', () => {
    const p = DEFAULT_CRAYON_PARAMS;
    const peak = depositAlpha(1, p);
    const valley = depositAlpha(0, p);
    // A peak pixel is already near-opaque after one pass → "redrawing barely
    // changes the colour"; a redraw adds little.
    const peakGain = cumulativeCoverage(peak, 2) - cumulativeCoverage(peak, 1);
    // A valley pixel gains far more per redraw → "fills in the tooth".
    const valleyGain = cumulativeCoverage(valley, 2) - cumulativeCoverage(valley, 1);
    expect(valleyGain).toBeGreaterThan(peakGain);
  });
});

// The buildup is source-over of a constant colour, so it must build coverage at
// CONSTANT HUE with NO multiply-style darkening. Model the exact compositing the
// renderer does (out = a*C + (1-a)*below) and assert the invariants.
describe('same-colour overlap builds up at constant hue (no multiply)', () => {
  const C = [47, 111, 208]; // a blue crayon
  const WHITE = [252, 251, 248]; // the paper

  function overSelf(a: number, passes: number): number[] {
    let px = [...WHITE];
    for (let i = 0; i < passes; i++) px = px.map((below, k) => a * C[k] + (1 - a) * below);
    return px;
  }

  it('drives the pixel monotonically toward the crayon colour, never past it', () => {
    const a = depositAlpha(0.2); // a partly-covered tooth pixel
    const p1 = overSelf(a, 1);
    const p2 = overSelf(a, 2);
    const p5 = overSelf(a, 5);
    for (let k = 0; k < 3; k++) {
      // Each pass moves the channel from paper toward C and stays between them —
      // it never overshoots into darker-than-C territory (that's what multiply does).
      const lo = Math.min(C[k], WHITE[k]);
      const hi = Math.max(C[k], WHITE[k]);
      for (const p of [p1, p2, p5]) {
        expect(p[k]).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(p[k]).toBeLessThanOrEqual(hi + 1e-6);
      }
      // Monotonic approach to C.
      expect(Math.abs(p2[k] - C[k])).toBeLessThan(Math.abs(p1[k] - C[k]));
      expect(Math.abs(p5[k] - C[k])).toBeLessThan(Math.abs(p2[k] - C[k]));
    }
  });

  it('holds hue constant while saturation/coverage rises (ratios track the crayon)', () => {
    const a = depositAlpha(0.2);
    // Hue is the direction from paper toward C; every pass lies on that same ray,
    // so the covered colour's chroma direction never rotates (no muddying).
    const p1 = overSelf(a, 1);
    const p3 = overSelf(a, 3);
    const dir = (px: number[]) => {
      const v = [px[0] - WHITE[0], px[1] - WHITE[1], px[2] - WHITE[2]];
      const len = Math.hypot(...v) || 1;
      return v.map((c) => c / len);
    };
    const d1 = dir(p1);
    const d3 = dir(p3);
    for (let k = 0; k < 3; k++) expect(d3[k]).toBeCloseTo(d1[k], 6);
  });
});

describe('dev variant seam', () => {
  it('round-trips params and restores the shipped default', () => {
    const original = getCrayonParams();
    setCrayonParams({ varAmp: 0.9, grainPx: 4 });
    expect(getCrayonParams().varAmp).toBe(0.9);
    expect(getCrayonParams().grainPx).toBe(4);
    setCrayonParams(DEFAULT_CRAYON_PARAMS);
    expect(getCrayonParams()).toEqual(original);
  });
});
