// The crayon deposition pass's lifecycle: accumulate a pass's ink on a buffer
// and mix it with the ink under it as ONE subtractive glaze. strokeOps.ts owns
// the op vocabulary and dispatches crayon ops here; crayonBrush.ts owns the
// paint source (the tooth pattern and the mix strength) this module deposits.

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
// per-frame ops stay idempotent there — binary tooth, same rgb) and mixes with
// the ink under it as ONE subtractive glaze, in two blits with no readback:
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
// WHERE the pass lives while it is open is a per-runtime decision (ADR-0147),
// like the op granularity in ADR-0146 and derived from the same compile-time
// signal — the engine configures it below, and the two shipping WebKit
// runtimes price the alternatives oppositely:
//
//   * 'restamp' (Safari / web): the pass buffer is offscreen and every op
//     restores its own padded rect from an offscreen "under" shadow, then
//     re-applies the two-blit glaze onto the normal ink tile — nothing extra
//     is composited while a child draws, and 'crayonFlush' only resets pass
//     state. The 2026-08-26 physical-iPad campaign measured the previous
//     composited preview planes as crayon's ENTIRE lost-frame excess over pen
//     on Safari (1.23% against pen's 0.76%; 0.77–0.97% under restamp).
//     A pixel's latest restamp is the same pure function of (final buffer,
//     under) the close-time stamp applied once — later ops only repaint
//     pixels inside their own padded rect, which is exactly the region they
//     restamp — so per-op stamping cannot compound.
//   * 'planes' (the Capacitor WKWebView): the ADR-0085 architecture — the
//     buffer IS the tile's bottom preview plane (mix-blend-mode: darken), a
//     top mirror plane at 1−mix opacity previews the exact glaze through CSS
//     compositing, and 'crayonFlush' stamps the buffer onto the tile at pass
//     close. The same day's A/B measured restamp REGRESSING the WKWebView
//     (1.76–2.12% against the plane pipeline's 1.19–1.39%, at merge caps 8
//     and 3 alike, and 4.4–5.5% at per-move granularity), so native keeps
//     the planes.
//
// Three constraints the campaign measured bound any rework of the restamp
// path:
//   1. Never READ a composited live canvas on the pointer hot path — per-op
//      reads froze the page (97% lost); the under shadow is read at most once
//      per invalidation, deferred to just after finger-lift.
//   2. Restamp cost scales with AREA per frame, not blit count — op-padded
//      rects only, never frame unions (2.62%) or pass bounds (2.18%).
//   3. Never apply blend operations INTO a canvas that hot-path blits read
//      from (folding the glaze into the shadow measured 2.8%) — the shadow is
//      only ever written by plain reads.
type CrayonDepositionMode = 'restamp' | 'planes';

// A dependency rather than a compile-time literal for the same reason as
// ADR-0146's granularity seam: vitest pins __IS_CAPACITOR__ true and would
// dead-code-eliminate the branch the web build ships, and both pipelines must
// stay testable. The engine configures it once at module evaluation; the
// default is the web pipeline so the module is usable without the engine
// (unit tests, the dev harness).
const pendingShadowRefresh = new Set<CanvasRenderingContext2D>();
let shadowRefreshScheduled = false;
let depositionMode: CrayonDepositionMode = 'restamp';

// Lets the scheduled shadow drain yield to an in-flight stroke. Defaults to
// "never active" so the module works without the engine (unit tests, the dev
// harness), where nothing races the drain.
let strokeActiveProbe: () => boolean = () => false;

export function configureCrayonDeposition(
  mode: CrayonDepositionMode,
  strokeActive: () => boolean = () => false
) {
  depositionMode = mode;
  strokeActiveProbe = strokeActive;
  // Reconfiguring the pipeline invalidates any drain scheduled under the old
  // one — its pending targets belong to the previous configuration's probe.
  pendingShadowRefresh.clear();
  shadowRefreshScheduled = false;
}

