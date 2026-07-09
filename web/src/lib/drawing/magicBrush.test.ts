import { describe, it, expect } from 'vitest';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT, edgeMargins, dilateMask } from './magicBrush';

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

  // Under a rotation lock the sheet is larger than the paper on the other axis too,
  // so a centered picture can be inset on all four sides (with corners). The
  // horizontal pass samples the FULL sheet height so it also paints the corners the
  // vertical pass filled.
  it('fills all four sides and corners for a doubly-inset picture', () => {
    const fills = edgeMargins(1000, 1000, 200, 300, 600, 400); // 200px L/R, 300px T/B
    expect(fills).toHaveLength(4);
    // Vertical pass first: top/bottom rows across the box width only.
    const top = fills.find((f) => f.dy === 0 && f.dh === 300)!;
    const bottom = fills.find((f) => f.dy === 700)!;
    expect(top).toMatchObject({ dx: 200, dw: 600, sh: 1 });
    expect(bottom).toMatchObject({ dx: 200, dw: 600, dh: 300, sh: 1 });
    // Horizontal pass second: full-height columns → side bands spanning the whole
    // sheet height, so the corners are covered.
    const left = fills.find((f) => f.dx === 0)!;
    const right = fills.find((f) => f.dx === 800)!;
    expect(left).toMatchObject({ sy: 0, sh: 1000, dy: 0, dw: 200, dh: 1000 });
    expect(right).toMatchObject({ sy: 0, sh: 1000, dy: 0, dw: 200, dh: 1000 });
    // Order matters: both vertical fills come before both horizontal fills.
    expect(fills.indexOf(top)).toBeLessThan(fills.indexOf(left));
    expect(fills.indexOf(bottom)).toBeLessThan(fills.indexOf(right));
  });
});

describe('outline mask dilation', () => {
  // Grid helpers: build a w×h binary mask from a row of strings, and count set cells.
  const fromRows = (rows: string[]): { m: Uint8Array; w: number; h: number } => {
    const h = rows.length;
    const w = rows[0].length;
    const m = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
    return { m, w, h };
  };
  const count = (m: Uint8Array) => m.reduce((n, v) => n + v, 0);

  it('is a no-op for radius 0 (returns the same buffer)', () => {
    const { m, w, h } = fromRows(['.#.', '...']);
    expect(dilateMask(m, w, h, 0)).toBe(m);
  });

  it('grows a single pixel into a (2r+1)² block', () => {
    const { m, w, h } = fromRows(['.....', '.....', '..#..', '.....', '.....']);
    const r1 = dilateMask(m, w, h, 1);
    expect(count(r1)).toBe(9); // 3×3
    expect(dilateMask(m, w, h, 2).reduce((n, v) => n + v, 0)).toBe(25); // 5×5
    // The original pixel and its 8 neighbours are set; a pixel 2 away is not.
    expect(r1[2 * w + 2]).toBe(1);
    expect(r1[1 * w + 1]).toBe(1);
    expect(r1[0 * w + 2]).toBe(0);
  });

  it('clamps at the edges instead of wrapping', () => {
    const { m, w, h } = fromRows(['#...', '....', '....']);
    const r1 = dilateMask(m, w, h, 1);
    // Corner pixel dilates into a 2×2 block, not off-canvas.
    expect(count(r1)).toBe(4);
    expect(r1[0]).toBe(1);
    expect(r1[1]).toBe(1);
    expect(r1[w]).toBe(1);
    expect(r1[w + 1]).toBe(1);
    expect(r1[w - 1]).toBe(0); // did not wrap to the far edge of row 0
  });

  it('widens a 1px line to a 5px band at radius 2 (the twin-bloom punch)', () => {
    const rows = Array.from({ length: 7 }, () => '...#...'); // vertical line at x=3
    const { m, w, h } = fromRows(rows);
    const r2 = dilateMask(m, w, h, 2);
    // Every row now has columns 1..5 set (the line ±2), and columns 0 and 6 clear.
    for (let y = 0; y < h; y++) {
      for (let x = 1; x <= 5; x++) expect(r2[y * w + x]).toBe(1);
      expect(r2[y * w + 0]).toBe(0);
      expect(r2[y * w + 6]).toBe(0);
    }
  });
});
