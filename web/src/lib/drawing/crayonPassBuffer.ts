// The crayon deposition pass's lifecycle: accumulate a pass's ink on an
// offscreen buffer and keep the target itself showing the exact pass-close
// glaze after every op. strokeOps.ts owns the op vocabulary and dispatches
// crayon ops here; crayonBrush.ts owns the paint source (the tooth pattern and
// the mix strength) this module deposits.

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
// A deposition pass accumulates on an offscreen buffer at FULL opacity
// (overlapping per-frame ops stay idempotent there — binary tooth, same rgb),
// and mixes with the ink under it as ONE subtractive glaze, in two blits with
// no readback:
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
// WHERE the glaze lands is what the 2026-08-26 physical-iPad campaign changed
// (docs/scratchpad/perf/crayon-elimination-campaign-2026-08-26.md). The open
// pass used to live on two extra composited canvases per tile (a darken plane
// plus an opacity-lerp mirror) and the glaze was stamped once at pass close;
// those 32 planes were measured as crayon's ENTIRE lost-frame excess over pen
// (1.23% against 0.76% baseline; 0.6–0.9% for every zero-plane variant). Now
// every op RESTAMPS its own padded rect on the target: restore the pre-pass
// pixels from the under shadow, then re-apply the two-blit glaze from the
// buffer. A pixel's latest restamp is the same pure function of (final buffer,
// under) the old close-time stamp applied once — later ops can only repaint
// pixels inside their own padded rect, which is exactly the region they
// restamp — so per-op stamping cannot compound and the target always equals
// the pass-close pixels. The 'crayonFlush' op only resets pass state.
//
// Two measured constraints shape the under shadow:
//
//   * Reading a COMPOSITED live canvas mid-gesture forces a GPU pipeline sync;
//     per-op reads froze the page outright (97% of in-contact frame time
//     lost). The shadow is therefore captured from the target at most once
//     per invalidation, and the read is deferred to just after finger-lift
//     whenever a stroke made it stale.
//   * Blend operations applied INTO a canvas demote it as a blit source
//     (folding the glaze into the shadow offscreen measured 2.8% lost). The
//     shadow is only ever written by plain reads.
//
// One buffer per target context; every target gets a lazily created offscreen
// buffer. A pass opening on a BLANK tile takes the virgin fast path: no under
// shadow at all, and the restamp is clearRect + one blit of the buffer — over
// blank paper the two-blit glaze collapses to exactly the wax, so the fast
// path is byte-identical.
interface CrayonPassBuffer {
  ctx: CanvasRenderingContext2D;
  // Offscreen shadow of the target's pre-pass pixels, restored under the
  // glaze on every restamp.
  under: CanvasRenderingContext2D | null;
  // Whether `under` still mirrors the target. Foreign ink, eraser, undo,
  // clear, repaint, and a closed pass's own wax all invalidate it.
  underValid: boolean;
  // True while the open pass sits on a tile that was blank at pass open —
  // the single-blit fast path, no under shadow needed.
  virgin: boolean;
  dirty: boolean;
  // Device-px bounding box of the open pass's ink, so the post-pass buffer
  // clear touches only the pass-sized rect.
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

// Intentionally has no reset seam: a WeakMap keyed by each target's own context
// self-cleans per key — a fresh target/mount gets a fresh entry, and the old
// key+value are GC'd once the old context is unreachable. Nothing to null out.
const bufferByTarget = new WeakMap<CanvasRenderingContext2D, CrayonPassBuffer>();

// The tiled renderer's crayon preview planes are vestigial under the restamp
// architecture: they are kept hidden for the whole session and never receive
// a backing or a pixel. (Removing the elements themselves is tracked as a
// follow-up; this keeps the LiveSurface DOM contract unchanged.)
export function setCrayonBufferForTarget(
  target: CanvasRenderingContext2D,
  buffer: CanvasRenderingContext2D,
  mirror: CanvasRenderingContext2D
) {
  void target;
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
    buf.underValid = false;
  }
  return buf;
}

// Refresh the under shadow from the target — the one read of a composited
// canvas this architecture permits, and only when the shadow went stale (see
// the module notes on why reads are rationed).
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

// Targets whose shadow went stale — refreshed together shortly after
// finger-lift, so the composited-canvas read lands in between-stroke time. A
// pass opening before the refresh pays one synchronous read as the fallback.
const pendingShadowRefresh = new Set<CanvasRenderingContext2D>();

// Anything that changes the target's pixels outside this module's own stamps
// makes the under shadow stale.
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

// Restore the op's rect from the under shadow, then re-apply the two-blit
// glaze from the wax buffer — the target always shows the exact pass-close
// pixels. Rect sizes matter here: restamp cost was measured to scale with
// AREA per frame, so this must stay one op's padded rect, never a frame
// union or the pass bounds (2.6% and 2.2% lost respectively when tried).
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
    // (darken onto transparent yields S, then S over S at any alpha is S) —
    // one blit reproduces it byte-exactly.
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

// Tiles the renderer observed to be blank when a crayon op arrived — consumed
// at the next pass open to select the virgin fast path. The renderer notes
// blankness from tile visibility BEFORE it shows the tile for the op, which
// is the only moment blankness is knowable without reading pixels.
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
// or null when it falls outside. Shared by the bounds union and the restamp so
// the two can never disagree about which pixels an op touched.
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
    buf.ctx.save();
    buf.ctx.setTransform(1, 0, 0, 1, 0, 0);
    buf.ctx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    buf.ctx.restore();
  }
  buf.bounds = null;
  buf.dirty = false;
  buf.virgin = false;
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

// Close the target's open pass (if any). The target already holds the exact
// pass-close pixels — every op painted or restamped them — so this only
// resets pass state. The pass's own wax made the shadow stale; queue a
// post-lift refresh.
export function flushCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  clearCrayonBounds(buf);
  buf.underValid = false;
  pendingShadowRefresh.add(target);
}

// A 'clear' op's crayon side effects, without the pixel wipe. A cleared tile
// is blank, so the next pass goes virgin and needs no shadow — drop the
// pending refresh rather than reading a blank canvas.
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

// Deposit a crayon ink op: accumulate it on the pass buffer through the
// target's own transform, then restamp the op's rect so the target shows the
// exact pass-close pixels (see the pass-buffer notes above).
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
    // Pass open: a tile the renderer marked blank takes the virgin fast path.
    // A non-virgin pass reads the target only when the post-lift refresh has
    // not already restored the shadow.
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
