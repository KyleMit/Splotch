// Per-stroke-group compositing for the crayon (ADR-0065).
//
// The crayon must be idempotent WITHIN a stroke but accumulate ACROSS strokes:
// dragging one stroke — even slowly, so its per-frame ops overlap heavily —
// lays down exactly ONE layer of tooth (so the paper grain stays visible and
// there's headroom left to build on), while a SECOND same-colour stroke over it
// deposits another layer that fills the tooth and darkens toward solid at
// constant hue. Plain per-op source-over can't tell "my own stroke overlapping
// itself" from "a previous stroke", so a slow stroke self-saturates and leaves
// nothing to build on. So each stroke group (= one undo command) is composited
// against a coverage mask: an op deposits tooth only where the group hasn't
// already painted. Cross-group buildup then falls out of ordinary source-over on
// the target.
//
// This runs identically live and on every replay (undo/resize/export) — the
// callers bracket each command's ops with beginCrayonGroup(), and the mask +
// tooth are derived only from stored op data + the shipped tooth, so the
// bit-identical-replay invariant holds.

import { crayonPatternFor } from './crayonTexture';
import type { StrokeOp } from './strokeOps';

type CrayonOp = Extract<StrokeOp, { kind: 'dot' | 'path' }>;

interface GroupScratch {
  // Opaque coverage the current group has already painted (device space).
  cov: HTMLCanvasElement;
  covCtx: CanvasRenderingContext2D;
  // Working buffer for one op's new-coverage-masked-by-tooth deposit.
  dab: HTMLCanvasElement;
  dabCtx: CanvasRenderingContext2D;
  // Reset lazily on the first crayon op of a group, so a group with no crayon
  // ops never pays a full-canvas clear.
  needsReset: boolean;
}

const scratchByTarget = new WeakMap<CanvasRenderingContext2D, GroupScratch>();

function scratchFor(target: CanvasRenderingContext2D): GroupScratch {
  const w = target.canvas.width;
  const h = target.canvas.height;
  let s = scratchByTarget.get(target);
  if (!s || s.cov.width !== w || s.cov.height !== h) {
    const cov = document.createElement('canvas');
    cov.width = w;
    cov.height = h;
    const dab = document.createElement('canvas');
    dab.width = w;
    dab.height = h;
    s = {
      cov,
      covCtx: cov.getContext('2d')!,
      dab,
      dabCtx: dab.getContext('2d')!,
      needsReset: true,
    };
    for (const c of [s.covCtx, s.dabCtx]) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    scratchByTarget.set(target, s);
  }
  return s;
}

// Start a new crayon stroke group on `target`. Cheap — it only arms a lazy reset
// of the coverage mask, done on the group's first crayon op.
export function beginCrayonGroup(target: CanvasRenderingContext2D): void {
  scratchFor(target).needsReset = true;
}

function clearDevice(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.restore();
}

// Stroke/fill an op's bare geometry in the CURRENT transform with a paint — a
// solid colour to build opaque coverage, or the tooth pattern to lay the wax.
function paintOpSolid(ctx: CanvasRenderingContext2D, op: CrayonOp, paint: string | CanvasPattern) {
  if (op.kind === 'dot') {
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = paint;
    ctx.lineWidth = op.lineWidth;
    ctx.beginPath();
    ctx.moveTo(op.startX, op.startY);
    for (const seg of op.segs) {
      if (seg.c2x !== undefined) ctx.bezierCurveTo(seg.cx, seg.cy, seg.c2x, seg.c2y!, seg.x, seg.y);
      else ctx.quadraticCurveTo(seg.cx, seg.cy, seg.x, seg.y);
    }
    ctx.stroke();
  }
}

// Device-space bounding rect of the op after the target's current transform,
// clamped to the canvas — computed straight from the op fields into a shared
// scratch rect (no per-op allocation on the draw hot path). Returns false if the
// op lands fully off-canvas. The user-space box is padded for the line width and
// includes the curve control points (a safe over-estimate that only grows it).
const scratchRect = { x: 0, y: 0, w: 0, h: 0 };

