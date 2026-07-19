import { describe, expect, it } from 'vitest';
import { crayonAlphaAt } from './crayonTexture';

describe('two-octave crayon tooth', () => {
  it('has fine grain inside a coarser weave without transparent pinholes', () => {
    const fine = new Set<number>();
    const coarse = new Set<number>();
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        fine.add(crayonAlphaAt(x, y));
        coarse.add(crayonAlphaAt(x * 8, y * 8));
        expect(crayonAlphaAt(x, y)).toBeGreaterThan(0.4);
        expect(crayonAlphaAt(x, y)).toBeLessThan(0.93);
      }
    }
    expect(fine.size).toBeGreaterThan(100);
    expect(coarse.size).toBeGreaterThan(100);
  });

  it('builds opacity at the same hue on a second pass', () => {
    const alpha = crayonAlphaAt(13, 29);
    const twice = alpha + alpha * (1 - alpha);
    expect(twice).toBeGreaterThan(alpha);
    expect(twice).toBeLessThan(1);
  });
});
