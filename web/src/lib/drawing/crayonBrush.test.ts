import { describe, expect, it } from 'vitest';
import {
  CRAYON_TILE_SIZE,
  crayonDepositAlphaAt,
  createCrayonStrokeGeometry,
  extendCrayonStrokeGeometry,
  finishCrayonStrokeGeometry,
  type CrayonPoint,
} from './crayonBrush';

function renderGeometry(points: CrayonPoint[]) {
  const state = createCrayonStrokeGeometry(points[0], 8);
  const polygons = extendCrayonStrokeGeometry(state, points.slice(1));
  polygons.push(...finishCrayonStrokeGeometry(state));
  return polygons;
}

describe('crayon tooth', () => {
  it('is deterministic, seamless, and leaves no permanent zero-alpha pits', () => {
    for (const [x, y] of [
      [0, 0],
      [37.25, 91.5],
      [255.75, 128.25],
    ]) {
      const alpha = crayonDepositAlphaAt(x, y);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(crayonDepositAlphaAt(x + CRAYON_TILE_SIZE, y)).toBeCloseTo(alpha, 12);
      expect(crayonDepositAlphaAt(x, y + CRAYON_TILE_SIZE)).toBeCloseTo(alpha, 12);
    }
  });
});

describe('crayon swept geometry', () => {
  it('resamples the same straight traversal identically at sparse and dense input rates', () => {
    const sparse = renderGeometry([
      { x: 10, y: 40 },
      { x: 210, y: 40 },
    ]);
    const dense = renderGeometry([
      { x: 10, y: 40 },
      { x: 50, y: 40 },
      { x: 90, y: 40 },
      { x: 130, y: 40 },
      { x: 170, y: 40 },
      { x: 210, y: 40 },
    ]);
    expect(dense).toEqual(sparse);
  });

  it('keeps every straight-stroke vertex inside the swept radius', () => {
    const polygons = renderGeometry([
      { x: 20, y: 60 },
      { x: 220, y: 60 },
    ]);
    for (const polygon of polygons) {
      for (const point of polygon.points) {
        expect(point.x).toBeGreaterThanOrEqual(12);
        expect(point.x).toBeLessThanOrEqual(228);
        expect(point.y).toBeGreaterThanOrEqual(52);
        expect(point.y).toBeLessThanOrEqual(68);
      }
    }
  });

  it('splits a real reversal into later deposit polygons', () => {
    const outbound = renderGeometry([
      { x: 20, y: 60 },
      { x: 220, y: 60 },
    ]);
    const backtrack = renderGeometry([
      { x: 20, y: 60 },
      { x: 220, y: 60 },
      { x: 80, y: 60 },
    ]);
    expect(backtrack.length).toBeGreaterThan(outbound.length);
    expect(
      backtrack.filter((polygon) => polygon.points.some((point) => point.x > 100 && point.x < 200))
        .length
    ).toBeGreaterThan(1);
  });
});
