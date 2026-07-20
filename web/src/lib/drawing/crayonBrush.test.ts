import { describe, it, expect, afterEach } from 'vitest';
import {
  seedPhase,
  getCrayonOptions,
  setCrayonOptions,
  getCrayonPasses,
  waxTone,
  shadeWaxChannel,
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

describe('crayon options seam', () => {
  afterEach(() => setCrayonOptions(CRAYON_DEFAULTS));

  it('exposes the tuned default passes (widest-first, denser core last)', () => {
    const passes = getCrayonPasses();
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(passes[0].widthScale).toBe(1);
    expect(passes.at(-1)!.coverage).toBeGreaterThan(passes[0].coverage);
  });

  it('setCrayonOptions overrides then restores (the dev A/B seam)', () => {
    setCrayonOptions({ passes: [{ widthScale: 1, coverage: 0.9 }] });
    expect(getCrayonPasses()).toHaveLength(1);
    setCrayonOptions(CRAYON_DEFAULTS);
    expect(getCrayonPasses().length).toBe(CRAYON_DEFAULTS.passes.length);
  });
});
