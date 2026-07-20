import { describe, it, expect, afterEach } from 'vitest';
import {
  seedPhase,
  getCrayonOptions,
  setCrayonOptions,
  getCrayonPasses,
  shadeShift,
  CRAYON_DEFAULTS,
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
