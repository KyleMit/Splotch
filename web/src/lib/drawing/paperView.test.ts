import { describe, it, expect } from 'vitest';
import {
  computePaperView,
  isIdentityView,
  IDENTITY_PAPER_VIEW,
  paperToView,
  rotationDelta,
  viewMatrix,
  viewToPaper,
  type PaperView,
  type ViewRotation,
} from './paperView';

const ROTATIONS: ViewRotation[] = [0, 90, 180, 270];

describe('rotationDelta', () => {
  it('is the adoption angle minus the current angle, normalized to 0–270', () => {
    expect(rotationDelta(0, 0)).toBe(0);
    expect(rotationDelta(0, 90)).toBe(270);
    expect(rotationDelta(0, 270)).toBe(90);
    expect(rotationDelta(90, 0)).toBe(90);
    expect(rotationDelta(90, 270)).toBe(180);
    expect(rotationDelta(270, 90)).toBe(180);
  });

  it('returning to the adoption angle is always identity', () => {
    for (const a of [0, 90, 180, 270]) expect(rotationDelta(a, a)).toBe(0);
  });
});

describe('computePaperView', () => {
  it('same shape and no rotation is the identity', () => {
    const view = computePaperView({ width: 400, height: 800 }, { width: 400, height: 800 }, 0);
    expect(isIdentityView(view)).toBe(true);
  });

  it('a quarter turn contain-fits the swapped dimensions and centers the rest', () => {
    // Portrait 400×800 paper rotated into an 800×400 viewport: the rotated
    // paper is 800×400 — an exact fit, no letterbox.
    const view = computePaperView({ width: 400, height: 800 }, { width: 800, height: 400 }, 90);
    expect(view.scale).toBe(1);
    const corners = [
      paperToView(view, 0, 0),
      paperToView(view, 400, 0),
      paperToView(view, 0, 800),
      paperToView(view, 400, 800),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(800);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(400);
  });

  it('letterboxes with a uniform downscale when the rotated paper does not fit', () => {
    // 300×600 paper rotated 90 into 500×400: rotated paper is 600×300 → scale
    // is bounded by width (500/600), the leftover height splits into margins.
    const view = computePaperView({ width: 300, height: 600 }, { width: 500, height: 400 }, 90);
    expect(view.scale).toBeCloseTo(500 / 600);
    const corners = [
      paperToView(view, 0, 0),
      paperToView(view, 300, 0),
      paperToView(view, 0, 600),
      paperToView(view, 300, 600),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(500);
    const drawnH = 300 * (500 / 600);
    expect(Math.min(...ys)).toBeCloseTo((400 - drawnH) / 2);
    expect(Math.max(...ys)).toBeCloseTo((400 + drawnH) / 2);
  });

  it('maps the whole paper inside the viewport for every rotation', () => {
    const paper = { width: 320, height: 720 };
    const viewport = { width: 640, height: 360 };
    for (const rotate of ROTATIONS) {
      const view = computePaperView(paper, viewport, rotate);
      for (const [px, py] of [
        [0, 0],
        [paper.width, 0],
        [0, paper.height],
        [paper.width, paper.height],
        [paper.width / 2, paper.height / 2],
      ]) {
        const { x, y } = paperToView(view, px, py);
        expect(x).toBeGreaterThanOrEqual(-1e-9);
        expect(x).toBeLessThanOrEqual(viewport.width + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(viewport.height + 1e-9);
      }
    }
  });

  it('a 180 turn keeps the paper centered at the same size', () => {
    const view = computePaperView({ width: 400, height: 800 }, { width: 400, height: 800 }, 180);
    expect(view.scale).toBe(1);
    expect(paperToView(view, 0, 0)).toEqual({ x: 400, y: 800 });
    expect(paperToView(view, 400, 800)).toEqual({ x: 0, y: 0 });
    expect(paperToView(view, 200, 400)).toEqual({ x: 200, y: 400 });
  });
});

describe('viewMatrix / viewToPaper', () => {
  it('viewMatrix agrees with paperToView', () => {
    for (const rotate of ROTATIONS) {
      const view: PaperView = { scale: 0.75, rotate, tx: 37, ty: -12 };
      const [a, b, c, d, e, f] = viewMatrix(view);
      for (const [x, y] of [
        [0, 0],
        [10, 250],
        [-30, 4.5],
      ]) {
        const mapped = paperToView(view, x, y);
        expect(a * x + c * y + e).toBeCloseTo(mapped.x);
        expect(b * x + d * y + f).toBeCloseTo(mapped.y);
      }
    }
  });

  it('viewToPaper inverts paperToView for every rotation', () => {
    for (const rotate of ROTATIONS) {
      const view: PaperView = { scale: 0.6, rotate, tx: 120, ty: 80 };
      for (const [x, y] of [
        [0, 0],
        [400, 0],
        [123.4, 567.8],
        [-20, 300],
      ]) {
        const round = viewToPaper(view, paperToView(view, x, y).x, paperToView(view, x, y).y);
        expect(round.x).toBeCloseTo(x);
        expect(round.y).toBeCloseTo(y);
      }
    }
  });

  it('the identity view maps points to themselves', () => {
    expect(paperToView(IDENTITY_PAPER_VIEW, 42, 7)).toEqual({ x: 42, y: 7 });
    expect(viewToPaper(IDENTITY_PAPER_VIEW, 42, 7)).toEqual({ x: 42, y: 7 });
    expect(viewMatrix(IDENTITY_PAPER_VIEW)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
