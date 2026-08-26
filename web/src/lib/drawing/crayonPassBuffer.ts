// The crayon deposition pass's lifecycle: accumulate a pass's ink on a buffer
// and stamp it onto a target as one subtractive glaze. strokeOps.ts owns the op
// vocabulary and dispatches crayon ops here; crayonBrush.ts owns the paint
// source (the tooth pattern and the mix strength) this module deposits.

import {
  crayonPassCount,
  crayonPassWidthScale,
  crayonPatternFor,
  getCrayonMix,
} from './crayonBrush';
import { opPaddedUserBounds, paintOpShape } from './opGeometry';
import type { DotOp, PathOp } from './strokeOps';

// Lay a crayon op down as textured wax: one pass per density band (widest first),
// each filled with the paper-tooth pattern for the op's colour + seed. Opaque
// where wax deposits, transparent in the tooth pits — so overlapping same-colour
// strokes build up coverage without shifting hue (ADR-0065). No-op until the
// tooth tile is buildable (a DOM canvas exists), matching the magic sheet's
// decode-pending skip.
function paintCrayon(target: CanvasRenderingContext2D, op: DotOp | PathOp) {
  const seed = op.seed ?? 0;
  const passCount = crayonPassCount();
  target.globalCompositeOperation = 'source-over';
  for (let i = 0; i < passCount; i++) {
    const pattern = crayonPatternFor(target, op.color, seed, i);
    if (!pattern) continue;
    paintOpShape(target, op, pattern, crayonPassWidthScale(i));
  }
}

// --- Crayon pass buffer ------------------------------------------------------
//
// A deposition pass accumulates on a buffer at FULL opacity (overlapping
// per-frame ops stay idempotent there — binary tooth, same rgb), then one
// 'crayonFlush' stamps the whole buffer onto the target as a SUBTRACTIVE
// mix, in two blits with no readback:
//
//   1. 'darken', alpha 1        → covered ink becomes min(S,D); blank paper S
//   2. 'source-over', alpha 1-m → out = (1-m)·S + m·(step 1)
//
// Net per covered pixel: out = (1-m)·S + m·min(S,D). The per-channel min is
// the shared reflectance of the two pigments — the light both let through —
// so blue over yellow keeps its full green channel while its blue channel
// drops toward the yellow's, and the crossing genuinely reads GREEN (an rgb
// lerp goes grey, and a multiply glaze both muted the shared channels and
// darkened same-colour overdraw). min's fixed point is what makes a strong
// mix safe: min(c,c)=c, so a same-colour pass reproduces its own pixels
// EXACTLY — constant-hue buildup is preserved at any mix strength. Over blank
// paper the two steps collapse to exactly S: fully opaque, exact-colour wax.
// Mixing ONCE per pass is the crux: any per-op mix would compound across the
// dozens of overlapping per-frame ops and cancel itself toward pure crayon
// colour in the interior.
//
// One buffer per target context. Tiled live surfaces register their paired
// bottom/top preview canvases; export surfaces receive an offscreen buffer on
// demand. The `mirror` reproduces the two-blit stamp through CSS compositing,
// so the open pass previews its final mixed pixels with no snap at pass close.
interface CrayonPassBuffer {
  ctx: CanvasRenderingContext2D;
  mirror: CanvasRenderingContext2D | null;
  // EXPERIMENT (exp/crayon-i4-single-plane): snapshot of the target's pixels
  // at pass open, so the single preview plane can show the exact premixed
  // glaze without any blend-mode compositing.
  under: CanvasRenderingContext2D | null;
  dirty: boolean;
  // Device-px bounding box of the open pass's ink, so the stamp and the
  // post-stamp clear touch only the pass-sized rect — a flush stays
  // proportional to the pass, not the canvas.
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

// Intentionally has no reset seam: a WeakMap keyed by each target's own context
// self-cleans per key — a fresh target/mount gets a fresh entry, and the old
// key+value are GC'd once the old context is unreachable. Nothing to null out.
const bufferByTarget = new WeakMap<CanvasRenderingContext2D, CrayonPassBuffer>();

export function setCrayonBufferForTarget(
  target: CanvasRenderingContext2D,
  buffer: CanvasRenderingContext2D,
  mirror: CanvasRenderingContext2D
) {
  buffer.canvas.hidden = true;
  mirror.canvas.hidden = true;
  bufferByTarget.set(target, { ctx: buffer, mirror, under: null, dirty: false, bounds: null });
}

function crayonBufferFor(target: CanvasRenderingContext2D): CrayonPassBuffer {
  let buf = bufferByTarget.get(target);
  const w = target.canvas.width;
  const h = target.canvas.height;
  if (!buf) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    buf = { ctx: g, mirror: null, under: null, dirty: false, bounds: null };
    bufferByTarget.set(target, buf);
  } else if (buf.ctx.canvas.width !== w || buf.ctx.canvas.height !== h) {
    buf.ctx.canvas.width = w;
    buf.ctx.canvas.height = h;
    buf.ctx.lineCap = 'round';
    buf.ctx.lineJoin = 'round';
    buf.dirty = false;
    buf.bounds = null;
  }
  return buf;
}

