import { describe, it, expect } from 'vitest';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT, edgeMargins } from './magicBrush';

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

describe('letterbox edge extension geometry', () => {
  // A tall twin contain-fit into a taller viewport → top + bottom margins only.
  it('fills top and bottom margins for a top/bottom letterbox', () => {
    const fills = edgeMargins(400, 1000, 0, 200, 400, 600); // box fills width, 200px bands
    expect(fills).toHaveLength(2);
    const top = fills.find((f) => f.dy === 0)!;
    const bottom = fills.find((f) => f.dy === 800)!;
    // Each destination spans the full picture width and the whole margin height.
    expect(top).toMatchObject({ dx: 0, dy: 0, dw: 400, dh: 200 });
    expect(bottom).toMatchObject({ dx: 0, dy: 800, dw: 400, dh: 200 });
    // Sources are 1px-thin rows sampled just inside the picture, not on the border.
    expect(top.sh).toBe(1);
    expect(top.sy).toBeGreaterThan(200); // below the top edge (inset)
    expect(bottom.sh).toBe(1);
    expect(bottom.sy).toBeLessThan(800); // above the bottom edge (inset)
  });

  // A wide twin contain-fit into a wider viewport → left + right margins only.
  it('fills left and right margins for a left/right letterbox, preserving the edge column', () => {
    const fills = edgeMargins(1000, 400, 200, 0, 600, 400);
    expect(fills).toHaveLength(2);
    const left = fills.find((f) => f.dx === 0)!;
    const right = fills.find((f) => f.dx === 800)!;
    expect(left).toMatchObject({ dx: 0, dy: 0, dw: 200, dh: 400 });
    expect(right).toMatchObject({ dx: 800, dy: 0, dw: 200, dh: 400 });
    // 1px-thin columns spanning the full picture height, so the stretched column
    // keeps its along-edge variation (sky at top, grass at bottom).
    expect(left).toMatchObject({ sw: 1, sh: 400 });
    expect(left.sx).toBeGreaterThan(200); // just inside the left edge
    expect(right).toMatchObject({ sw: 1, sh: 400 });
    expect(right.sx).toBeLessThan(800); // just inside the right edge
  });

  // A twin whose aspect matches the sheet exactly fills it — no margins to extend.
  it('returns no fills when the picture already fills the sheet', () => {
    expect(edgeMargins(400, 600, 0, 0, 400, 600)).toEqual([]);
  });
});