// Whether crayon ops mutate the normal ink tile directly (restamp) — the
// renderer uses this to decide tile visibility and plane backing allocation.
export function crayonDepositsOnTiles() {
  return depositionMode === 'restamp';
}

interface CrayonPassBuffer {
  ctx: CanvasRenderingContext2D;
  // 'planes' mode: the tile's top preview plane, kept a byte-identical mirror
  // of the buffer by copying each op's rect. Null in 'restamp' mode and for
  // offscreen targets (history base, export).
  mirror: CanvasRenderingContext2D | null;
  // 'restamp' mode: offscreen shadow of the target's pre-pass pixels,
  // restored under the glaze on every restamp.
  under: CanvasRenderingContext2D | null;
  // Whether `under` still mirrors the target. Foreign ink, eraser, undo,
  // clear, repaint, and a closed pass's own wax all invalidate it.
  underValid: boolean;
  // 'restamp' mode: true while the open pass sits on a tile that was blank at
  // pass open — the single-blit fast path, no under shadow needed.
  virgin: boolean;
  dirty: boolean;
  // Device-px bounding box of the open pass's ink, so the stamp and the
  // post-pass clear touch only the pass-sized rect.
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

// Intentionally has no reset seam: a WeakMap keyed by each target's own context
// self-cleans per key — a fresh target/mount gets a fresh entry, and the old
// key+value are GC'd once the old context is unreachable. Nothing to null out.
const bufferByTarget = new WeakMap<CanvasRenderingContext2D, CrayonPassBuffer>();

// 'planes' mode registers the tile's paired preview canvases as the pass
// buffer and its mirror; 'restamp' mode keeps the planes hidden all session
// and never gives them a backing — every target gets a lazily created
// offscreen buffer instead. (Removing the plane elements from the web DOM is
// a follow-up; keeping them registered-but-hidden leaves the LiveSurface
// contract identical across runtimes.)
export function setCrayonBufferForTarget(
  target: CanvasRenderingContext2D,
  buffer: CanvasRenderingContext2D,
  mirror: CanvasRenderingContext2D
) {
  buffer.canvas.hidden = true;
  mirror.canvas.hidden = true;
  if (depositionMode !== 'planes') return;
  bufferByTarget.set(target, {
    ctx: buffer,
    mirror,
    under: null,
    underValid: false,
    virgin: false,
    dirty: false,
    bounds: null,
  });
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
    buf.underValid = false;
  }
  return buf;
}

// Refresh the under shadow from the target — the one read of a composited
// canvas the restamp pipeline permits, and only when the shadow went stale.
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

// Targets whose shadow went stale — refreshed together two frames after the
// staling event, so the composited-canvas read lands off the interaction
// frames, whatever staled it: a stroke's own flush, foreign ink, an undo
// patch restore, or a repaint's tile clear. Every staling site routes through
// markShadowStale, which guarantees a scheduled drain — a pass opening before
// the drain pays one synchronous read as the fallback. Only the restamp
// pipeline feeds or reads this set.

function markShadowStale(target: CanvasRenderingContext2D) {
  if (depositionMode !== 'restamp') return;
  pendingShadowRefresh.add(target);
  scheduleShadowDrain();
}

function scheduleShadowDrain() {
  if (shadowRefreshScheduled) return;
  shadowRefreshScheduled = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      shadowRefreshScheduled = false;
      // A drain landing mid-stroke would pay the very in-contact read it
      // exists to defer, so it yields — but it must RE-ARM rather than
      // simply drop. A mid-stroke checkpoint flush schedules a drain; the
      // stroke's closing flush then finds one already scheduled and rides
      // it; that drain fires while the finger is still down and yields. If
      // yielding just cleared the flag, nothing would re-arm until the NEXT
      // stroke's first checkpoint — by which time that stroke's pass has
      // already opened on a synchronous whole-tile read, which is the whole
      // cost this machinery removes.
      if (strokeActiveProbe()) {
        if (pendingShadowRefresh.size > 0) scheduleShadowDrain();
        return;
      }
      refreshPendingCrayonShadows();
    });
  });
}

