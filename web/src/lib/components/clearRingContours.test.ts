// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClearRingContours } from './clearRingContours';

const ARC = /^M([\d.]+),([\d.]+) A([\d.]+) ([\d.]+) 0 ([01]) 1 ([\d.]+),([\d.]+)$/;
const CUBIC =
  /^M(-?[\d.]+),(-?[\d.]+) C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)$/;
const ON_CIRCLE_TOLERANCE_PX = 0.01;
const PEN_DEVIATION_LIMIT_PX = 1;

function parseArc(command: string) {
  const match = ARC.exec(command);
  if (!match) throw new Error(`Not a single circular arc: ${command}`);
  const [, x0, y0, rx, ry, largeArc, x1, y1] = match.map(Number);
  return { from: { x: x0, y: y0 }, to: { x: x1, y: y1 }, rx, ry, largeArc };
}

function parseDashes(path: string) {
  return path.split(' M').map((segment, index) => {
    const command = index === 0 ? segment : `M${segment}`;
    const match = CUBIC.exec(command);
    if (!match) throw new Error(`Not a single cubic pen mark: ${command}`);
    const numbers = match.slice(1).map(Number);
    const points = [0, 2, 4, 6].map((offset) => ({ x: numbers[offset], y: numbers[offset + 1] }));
    return { from: points[0], to: points[3], points };
  });
}

function radialErrorPx(point: { x: number; y: number }, radiusPx: number) {
  return Math.abs(Math.hypot(point.x - radiusPx, point.y - radiusPx) - radiusPx);
}

describe('createClearRingContours', () => {
  it.each([255, 390, 1024])(
    'keeps every %ipx pen mark within a pen width of the ring',
    (diameterPx) => {
      const radiusPx = diameterPx / 2;
      for (const dash of parseDashes(createClearRingContours(diameterPx).dashes)) {
        for (const point of dash.points) {
          expect(radialErrorPx(point, radiusPx)).toBeLessThan(PEN_DEVIATION_LIMIT_PX);
        }
      }
    }
  );

  it('bends every pen mark off the circle so the dashes read hand-drawn', () => {
    const radiusPx = 255 / 2;
    const deviations = parseDashes(createClearRingContours(255).dashes).map((dash) =>
      Math.max(...dash.points.map((point) => radialErrorPx(point, radiusPx)))
    );
    expect(Math.min(...deviations)).toBeGreaterThan(0.5);
  });

  it('adds dashes as the ring grows instead of stretching them', () => {
    expect(parseDashes(createClearRingContours(255).dashes)).toHaveLength(32);
    expect(parseDashes(createClearRingContours(1020).dashes)).toHaveLength(128);
  });

  it('keeps the authored variation in dash length', () => {
    const chords = parseDashes(createClearRingContours(255).dashes).map((dash) =>
      Math.hypot(dash.to.x - dash.from.x, dash.to.y - dash.from.y)
    );
    expect(Math.max(...chords) - Math.min(...chords)).toBeGreaterThan(5);
  });

  it.each([255, 610.390625, 815.1875])(
    'draws the %fpx ready contour as one closed circle of four quarter arcs',
    (diameterPx) => {
      const radiusPx = diameterPx / 2;
      const { solid } = createClearRingContours(diameterPx);
      expect(solid.endsWith('Z')).toBe(true);
      const [start, ...arcs] = solid.slice(0, -1).split(' A');
      expect(arcs).toHaveLength(4);
      let from = start;
      for (const arc of arcs) {
        const parsed = parseArc(`${from} A${arc}`);
        expect(parsed.rx).toBeCloseTo(radiusPx, 2);
        expect(parsed.ry).toBeCloseTo(radiusPx, 2);
        expect(parsed.largeArc).toBe(0);
        expect(radialErrorPx(parsed.to, radiusPx)).toBeLessThan(ON_CIRCLE_TOLERANCE_PX);
        expect(Math.hypot(parsed.to.x - parsed.from.x, parsed.to.y - parsed.from.y)).toBeCloseTo(
          radiusPx * Math.SQRT2,
          1
        );
        from = `M${parsed.to.x.toFixed(2)},${parsed.to.y.toFixed(2)}`;
      }
      expect(from).toBe(start);
    }
  );
});
