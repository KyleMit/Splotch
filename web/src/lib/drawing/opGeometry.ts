// An op's bare geometry: its user-space extent, the pad that covers its stroke
// half-width and AA bleed, and the painter that lays that geometry down with a
// caller-supplied paint. Depends only on the op types, so both the op renderer
// (strokeOps.ts) and the crayon pass buffer (crayonPassBuffer.ts) can share it
// without either importing the other.

import type { DotOp, PathOp } from './strokeOps';

// Stroke or dot the op's bare geometry onto a target using `paint` as the
// fill/stroke style — a solid colour for a normal op, the sheet pattern for a
// magic one. `widthScale` shrinks a path op's line width / a dot's radius for a
// crayon density pass (1 = the op's full size).
export function paintOpShape(
  target: CanvasRenderingContext2D,
  op: DotOp | PathOp,
  paint: string | CanvasPattern,
  widthScale = 1
) {
  if (op.kind === 'dot') {
    target.fillStyle = paint;
    target.beginPath();
    target.arc(op.x, op.y, op.radius * widthScale, 0, Math.PI * 2);
    target.fill();
  } else {
    target.strokeStyle = paint;
    target.lineWidth = op.lineWidth * widthScale;
    target.beginPath();
    target.moveTo(op.startX, op.startY);
    for (const s of op.segs) {
      target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
}

// AA bleed pad in paper px around an op's geometric bounds. It keeps the
// crayon flush stamp inside the dirty rect used by its pass buffer.
export const AA_PAD_PX = 2;

// An op's raw user-space geometric extent (no padding): a dot's point, a path's
// min/max over the start point and every seg's control and end points.
// `halfWidth` is the op's stroke half-width — the one per-kind number each
// caller scales before adding AA_PAD_PX.
export function opGeometricExtent(op: DotOp | PathOp): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  halfWidth: number;
} {
  if (op.kind === 'dot') {
    return { x0: op.x, y0: op.y, x1: op.x, y1: op.y, halfWidth: op.radius };
  }
  let x0 = op.startX;
  let y0 = op.startY;
  let x1 = op.startX;
  let y1 = op.startY;
  for (const s of op.segs) {
    x0 = Math.min(x0, s.cx, s.x);
    y0 = Math.min(y0, s.cy, s.y);
    x1 = Math.max(x1, s.cx, s.x);
    y1 = Math.max(y1, s.cy, s.y);
  }
  return { x0, y0, x1, y1, halfWidth: op.lineWidth / 2 };
}

// The op's user-space bounding box plus the pad that covers its stroke
// half-width and AA bleed. Fed straight into unionCrayonBounds to grow a pass
// buffer's dirty region.
// EXPERIMENT (exp/crayon-i9-hygiene): a crayon op's bounds are computed three
// times per tile visit (intersection test, undo capture, pass-buffer rect) on
// identical geometry — a one-entry identity memo collapses the repeats. Ops
// are immutable once first rendered, so identity implies identical bounds.
let lastBoundsOp: DotOp | PathOp | null = null;
let lastBounds: { x0: number; y0: number; x1: number; y1: number; pad: number } | null = null;

export function opPaddedUserBounds(op: DotOp | PathOp): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pad: number;
} {
  if (op === lastBoundsOp && lastBounds) return lastBounds;
  const { x0, y0, x1, y1, halfWidth } = opGeometricExtent(op);
  lastBoundsOp = op;
  lastBounds = { x0, y0, x1, y1, pad: halfWidth + AA_PAD_PX };
  return lastBounds;
}
