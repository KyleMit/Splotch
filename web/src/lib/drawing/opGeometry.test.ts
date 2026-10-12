// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { opGeometricExtent } from './opGeometry';
import type { DotOp, PathOp } from './strokeOps';

function dotOp(overrides: Partial<DotOp> = {}): DotOp {
  return {
    kind: 'dot',
    x: 40,
    y: 60,
    radius: 12,
    color: '#ff0000',
    erase: false,
    ...overrides,
  };
}

function pathOp(overrides: Partial<PathOp> = {}): PathOp {
  return {
    kind: 'path',
    pid: 0,
    startX: 10,
    startY: 10,
    segs: [{ cx: 15, cy: 15, x: 20, y: 20 }],
    color: '#0000ff',
    lineWidth: 4,
    erase: false,
    ...overrides,
  };
}

describe('opGeometricExtent', () => {
  it('returns the point plus radius as halfWidth for a dot op', () => {
    const op = dotOp({ x: 40, y: 60, radius: 12 });

    expect(opGeometricExtent(op)).toEqual({ x0: 40, y0: 60, x1: 40, y1: 60, halfWidth: 12 });
  });

  it('includes an out-of-hull control point, not just the start/end points', () => {
    const op = pathOp({
      startX: 10,
      startY: 10,
      segs: [{ cx: 100, cy: -50, x: 20, y: 20 }],
    });

    const extent = opGeometricExtent(op);

    expect(extent.x0).toBe(10);
    expect(extent.y0).toBe(-50);
    expect(extent.x1).toBe(100);
    expect(extent.y1).toBe(20);
  });

  it('unions the extent across every seg in a multi-seg path', () => {
    const op = pathOp({
      startX: 0,
      startY: 0,
      segs: [
        { cx: 5, cy: 5, x: 10, y: -30 },
        { cx: -40, cy: 8, x: 15, y: 15 },
        { cx: 12, cy: 60, x: 25, y: 25 },
      ],
    });

    const extent = opGeometricExtent(op);

    expect(extent.x0).toBe(-40);
    expect(extent.y0).toBe(-30);
    expect(extent.x1).toBe(25);
    expect(extent.y1).toBe(60);
  });

  it('halves lineWidth into halfWidth for a path op', () => {
    const op = pathOp({ lineWidth: 7 });

    expect(opGeometricExtent(op).halfWidth).toBe(3.5);
  });
});