// Anything that changes the target's pixels outside this module's own stamps
// makes the under shadow stale.
export function invalidateCrayonUnder(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf) return;
  buf.underValid = false;
  markShadowStale(target);
}

function refreshPendingCrayonShadows() {
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
// AREA per frame, so this must stay one op's padded rect (see the module
// notes).
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

// The renderer's one-call seam for a crayon ink op's tile visibility: plane
// deposition previews on the composited planes, so the tile must stay as it
// was (returns false); restamp deposition mutates the tile directly, so it is
// shown like any ink op — and a still-hidden tile is blank
// (prepareTileForMutation has run), which is what opens the virgin fast path.
export function crayonOpShowsTile(target: CanvasRenderingContext2D, targetHidden: boolean) {
  if (depositionMode !== 'restamp') return false;
  if (targetHidden) blankAtPassOpen.add(target);
  return true;
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
// or null when it falls outside. Shared by the bounds union, the mirror blit,
// and the restamp, so they can never disagree about which pixels an op
// touched.
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
  buf.virgin = false;
  if (depositionMode === 'planes') {
    buf.ctx.canvas.hidden = true;
    if (buf.mirror) buf.mirror.canvas.hidden = true;
  }
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

// Close the target's open pass (if any).
//
// 'planes': stamp the buffered pass onto the target as the two-blit glaze —
// buffer and target share backing dimensions and ops were painted through the
// target's own transform, so the blits are 1:1 rect copies in device space.
// 'restamp': the target already holds the exact pass-close pixels — every op
// painted or restamped them — so only reset pass state; the pass's own wax
// made the shadow stale, so queue a post-lift refresh.
export function flushCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  if (depositionMode === 'planes') {
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
    return;
  }
  clearCrayonBounds(buf);
  buf.underValid = false;
  markShadowStale(target);
}

// The crayon side effects of wiping or replacing a target's pixels, without
// the pixel work itself. Callers are NOT all true clears — undo restores a
// nonblank patch and a repaint reblits history right after this — so the
// shadow is marked stale and left on the scheduled drain, which skips
// still-hidden (blank) targets rather than reading them.
export function resetCrayonStateForClear(target: CanvasRenderingContext2D) {
  dropCrayonBuffer(target);
  const buf = existingBufferFor(target);
  if (!buf) return;
  buf.underValid = false;
  markShadowStale(target);
}

// Discard the target's open pass without stamping — a 'clear' wipes everything,
// open passes included.
function dropCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  clearCrayonBounds(buf);
}

// Deposit a crayon ink op through the configured pipeline (see the pass-buffer
// notes above). Both pipelines paint the buffer through the target's own
// transform and grow the pass bounds by the op's padded rect.
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
  if (depositionMode === 'planes') {
    buf.ctx.canvas.hidden = false;
    if (buf.mirror) buf.mirror.canvas.hidden = false;
    paintCrayon(buf.ctx, op);
    buf.dirty = true;
    const rect = deviceRectFor(buf, matrix, opPaddedUserBounds(op));
    if (buf.mirror && rect) {
      // The mirror's pixels are the buffer's pixels — same op, same seed,
      // same patterns — so re-running the pattern fill to produce them is
      // pure duplicate work. Clearing and copying the op's own rect gives
      // byte-identical output for one blit instead of `passes`
      // pattern-filled strokes.
      const width = rect.x1 - rect.x0;
      const height = rect.y1 - rect.y0;
      buf.mirror.save();
      buf.mirror.setTransform(1, 0, 0, 1, 0, 0);
      buf.mirror.clearRect(rect.x0, rect.y0, width, height);
      buf.mirror.drawImage(
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
      buf.mirror.restore();
    }
    unionCrayonBounds(buf, rect);
    return;
  }
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
