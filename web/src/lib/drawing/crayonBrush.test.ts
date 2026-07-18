import { describe, it, expect, beforeEach } from 'vitest';
import { nextCrayonGrain, getCrayonParams, setCrayonParams, CRAYON_DEFAULTS } from './crayonBrush';

// Pure, canvas-free crayon invariants. The tile/pattern rasterisation needs a
// real 2D canvas (covered by the Playwright engine spec); here we pin the
// deterministic per-stroke grain and the dev-param seam.

describe('crayon grain', () => {
  beforeEach(() => setCrayonParams({ ...CRAYON_DEFAULTS }));

  it('cycles through every jitter bucket so consecutive strokes differ', () => {
    const n = getCrayonParams().jitterFields;
    const grains = Array.from({ length: n }, () => nextCrayonGrain());
    const buckets = grains.map((g) => Math.floor(g * n));
    // n consecutive strokes land in n distinct buckets — a same-place second
    // pass is guaranteed a different jitter field, so it builds up.
    expect(new Set(buckets).size).toBe(n);
    // ...and it wraps around rather than running off the end.
    expect(Math.floor(nextCrayonGrain() * n)).toBe(buckets[0]);
  });

  it('keeps grain in [0,1)', () => {
    for (let i = 0; i < 50; i++) {
      const g = nextCrayonGrain();
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(1);
    }
  });
});

describe('crayon params', () => {
  beforeEach(() => setCrayonParams({ ...CRAYON_DEFAULTS }));

  it('round-trips overrides and leaves the rest at their defaults', () => {
    setCrayonParams({ coverage: 0.5, jitterAmp: 0.3 });
    const p = getCrayonParams();
    expect(p.coverage).toBe(0.5);
    expect(p.jitterAmp).toBe(0.3);
    expect(p.tile).toBe(CRAYON_DEFAULTS.tile);
    expect(p.seed).toBe(CRAYON_DEFAULTS.seed);
  });
});
