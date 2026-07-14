// Regression tests for the separable box morphology (lib/morphology.mjs) that
// the drift scorer and the chalk-outline generator both stand on. Synthetic
// hand-built masks only — no image fixtures — so this suite is the cheap warm-up
// that locks the dilate/erode semantics those callers depend on:
//
//   • dilate(r) grows a set pixel over the full (2r+1)² square around it
//     (Chebyshev radius r), clipped at the image border.
//   • erode(r) keeps a pixel only if every pixel in that square is set; the
//     out-of-bounds border counts as UNSET, so it eats edge pixels.
//   • opening = erode then dilate removes any structure thinner than ~2r while
//     leaving a solid blob its original size — the exact trick both callers use
//     to separate thin strokes from deliberate solid regions.
import { describe, it, expect } from 'vitest';
import { dilateMask, erodeMask } from '../lib/morphology.mjs';

// Build a w×h 0/1 mask; `set` is a predicate (x, y) => boolean.
function mask(w, h, set) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (set(x, y)) m[y * w + x] = 1;
  return m;
}
const count = (m) => m.reduce((n, v) => n + v, 0);
const at = (m, w, x, y) => m[y * w + x];

describe('dilateMask', () => {
  it('grows a single point into a (2r+1)² square', () => {
    const w = 9,
      h = 9;
    const point = mask(w, h, (x, y) => x === 4 && y === 4);
    expect(count(dilateMask(point, w, h, 1))).toBe(9); // 3×3
    expect(count(dilateMask(point, w, h, 2))).toBe(25); // 5×5
    // and it is centered on the origin pixel
    const d1 = dilateMask(point, w, h, 1);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) expect(at(d1, w, x, y)).toBe(1);
    expect(at(d1, w, 2, 4)).toBe(0);
  });

  it('clips the square at the image border', () => {
    const w = 5,
      h = 5;
    const corner = mask(w, h, (x, y) => x === 0 && y === 0);
    // r=1 from a corner reaches only x,y ∈ {0,1} — the negative side is off-image
    expect(count(dilateMask(corner, w, h, 1))).toBe(4);
  });

  it('is a no-op on the empty mask and leaves a full mask full', () => {
    const w = 6,
      h = 6;
    expect(
      count(
        dilateMask(
          mask(w, h, () => false),
          w,
          h,
          2
        )
      )
    ).toBe(0);
    expect(
      count(
        dilateMask(
          mask(w, h, () => true),
          w,
          h,
          2
        )
      )
    ).toBe(36);
  });

  it('does not mutate its input', () => {
    const w = 5,
      h = 5;
    const m = mask(w, h, (x, y) => x === 2 && y === 2);
    const before = count(m);
    dilateMask(m, w, h, 1);
    expect(count(m)).toBe(before);
  });
});

describe('erodeMask', () => {
  it('peels r pixels off every side of a solid field (border counts as unset)', () => {
    const w = 7,
      h = 7;
    const full = mask(w, h, () => true);
    const e = erodeMask(full, w, h, 1);
    // only the 5×5 interior survives — the outer ring had off-image neighbors
    expect(count(e)).toBe(25);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) expect(at(e, w, x, y)).toBe(1);
    expect(at(e, w, 0, 3)).toBe(0);
  });

  it('erases a solid block thinner than 2r+1', () => {
    const w = 9,
      h = 9;
    // a 2-px-wide vertical bar cannot survive an r=1 erode (needs a 3-wide core)
    const bar = mask(w, h, (x) => x === 4 || x === 5);
    expect(count(erodeMask(bar, w, h, 1))).toBe(0);
  });
});

describe('opening (erode ∘ dilate) — the thin-stroke vs solid-region discriminator', () => {
  it('removes a thin stroke but preserves a solid blob', () => {
    const w = 20,
      h = 20;
    // a 1-px vertical stroke on the left, a solid 6×6 blob on the right
    const thinStroke = (x, y) => x === 3 && y >= 3 && y < 17;
    const blob = (x, y) => x >= 10 && x < 16 && y >= 6 && y < 12;
    const m = mask(w, h, (x, y) => thinStroke(x, y) || blob(x, y));
    const opened = dilateMask(erodeMask(m, w, h, 1), w, h, 1);

    // the stroke is gone
    for (let y = 0; y < h; y++) expect(at(opened, w, 3, y)).toBe(0);
    // the blob's interior is intact (opening restores a solid region)
    for (let y = 7; y < 11; y++) for (let x = 11; x < 15; x++) expect(at(opened, w, x, y)).toBe(1);
  });
});
