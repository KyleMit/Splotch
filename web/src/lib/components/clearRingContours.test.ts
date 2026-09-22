// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClearRingContours } from './clearRingContours';

const ARC = /^M([\d.]+),([\d.]+) A([\d.]+) ([\d.]+) 0 ([01]) 1 ([\d.]+),([\d.]+)$/;
const ON_CIRCLE_TOLERANCE_PX = 0.01;

function parseArc(command: string) {
  const match = ARC.exec(command);
  if (!match) throw new Error(`Not a single circular arc: ${command}`);
  const [, x0, y0, rx, ry, largeArc, x1, y1] = match.map(Number);
  return { from: { x: x0, y: y0 }, to: { x: x1, y: y1 }, rx, ry, largeArc };
}

function parseDashes(path: string) {
  return path.split(' M').map((segment, index) => parseArc(index === 0 ? segment : `M${segment}`));
}

function radialErrorPx(point: { x: number; y: number }, radiusPx: number) {
  return Math.abs(Math.hypot(point.x - radiusPx, point.y - radiusPx) - radiusPx);
}

describe('createClearRingContours', () => {
  it.each([255, 390, 1024])('draws every dash as an arc of the %ipx ring', (diameterPx) => {
    const radiusPx = diameterPx / 2;
    for (const arc of parseDashes(createClearRingContours(diameterPx).dashes)) {
      expect(arc.rx).toBeCloseTo(radiusPx, 2);
      expect(arc.ry).toBeCloseTo(radiusPx, 2);
      expect(arc.largeArc).toBe(0);
      expect(radialErrorPx(arc.from, radiusPx)).toBeLessThan(ON_CIRCLE_TOLERANCE_PX);
      expect(radialErrorPx(arc.to, radiusPx)).toBeLessThan(ON_CIRCLE_TOLERANCE_PX);
    }
  });

  it('adds dashes as the ring grows instead of stretching them', () => {
    expect(parseDashes(createClearRingContours(255).dashes)).toHaveLength(32);
    expect(parseDashes(createClearRingContours(1020).dashes)).toHaveLength(128);
  });

  it('keeps the authored variation in dash length', () => {
    const chords = parseDashes(createClearRingContours(255).dashes).map((arc) =>
      Math.hypot(arc.to.x - arc.from.x, arc.to.y - arc.from.y)
    );
    expect(Math.max(...chords) - Math.min(...chords)).toBeGreaterThan(5);
  });

  it('draws the ready contour as one closed circle of two half arcs', () => {
    const diameterPx = 255;
    const radiusPx = diameterPx / 2;
    const { solid } = createClearRingContours(diameterPx);
    const match = /^(M[\d.,]+ A[^A]+?)( A.+?)Z$/.exec(solid);
    if (!match) throw new Error(`Not a closed pair of arcs: ${solid}`);
    const first = parseArc(match[1]);
    const second = parseArc(`M${first.to.x.toFixed(2)},${first.to.y.toFixed(2)}${match[2]}`);
    for (const arc of [first, second]) {
      expect(arc.rx).toBeCloseTo(radiusPx, 2);
      expect(arc.ry).toBeCloseTo(radiusPx, 2);
      expect(arc.largeArc).toBe(1);
    }
    expect(second.to).toEqual(first.from);
    expect(first.to).toEqual({ x: 0, y: radiusPx });
  });
});