function existingBufferFor(target: CanvasRenderingContext2D): CrayonPassBuffer | null {
  return bufferByTarget.get(target) ?? null;
}

export function crayonBufferIsDirty(target: CanvasRenderingContext2D) {
  return existingBufferFor(target)?.dirty === true;
}

// Grow the buffer's device-px bounds by an op's user-space bbox, mapped through
// the transform the op was painted with. Conservative: quadratic/cubic control
// points bound the curve's hull, the pad covers the stroke's half-width plus AA
// bleed, and a transformed rect unions its mapped corners.
// The op's user-space box mapped into device pixels and clamped to the buffer,
// or null when it falls outside. Shared by the bounds union and the mirror blit
// so the two can never disagree about which pixels an op touched.
function deviceRectFor(
  buf: CrayonPassBuffer,
  matrix: DOMMatrix | null,
  { x0, y0, x1, y1, pad }: { x0: number; y0: number; x1: number; y1: number; pad: number }
) {
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  if (matrix && !matrix.isIdentity) {
    const p1 = matrix.transformPoint({ x: x0, y: y0 });
    const p2 = matrix.transformPoint({ x: x1, y: y0 });
    const p3 = matrix.transformPoint({ x: x0, y: y1 });
    const p4 = matrix.transformPoint({ x: x1, y: y1 });
    x0 = Math.min(p1.x, p2.x, p3.x, p4.x);
    y0 = Math.min(p1.y, p2.y, p3.y, p4.y);
    x1 = Math.max(p1.x, p2.x, p3.x, p4.x);
    y1 = Math.max(p1.y, p2.y, p3.y, p4.y);
  }
  const w = buf.ctx.canvas.width;
  const h = buf.ctx.canvas.height;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

function unionCrayonBounds(
  buf: CrayonPassBuffer,
  rect: { x0: number; y0: number; x1: number; y1: number } | null
) {
  if (!rect) return;
  const b = buf.bounds;
  if (!b) buf.bounds = { ...rect };
  else {
    b.x0 = Math.min(b.x0, rect.x0);
    b.y0 = Math.min(b.y0, rect.y0);
    b.x1 = Math.max(b.x1, rect.x1);
    b.y1 = Math.max(b.y1, rect.y1);
  }
}

function clearCrayonBounds(buf: CrayonPassBuffer) {
  const b = buf.bounds;
  if (b) {
    for (const g of [buf.ctx, buf.mirror]) {
      if (!g) continue;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      g.restore();
    }
  }
  buf.bounds = null;
  buf.dirty = false;
  buf.ctx.canvas.hidden = true;
  if (buf.mirror) buf.mirror.canvas.hidden = true;
}

function stampSubtractiveGlaze(target: CanvasRenderingContext2D, mix: number, blit: () => void) {
  target.globalCompositeOperation = 'darken';
  target.globalAlpha = 1;
  blit();
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1 - mix;
  blit();
  target.globalAlpha = 1;
}

// Stamp the target's open pass (if any) as the two-blit subtractive glaze (see
// the pass-buffer notes above) and clear the buffer — all restricted to the
// pass's device-px bounds. Buffer and target share backing dimensions, and ops
// were painted into the buffer through the target's own transform, so the
// blits are 1:1 rect copies in device space.
export function flushCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  const b = buf.bounds;
  if (b) {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    stampSubtractiveGlaze(target, getCrayonMix(), () => {
      target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);
    });
    target.restore();
  }
  clearCrayonBounds(buf);
}

