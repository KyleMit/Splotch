import { describe, it, expect, afterEach } from 'vitest';
import {
  seedPhase,
  getCrayonOptions,
  setCrayonOptions,
  getCrayonPasses,
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

describe('crayon options seam', () => {
  afterEach(() => setCrayonOptions(CRAYON_DEFAULTS));

  it('exposes the tuned default passes (widest-first, denser core last)', () => {
    const passes = getCrayonPasses();
    expect(passes).toEqual([
      { widthScale: 1, coverage: 0.5 },
      { widthScale: 0.68, coverage: 0.68 },
    ]);
  });

  it('setCrayonOptions overrides then restores (the dev A/B seam)', () => {
    setCrayonOptions({ passes: [{ widthScale: 1, coverage: 0.9 }] });
    expect(getCrayonPasses()).toHaveLength(1);
    setCrayonOptions(CRAYON_DEFAULTS);
    expect(getCrayonPasses().length).toBe(CRAYON_DEFAULTS.passes.length);
  });
});
