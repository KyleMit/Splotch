import { describe, it, expect } from 'vitest';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT } from './magicBrush';

// A deterministic pseudo-random sequence so gradient generation is reproducible
// in the test (the module defaults to Math.random in the app).
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('rainbow gradient generation', () => {
  it('ships ten pooled gradients', () => {
    expect(MAGIC_GRADIENT_COUNT).toBe(10);
  });

  it('produces a rainbow of ascending hsl stops from 0 to 1', () => {
    const g = createRainbowGradient(seededRand(1));
    expect(g.stops.length).toBeGreaterThanOrEqual(2);
    expect(g.stops[0].offset).toBe(0);
    expect(g.stops[g.stops.length - 1].offset).toBe(1);
    for (let i = 1; i < g.stops.length; i++) {
      expect(g.stops[i].offset).toBeGreaterThan(g.stops[i - 1].offset);
    }
    for (const s of g.stops) {
      const m = /^hsl\((\d+(?:\.\d+)?), \d/.exec(s.color);
      expect(m).not.toBeNull();
      const hue = Number(m![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('varies between seeds so the pool is a set of distinct rainbows', () => {
    const a = createRainbowGradient(seededRand(1));
    const b = createRainbowGradient(seededRand(99));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