// A 'clear' op's crayon side effects, without the pixel wipe.
export function resetCrayonStateForClear(target: CanvasRenderingContext2D) {
  dropCrayonBuffer(target);
}

// Discard the target's open pass without stamping — a 'clear' wipes everything,
// open passes included.
function dropCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  clearCrayonBounds(buf);
}

// Accumulate a crayon ink op into the target's open pass buffer (see the
// pass-buffer notes above). It paints through the target's own transform and
// grows the buffer's dirty region by the op's bounds.
export function renderCrayonOp(target: CanvasRenderingContext2D, op: DotOp | PathOp) {
  // Zero mix = the pre-mixing pipeline exactly: paint the target directly
  // (opaque wax, no buffer, no stamp) — the dev harness's A/B baseline and a
  // cheap escape hatch. Flushes become no-ops on a clean buffer.
  if (getCrayonMix() === 0) {
    paintCrayon(target, op);
    return;
  }
  // EXPERIMENT (exp/crayon-i4-single-plane): the bottom plane is pure hidden
  // storage; the top plane (CSS blend normal, opacity 1) is the ONLY
  // composited preview, and it shows the exact premixed glaze: under-ink
  // restored from a pass-open snapshot, then the two-blit stamp — the same
  // pixels the flush will bake into the tile.
  const buf = crayonBufferFor(target);
  if (buf.mirror) buf.mirror.canvas.hidden = false;
  const matrix = target.getTransform();
  buf.ctx.setTransform(matrix);
  if (!buf.dirty && buf.mirror) captureUnderSnapshot(buf, target);
  paintCrayon(buf.ctx, op);
  buf.dirty = true;
  const rect = deviceRectFor(buf, matrix, opPaddedUserBounds(op));
  if (buf.mirror && rect) {
    const width = rect.x1 - rect.x0;
    const height = rect.y1 - rect.y0;
    const preview = buf.mirror;
    preview.save();
    preview.setTransform(1, 0, 0, 1, 0, 0);
    preview.globalCompositeOperation = 'source-over';
    preview.clearRect(rect.x0, rect.y0, width, height);
    if (buf.under) {
      preview.drawImage(
        buf.under.canvas,
        rect.x0,
        rect.y0,
        width,
        height,
        rect.x0,
        rect.y0,
        width,
        height
      );
    }
    stampSubtractiveGlaze(preview, getCrayonMix(), () => {
      preview.drawImage(
        buf.ctx.canvas,
        rect.x0,
        rect.y0,
        width,
        height,
        rect.x0,
        rect.y0,
        width,
        height
      );
    });
    preview.restore();
  }
  unionCrayonBounds(buf, rect);
}

// EXPERIMENT (exp/crayon-i4-single-plane): copy the target's current pixels
// into the pass's under snapshot at pass open.
function captureUnderSnapshot(buf: CrayonPassBuffer, target: CanvasRenderingContext2D) {
  const w = target.canvas.width;
  const h = target.canvas.height;
  if (!buf.under) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    buf.under = c.getContext('2d')!;
  } else if (buf.under.canvas.width !== w || buf.under.canvas.height !== h) {
    buf.under.canvas.width = w;
    buf.under.canvas.height = h;
  } else {
    buf.under.clearRect(0, 0, w, h);
  }
  buf.under.drawImage(target.canvas, 0, 0);
}
