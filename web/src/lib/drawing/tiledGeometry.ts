import { opPaddedUserBounds } from './opGeometry';
import type { StrokeOp } from './strokeOps';

export interface TileBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  paperLeft: number;
  paperTop: number;
  paperRight: number;
  paperBottom: number;
}

export function geometryIntersectsTile(
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>,
  tile: TileBounds
) {
  let left: number;
  let top: number;
  let right: number;
  let bottom: number;
  let padding: number;
  if (op.kind === 'dot') {
    left = right = op.x;
    top = bottom = op.y;
    padding = op.radius;
  } else {
    left = right = op.startX;
    top = bottom = op.startY;
    for (const segment of op.segs) {
      left = Math.min(left, segment.cx, segment.x);
      top = Math.min(top, segment.cy, segment.y);
      right = Math.max(right, segment.cx, segment.x);
      bottom = Math.max(bottom, segment.cy, segment.y);
    }
    padding = op.lineWidth / 2;
  }
  return (
    right + padding >= tile.paperLeft &&
    left - padding <= tile.paperRight &&
    bottom + padding >= tile.paperTop &&
    top - padding <= tile.paperBottom
  );
}

export function tilesIntersect(first: TileBounds, second: TileBounds) {
  return (
    first.paperRight >= second.paperLeft &&
    first.paperLeft <= second.paperRight &&
    first.paperBottom >= second.paperTop &&
    first.paperTop <= second.paperBottom
  );
}

export function opDeviceBounds(
  tile: TileBounds & { ctx: CanvasRenderingContext2D },
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
  const { x0, y0, x1, y1, pad } = opPaddedUserBounds(op);
  const matrix = tile.ctx.getTransform();
  const corners = [
    matrix.transformPoint({ x: x0 - pad, y: y0 - pad }),
    matrix.transformPoint({ x: x1 + pad, y: y0 - pad }),
    matrix.transformPoint({ x: x0 - pad, y: y1 + pad }),
    matrix.transformPoint({ x: x1 + pad, y: y1 + pad }),
  ];
  return {
    x0: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x)))),
    y0: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y)))),
    x1: Math.min(tile.width, Math.ceil(Math.max(...corners.map((point) => point.x)))),
    y1: Math.min(tile.height, Math.ceil(Math.max(...corners.map((point) => point.y)))),
  };
}
