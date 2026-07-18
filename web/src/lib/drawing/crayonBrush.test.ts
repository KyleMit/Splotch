import { describe, it, expect } from 'vitest';
import { toothHeight, depositAlpha, CRAYON_VARIANTS, type CrayonVariant } from './crayonBrush';

const wax = CRAYON_VARIANTS.wax;

describe('crayon tooth field', () => {
  it('is deterministic — same point always yields the same height', () => {
    expect(toothHeight(37, 91, wax)).toBe(toothHeight(37, 91, wax));
    expect(toothHeight(0, 0, wax)).toBe(toothHeight(0, 0, wax));
  });

  it('stays within [0,1]', () => {
    for (let i = 0; i < 400; i++) {
      const t = toothHeight((i * 7919) % 997, (i * 104729) % 991, wax);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it('tiles seamlessly — periodic with the variant tile so the repeat has no seam', () => {
    // The whole point of the paper-anchored repeat pattern: a stroke that crosses
    // a tile boundary must sample a continuous tooth, so the field must wrap.
    for (const [x, y] of [
      [3, 5],
      [17, 200],
      [500, 11],
    ]) {
      expect(toothHeight(x, y, wax)).toBeCloseTo(toothHeight(x + wax.tile, y, wax), 10);
      expect(toothHeight(x, y, wax)).toBeCloseTo(toothHeight(x, y + wax.tile, wax), 10);
    }
  });

  it('actually varies across the tile (a real tooth, not a constant)', () => {
    const samples = Array.from({ length: 64 }, (_, i) => toothHeight(i * 8, (i * 13) % 400, wax));
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.25);
  });
});

describe('wax-deposit curve', () => {
  it('maps valleys to the floor and peaks to the ceil, monotonically', () => {
    expect(depositAlpha(0, wax)).toBeCloseTo(wax.floor, 6);
    expect(depositAlpha(1, wax)).toBeCloseTo(wax.ceil, 6);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const d = depositAlpha(t, wax);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('keeps a non-zero valley deposit so later passes can keep filling', () => {
    // A zero floor would freeze the valleys forever — no buildup past pass one.
    expect(depositAlpha(0, wax)).toBeGreaterThan(0);
  });
});

// The buildup invariant, expressed on the compositing math the renderer relies
// on: painting the same-colour semi-transparent deposit again is source-over, so
// the effective alpha after n passes is 1-(1-a)^n. Hue never enters — only the
// alpha climbs — which is exactly "fill the tooth / get denser, don't shift hue"
// and the opposite of multiply (which would drive the overlap toward black).
function sourceOverAlpha(deposit: number, passes: number): number {
  return 1 - Math.pow(1 - deposit, passes);
}

describe('same-colour buildup (source-over alpha compounding)', () => {
  const variant: CrayonVariant = wax;
  const valley = depositAlpha(0.1, variant); // a thin tooth valley
  const mid = depositAlpha(0.4, variant); // a partly-inked mid tone
  const peak = depositAlpha(1.0, variant); // a near-solid tooth peak

  it('a second pass raises coverage/density at every tooth depth', () => {
    for (const a of [valley, mid, peak]) {
      expect(sourceOverAlpha(a, 2)).toBeGreaterThan(sourceOverAlpha(a, 1));
    }
  });

  it('fills the grain — partly-inked areas keep gaining while near-solid peaks are done', () => {
    const midGain = sourceOverAlpha(mid, 2) - sourceOverAlpha(mid, 1);
    const peakGain = sourceOverAlpha(peak, 2) - sourceOverAlpha(peak, 1);
    // On pass two the visible change is the tooth filling in, not the body
    // darkening: peaks are already near-solid and barely move.
    expect(midGain).toBeGreaterThan(peakGain);
    expect(peakGain).toBeLessThan(0.06);
  });

  it('converges to the solid colour rather than past it (no multiply darkening)', () => {
    // Many passes approach full opacity of the SAME colour and stop — they never
    // drive alpha above 1 (which is what a darkening blend would keep doing).
    expect(sourceOverAlpha(valley, 40)).toBeGreaterThan(0.95);
    expect(sourceOverAlpha(valley, 40)).toBeLessThanOrEqual(1);
  });
});