function deviceRect(op: CrayonOp, m: DOMMatrix, w: number, h: number): boolean {
  let ux0: number;
  let uy0: number;
  let ux1: number;
  let uy1: number;
  if (op.kind === 'dot') {
    ux0 = op.x - op.radius;
    uy0 = op.y - op.radius;
    ux1 = op.x + op.radius;
    uy1 = op.y + op.radius;
  } else {
    ux0 = ux1 = op.startX;
    uy0 = uy1 = op.startY;
    for (const s of op.segs) {
      for (let k = 0; k < (s.c2x !== undefined ? 3 : 2); k++) {
        const x = k === 0 ? s.cx : k === 1 ? s.x : s.c2x!;
        const y = k === 0 ? s.cy : k === 1 ? s.y : s.c2y!;
        if (x < ux0) ux0 = x;
        if (x > ux1) ux1 = x;
        if (y < uy0) uy0 = y;
        if (y > uy1) uy1 = y;
      }
    }
    const pad = op.lineWidth / 2 + 1;
    ux0 -= pad;
    uy0 -= pad;
    ux1 += pad;
    uy1 += pad;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < 4; c++) {
    const ux = c & 1 ? ux1 : ux0;
    const uy = c & 2 ? uy1 : uy0;
    const dx = m.a * ux + m.c * uy + m.e;
    const dy = m.b * ux + m.d * uy + m.f;
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy;
    if (dy > maxY) maxY = dy;
  }
  const x = Math.max(0, Math.floor(minX) - 1);
  const y = Math.max(0, Math.floor(minY) - 1);
  const x1 = Math.min(w, Math.ceil(maxX) + 1);
  const y1 = Math.min(h, Math.ceil(maxY) + 1);
  if (x1 <= x || y1 <= y) return false;
  scratchRect.x = x;
  scratchRect.y = y;
  scratchRect.w = x1 - x;
  scratchRect.h = y1 - y;
  return true;
}

// Deposit one crayon op onto `target`: tooth-textured `op.color`, but only where
// this stroke group hasn't already painted, so the group builds up to just one
// tooth layer no matter how much it overlaps itself. Every step is bounded to the
// op's device rect (`r`) — the dab is cleared and composited per-rect rather than
// clipped — so the per-op cost stays proportional to the op, not the canvas.
export function paintCrayonOp(target: CanvasRenderingContext2D, op: CrayonOp): void {
  const s = scratchFor(target);
  if (s.needsReset) {
    clearDevice(s.covCtx, s.cov.width, s.cov.height);
    s.needsReset = false;
  }
  const m = target.getTransform();
  if (!deviceRect(op, m, target.canvas.width, target.canvas.height)) return;
  const r = scratchRect;
  const { dabCtx } = s;

  // 1. Clear this op's rect in the dab, then lay the tooth-textured colour over the
  //    whole op in the target's transform (crisp grain — imageSmoothing governs
  //    only the pattern sample). The pattern is anchored at the paper origin, so it
  //    aligns with the target's paper space. No clip needed: the clear and the
  //    composites below are all rect-bound, and only this rect is blitted out.
  dabCtx.setTransform(1, 0, 0, 1, 0, 0);
  dabCtx.globalCompositeOperation = 'source-over';
  dabCtx.clearRect(r.x, r.y, r.w, r.h);
  dabCtx.setTransform(m);
  dabCtx.imageSmoothingEnabled = false;
  paintOpSolid(dabCtx, op, crayonPatternFor(dabCtx, op.color) ?? op.color);

  // 2. Erase it back where the group already painted → tooth only on NEW coverage.
  dabCtx.setTransform(1, 0, 0, 1, 0, 0);
  dabCtx.globalCompositeOperation = 'destination-out';
  dabCtx.drawImage(s.cov, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);

  // 3. Lay the new tooth layer onto the target (source-over → cross-group buildup).
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'source-over';
  target.drawImage(s.dab, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  target.setTransform(m);

  // 4. Record this op's coverage into the group mask.
  s.covCtx.setTransform(m);
  s.covCtx.globalCompositeOperation = 'source-over';
  paintOpSolid(s.covCtx, op, '#ffffff');
  s.covCtx.setTransform(1, 0, 0, 1, 0, 0);
}
