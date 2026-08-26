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
  // EXPERIMENT (exp/crayon-i1-restamp): snapshot of the target's pixels at
  // pass open, so every per-op restamp can restore the under-ink before
  // re-applying the glaze — the stamp stays a pure function of
  // (buffer, under) per pixel and per-op re-stamping cannot compound.
  under: CanvasRenderingContext2D | null;
  // EXPERIMENT (exp/crayon-i20-idle-shadow): whether `under` still mirrors
  // the target. Refreshed by plain reads only (never blended into — i19's
  // fold deoptimized the canvas as a blit source), and refreshed at IDLE
  // after a stroke rather than inside a drawing frame whenever possible.
  underValid: boolean;
  // EXPERIMENT (exp/crayon-i16-virgin-fast-path): true while the open pass
  // sits on a tile that was blank at pass open — the glaze over blank paper
  // collapses to exactly the wax, so the restamp is clearRect + one blit and
  // the under snapshot is never taken.
  virgin: boolean;
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
  // EXPERIMENT (exp/crayon-i1-restamp): the composited preview planes are
  // never registered — every target gets a lazily created offscreen buffer
  // and the wax is restamped straight onto the target per op. The planes
  // stay hidden for the whole session.
  buffer.canvas.hidden = true;
  mirror.canvas.hidden = true;
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
    buf = {
      ctx: g,
      mirror: null,
      under: null,
      underValid: false,
      virgin: false,
      dirty: false,
      bounds: null,
    };
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

// EXPERIMENT (exp/crayon-i1-restamp): copy the target's current pixels into
// the pass's under snapshot at pass open, so restamps can restore them.
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
  buf.underValid = true;
}

// EXPERIMENT (exp/crayon-i20-idle-shadow): targets whose shadow went stale —
// refreshed together at idle so the composited-canvas read stays off the
// interaction frames. A pass opening before the refresh lands pays one
// synchronous read as the fallback.
const pendingShadowRefresh = new Set<CanvasRenderingContext2D>();

export function invalidateCrayonUnder(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf) return;
  buf.underValid = false;
  pendingShadowRefresh.add(target);
}

// A repaint clears the tiles and replays ops from scratch, so any open pass
// state describes pixels that no longer exist. Reset before replaying.
export function resetCrayonPassStateForRepaint(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (buf) {
    if (buf.dirty) clearCrayonBounds(buf);
    buf.underValid = false;
  }
  blankAtPassOpen.delete(target);
  pendingShadowRefresh.add(target);
}

export function refreshPendingCrayonShadows() {
  for (const target of pendingShadowRefresh) {
    const buf = existingBufferFor(target);
    // A hidden target is blank — the next pass takes the virgin path and
    // never reads the shadow, so skip the read entirely.
    if (buf && !buf.underValid && !buf.dirty && !target.canvas.hidden) {
      captureUnderSnapshot(buf, target);
    }
  }
  pendingShadowRefresh.clear();
}

// EXPERIMENT (exp/crayon-i1-restamp): restore the op's rect from the under
// snapshot, then re-apply the two-blit glaze from the wax buffer — the target
// always shows the exact pass-close pixels, with no composited preview plane.
function restampRect(
  target: CanvasRenderingContext2D,
  buf: CrayonPassBuffer,
  rect: { x0: number; y0: number; x1: number; y1: number }
) {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'source-over';
  target.clearRect(rect.x0, rect.y0, w, h);
  if (buf.virgin) {
    // Over blank paper the two-blit glaze collapses to exactly the wax
    // (see the pass-buffer notes: darken onto transparent yields S, then
    // S over S at any alpha is S) — one blit reproduces it byte-exactly.
    target.drawImage(buf.ctx.canvas, rect.x0, rect.y0, w, h, rect.x0, rect.y0, w, h);
  } else {
    if (buf.under) {
      target.drawImage(buf.under.canvas, rect.x0, rect.y0, w, h, rect.x0, rect.y0, w, h);
    }
    stampSubtractiveGlaze(target, getCrayonMix(), () => {
      target.drawImage(buf.ctx.canvas, rect.x0, rect.y0, w, h, rect.x0, rect.y0, w, h);
    });
  }
  target.restore();
}

// EXPERIMENT (exp/crayon-i16-virgin-fast-path): tiles the renderer knows were
// blank when a crayon op arrived — consumed at the next pass open.
const blankAtPassOpen = new WeakSet<CanvasRenderingContext2D>();

export function noteCrayonTargetBlank(target: CanvasRenderingContext2D) {
  blankAtPassOpen.add(target);
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
  // The target already holds the exact pass-close pixels — every op painted
  // (virgin) or restamped (non-virgin) them — so the flush only resets pass
  // state. The pass's wax made the shadow stale; queue an idle refresh.
  clearCrayonBounds(buf);
  buf.underValid = false;
  pendingShadowRefresh.add(target);
}

// A 'clear' op's crayon side effects, without the pixel wipe.
export function resetCrayonStateForClear(target: CanvasRenderingContext2D) {
  dropCrayonBuffer(target);
  const buf = existingBufferFor(target);
  if (buf) buf.underValid = false;
  pendingShadowRefresh.delete(target);
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
  const buf = crayonBufferFor(target);
  const matrix = target.getTransform();
  buf.ctx.setTransform(matrix);
  if (!buf.dirty) {
    // Pass open: a tile the renderer marked blank takes the virgin fast path
    // — no under snapshot, single-blit restamps. A non-virgin pass reads the
    // target only when the idle refresh has not already restored the shadow.
    buf.virgin = blankAtPassOpen.has(target);
    blankAtPassOpen.delete(target);
    if (!buf.virgin && !buf.underValid) captureUnderSnapshot(buf, target);
  }
  paintCrayon(buf.ctx, op);
  buf.dirty = true;
  const rect = deviceRectFor(buf, matrix, opPaddedUserBounds(op));
  if (rect) restampRect(target, buf, rect);
  unionCrayonBounds(buf, rect);
}
