import { describe, it, expect } from 'vitest';
import { edgeMargins } from './magicSheetEdges';

describe('letterbox edge extension geometry', () => {
  // A tall fill contain-fit into a taller viewport → top + bottom margins only.
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
    expect(top.sy).toBeGreaterThan(0);
    expect(bottom.sh).toBe(1);
    expect(bottom.sy).toBeLessThan(600);
  });

  // A wide fill contain-fit into a wider viewport → left + right margins only.
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
    expect(left.sx).toBeGreaterThan(0);
    expect(right).toMatchObject({ sw: 1, sh: 400 });
    expect(right.sx).toBeLessThan(600);
  });

  // A fill whose aspect matches the sheet exactly fills it — no margins to extend.
  it('returns no fills when the picture already fills the sheet', () => {
    expect(edgeMargins(400, 600, 0, 0, 400, 600)).toEqual([]);
  });

  // Under a rotation lock the sheet is larger than the paper on the other axis too,
  // so a centered picture can be inset on all four sides (with corners).
  it('fills all four sides and corners for a doubly-inset picture', () => {
    const fills = edgeMargins(1000, 1000, 200, 300, 600, 400); // 200px L/R, 300px T/B
    expect(fills).toHaveLength(8);
    const top = fills.find((f) => f.dy === 0 && f.dh === 300)!;
    const bottom = fills.find((f) => f.dy === 700)!;
    expect(top).toMatchObject({ dx: 200, dw: 600, sh: 1 });
    expect(bottom).toMatchObject({ dx: 200, dw: 600, dh: 300, sh: 1 });
    const left = fills.find((f) => f.dx === 0 && f.dy === 300)!;
    const right = fills.find((f) => f.dx === 800 && f.dy === 300)!;
    expect(left).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    expect(right).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    const corners = fills.filter((f) => f.dw === 200 && f.dh === 300);
    expect(corners).toHaveLength(4);
    expect(corners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dx: 0, dy: 0 }),
        expect.objectContaining({ dx: 800, dy: 0 }),
        expect.objectContaining({ dx: 0, dy: 700 }),
        expect.objectContaining({ dx: 800, dy: 700 }),
      ])
    );
  });
});
