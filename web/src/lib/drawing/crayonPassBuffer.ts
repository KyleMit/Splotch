// The crayon deposition pass's lifecycle: accumulate a pass's ink on a buffer,
// stamp it onto a target as one subtractive glaze, and — for the live canvas —
// mirror it in paper space so a closing pass can be captured as prerendered
// pixels ('crayonPassRaster'). strokeOps.ts owns the op vocabulary and
// dispatches crayon ops here; crayonBrush.ts owns the paint source (the tooth
// pattern and the mix strength) this module deposits.

import {
  crayonPassCount,
  crayonPassWidthScale,
  crayonPatternFor,
  getCrayonMix,
} from './crayonBrush';
import { opPaddedUserBounds, paintOpShape } from './opGeometry';
import type { StrokeOp } from './strokeOps';

// Lay a crayon op down as textured wax: one pass per density band (widest first),
// each filled with the paper-tooth pattern for the op's colour + seed. Opaque
// where wax deposits, transparent in the tooth pits — so overlapping same-colour
// strokes build up coverage without shifting hue (ADR-0065). No-op until the
// tooth tile is buildable (a DOM canvas exists), matching the magic sheet's
// decode-pending skip.
function paintCrayon(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
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
// One buffer per target context. For fold/export surfaces (the paper raster,
// exports) it is an offscreen canvas allocated on demand (WeakMap — GC'd with
// its target) — since closed passes travel as prerendered 'crayonPassRaster'
// ops, these buffers only ever see the OPEN pass's raw ops (a mid-stroke
// export/repaint) or a command on the mix-0/fallback legacy path. For the
// LIVE canvas the engine registers its overlay elements as the buffer: ops
// paint into BOTH a darken-blended bottom layer and a (1-m)-opacity top layer
// (the `mirror`), whose CSS compositing reproduces the two-blit stamp exactly
// — the open pass previews its final mixed pixels with no snap at pass close.
interface CrayonPassBuffer {
  ctx: CanvasRenderingContext2D;
  mirror: CanvasRenderingContext2D | null;
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
let liveTarget: CanvasRenderingContext2D | null = null;
let liveBuffer: CrayonPassBuffer | null = null;

// The engine points the live canvas's buffer at its overlay canvases (null to
// unregister on teardown). The overlays are engine-sized alongside the canvas;
// `mirror` is the top preview layer, painted identically per op.
export function setLiveCrayonBuffer(
  target: CanvasRenderingContext2D | null,
  buffer: CanvasRenderingContext2D | null,
  mirror: CanvasRenderingContext2D | null = null
) {
  liveTarget = buffer ? target : null;
  liveBuffer = buffer ? { ctx: buffer, mirror, dirty: false, bounds: null } : null;
  if (!buffer) {
    livePaperBuffer = null;
    // A torn-down engine has no paper size either; resizeCanvas re-declares it
    // via setCrayonPaperSpace before any crayon op can paint on the next mount,
    // so zeroing here is a no-op for production and a clean slate for tests.
    livePaperSide = 0;
  }
}

// --- Live paper-space pass accumulation --------------------------------------
//
// Alongside the screen-space overlay preview, every live crayon op also paints
// into a PAPER-SPACE buffer (identity transform — ops are recorded in paper
// coordinates). At pass close the engine crops this buffer's dirty rect into a
// standalone raster (closeLiveCrayonPass) that becomes the pass's
// 'crayonPassRaster' op — the pixels the commit fold will stamp, captured from
// the one live render instead of re-rendered. Sized like the paper (the
// max(w,h) square, ensurePaperCovers), so off-viewport ink lands exactly where
// the fold's own paper-space re-render used to put it, including the same
// paper-square crop of rotation-locked margin ink (ADR-0066/0050). Allocated
// lazily on the first crayon op — pen-only sessions never pay the raster.
let livePaperBuffer: CrayonPassBuffer | null = null;
let livePaperSide = 0;

// The engine declares the paper's current square side (resizeCanvas). Growth is
// picked up lazily at the next crayon paint; the wipe a grow implies is
// repaired by the resize repaint replaying the open pass's ops.
export function setCrayonPaperSpace(side: number) {
  livePaperSide = side;
}

function livePaperBufferFor(): CrayonPassBuffer | null {
  if (livePaperSide <= 0) return null;
  if (!livePaperBuffer) {
    const c = document.createElement('canvas');
    c.width = livePaperSide;
    c.height = livePaperSide;
    const g = c.getContext('2d');
    if (!g) return null;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    livePaperBuffer = { ctx: g, mirror: null, dirty: false, bounds: null };
  } else if (
    livePaperBuffer.ctx.canvas.width < livePaperSide ||
    livePaperBuffer.ctx.canvas.height < livePaperSide
  ) {
    livePaperBuffer.ctx.canvas.width = livePaperSide;
    livePaperBuffer.ctx.canvas.height = livePaperSide;
    livePaperBuffer.ctx.lineCap = 'round';
    livePaperBuffer.ctx.lineJoin = 'round';
    livePaperBuffer.dirty = false;
    livePaperBuffer.bounds = null;
  }
  return livePaperBuffer;
}

// Whether the live canvas currently holds an open (unstamped) crayon pass.
// The engine checks this before a NON-crayon ink op (eraser, magic, pen — a
// mid-gesture brush switch can interleave them into the same stroke group)
// and closes the pass first: the pass raster is cropped from the paper-space
// accumulation, which never sees foreign ops, so a pass must never span one
// (see replaceOpenCrayonPassOps' boundary guard).
export function hasOpenLiveCrayonPass(): boolean {
  return !!(liveBuffer?.dirty || livePaperBuffer?.dirty);
}

// A canvas clear wipes the open pass with everything else: drop the live
// overlays' buffered ink and the paper-space accumulation, so a stroke
// straddling the clear (drag-to-clear finishing under a drawing finger) closes
// its pass from post-clear ink only — matching resetActiveCommandForClear,
// which drops the same ops from the command.
export function resetLiveCrayonPass() {
  if (liveBuffer) clearCrayonBounds(liveBuffer);
  if (livePaperBuffer) clearCrayonBounds(livePaperBuffer);
}

// Crop the open pass's paper-space pixels into a standalone raster and clear
// the accumulation buffer. Null when nothing accumulated (mix 0 paints direct,
// or the pass drew nothing) — the caller then falls back to keeping the raw
// ops and recording a plain 'crayonFlush'. The buffer is cleared on EVERY
// close, success or not: a stale dirty region bleeding into the next pass's
// crop would stamp this pass's ink twice.
export function closeLiveCrayonPass(): Extract<StrokeOp, { kind: 'crayonPassRaster' }> | null {
  const pb = livePaperBuffer;
  if (!pb || !pb.dirty || !pb.bounds) return null;
  const b = pb.bounds;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) {
    clearCrayonBounds(pb);
    return null;
  }
  g.drawImage(pb.ctx.canvas, b.x0, b.y0, w, h, 0, 0, w, h);
  clearCrayonBounds(pb);
  return { kind: 'crayonPassRaster', canvas: c, x: b.x0, y: b.y0, mix: getCrayonMix() };
}

function crayonBufferFor(target: CanvasRenderingContext2D): CrayonPassBuffer {
  if (target === liveTarget && liveBuffer) return liveBuffer;
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
    buf = { ctx: g, mirror: null, dirty: false, bounds: null };
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
  if (target === liveTarget && liveBuffer) return liveBuffer;
  return bufferByTarget.get(target) ?? null;
}

// Grow the buffer's device-px bounds by an op's user-space bbox, mapped through
// the transform the op was painted with. Conservative: quadratic/cubic control
// points bound the curve's hull, the pad covers the stroke's half-width plus AA
// bleed, and a transformed rect unions its mapped corners.
function unionCrayonBounds(
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
  if (x1 <= x0 || y1 <= y0) return;
  const b = buf.bounds;
  if (!b) buf.bounds = { x0, y0, x1, y1 };
  else {
    b.x0 = Math.min(b.x0, x0);
    b.y0 = Math.min(b.y0, y0);
    b.x1 = Math.max(b.x1, x1);
    b.y1 = Math.max(b.y1, y1);
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
}

export function stampSubtractiveGlaze(
  target: CanvasRenderingContext2D,
  mix: number,
  blit: () => void
) {
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

// A 'clear' op's crayon side effects, without the pixel wipe: drop the
// target's open pass and (for the live canvas) the paper-space accumulation.
// Exported so undoHistory's fold can honor a clear on a paper it knows is
// already blank — skipping clearAllOf skips materializing a fresh paper's
// lazily-allocated backing store inside the pointerup hitch path.
export function resetCrayonStateForClear(target: CanvasRenderingContext2D) {
  dropCrayonBuffer(target);
  if (target === liveTarget && livePaperBuffer) clearCrayonBounds(livePaperBuffer);
}

// Discard the target's open pass without stamping — a 'clear' wipes everything,
// open passes included.
function dropCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  clearCrayonBounds(buf);
}

// A repaint that replays the open pass's ops (repaintAll on a mid-stroke
// resize, or undo beneath a live stroke) rebuilds the live accumulation from
// scratch, so reset it first. The pattern deposit's replay happens to be
// idempotent, but no future deposit is required to be (ADR-0068) — replaying
// over existing accumulation would double-composite any fractional-alpha ink.
export function resetLiveCrayonForReplay(target: CanvasRenderingContext2D) {
  if (target === liveTarget) resetLiveCrayonPass();
}

// Accumulate a crayon ink op into the target's open pass buffer (see the
// pass-buffer notes above). Paints into the buffer through the target's own
// transform, grows the buffer's dirty region by the op's bounds, and — for the
// live target — mirrors the paint into the paper-space buffer so the pass can
// close into a 'crayonPassRaster'.
export function renderCrayonOp(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
  // Zero mix = the pre-mixing pipeline exactly: paint the target directly
  // (opaque wax, no buffer, no stamp) — the dev harness's A/B baseline and a
  // cheap escape hatch. Flushes become no-ops on a clean buffer.
  if (getCrayonMix() === 0) {
    paintCrayon(target, op);
    return;
  }
  const buf = crayonBufferFor(target);
  let matrix: DOMMatrix | null = null;
  if (typeof target.getTransform === 'function') {
    matrix = target.getTransform();
    buf.ctx.setTransform(matrix);
    buf.mirror?.setTransform(matrix);
  }
  paintCrayon(buf.ctx, op);
  if (buf.mirror) paintCrayon(buf.mirror, op);
  buf.dirty = true;
  const bounds = opPaddedUserBounds(op);
  unionCrayonBounds(buf, matrix, bounds);
  // The live stroke also accumulates in paper space, so the pass can close
  // into a 'crayonPassRaster' instead of leaving ops for the fold to
  // re-render (see the live paper-space notes above). Identity transform:
  // op coordinates ARE paper coordinates.
  if (target === liveTarget) {
    const pb = livePaperBufferFor();
    if (pb) {
      pb.ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintCrayon(pb.ctx, op);
      pb.dirty = true;
      unionCrayonBounds(pb, null, bounds);
    }
  }
}
