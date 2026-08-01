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
  const { x0, y0, x1, y1, pad } = opPaddedUserBounds(op);
  return (
    x1 + pad >= tile.paperLeft &&
    x0 - pad <= tile.paperRight &&
    y1 + pad >= tile.paperTop &&
    y0 - pad <= tile.paperBottom
  );
}

export function tilesIntersect(first: TileBounds, second: TileBounds) {
  return (
    first.paperRight > second.paperLeft &&
    first.paperLeft < second.paperRight &&
    first.paperBottom > second.paperTop &&
    first.paperTop < second.paperBottom
  );
}

export function tileCssSpan(index: number, count: number, totalCssPx: number, deviceScale: number) {
  const start =
    index === 0 ? 0 : Math.floor((index * totalCssPx * deviceScale) / count) / deviceScale;
  const end =
    index === count - 1
      ? totalCssPx
      : Math.floor(((index + 1) * totalCssPx * deviceScale) / count) / deviceScale;
  return { start, size: end - start };
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
