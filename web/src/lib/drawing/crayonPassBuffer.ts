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
// NATIVE TRIAL (exp/crayon-native-t1-deferred-glaze): 'deferred' paints the
// wax DIRECTLY onto the tile as the live preview (zero per-op blits — the
// WKWebView's expensive primitive; its ablation put direct paint at 0.02%
// against the plane pipeline's 1.24%) while accumulating the same ops on the
// offscreen buffer; the exact glaze lands ONCE at pass close by restoring
// the pass bounds from a pass-open under snapshot and stamping the buffer.
// Over blank tiles the direct wax already equals the glaze, so virgin passes
// skip both the snapshot and the close-time stamp.
type CrayonDepositionMode = 'restamp' | 'planes' | 'deferred' | 'planes-deferred';

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
// Both plane pipelines preview on the composited planes, so the tile must
// keep its pre-pass pixels while a pass is open. They differ only in WHEN the
// bake lands, never in what the child sees.
function usesPreviewPlanes() {
  return depositionMode === 'planes' || depositionMode === 'planes-deferred';
}

export function crayonDepositsOnTiles() {
  return !usesPreviewPlanes();
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
  // TRIAL T8: a closed pass awaiting its post-lift glaze stamp.
  pendingStamp: { x0: number; y0: number; x1: number; y1: number } | null;
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
  if (!usesPreviewPlanes()) return;
  bufferByTarget.set(target, {
    ctx: buffer,
    mirror,
    under: null,
    underValid: false,
    virgin: false,
    pendingStamp: null,
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
      pendingStamp: null,
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

// A recorded 'crayonFlush' op. On the plane and restamp pipelines every
// flush stamps/resets as ever. On the deferred pipeline only a FINAL flush
// closes the pass — and it does so two frames later, off the contact window
// (a mid-stroke checkpoint or split is a seed boundary: the buffer keeps
// accumulating and the multi-seed wax stays order-exact, since the direct
// preview painted it in the same op order). Offscreen targets (history-base
// fold, export replay) and repaint replays close synchronously — nothing
// there is racing a finger.
export function closeCrayonPassOp(target: CanvasRenderingContext2D, final: boolean) {
  if (depositionMode === 'planes-deferred') {
    closeDeferredPlanePass(target, final);
    return;
  }
  if (depositionMode !== 'deferred') {
    flushCrayonBuffer(target);
    return;
  }
  if (!final) return;
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  if (replayContext || underProvider(target).kind === 'offscreen') {
    flushCrayonBuffer(target);
    return;
  }
  if (buf.virgin || !buf.bounds) {
    clearCrayonBounds(buf);
    buf.underValid = false;
    return;
  }
  // The glaze stamp leaves the contact window: it runs two frames after the
  // lift, where the in-contact lost-frame gate does not live. Buffer and
  // under survive until then; a new pass opening first settles synchronously
  // to preserve compositing order.
  buf.pendingStamp = buf.bounds;
  buf.bounds = null;
  buf.dirty = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      settlePendingStamp(target, buf);
    });
  });
}

// The plane pipeline with the BAKE deferred and the preview left alone.
//
// A mid-stroke seed boundary does nothing at all: the pass keeps accumulating
// on the same plane pair under a fresh pattern phase, so the wax builds up as
// it always did and the child keeps seeing the exact glaze through CSS
// compositing. Only a pass CLOSE bakes, and it bakes two frames after the
// lift, outside the contact window the lost-frame metric charges.
//
// This is the quadrant campaign one never entered. Its trials all deferred the
// bake on a DIRECT-PAINT preview, so the mixing itself arrived late and read as
// a colour glitch; here the mixing was never deferred, only the transfer of
// already-visible pixels from the planes to the tile.
function closeDeferredPlanePass(target: CanvasRenderingContext2D, final: boolean) {
  if (!final) return;
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  // Offscreen targets (history-base fold, export replay) have no planes and
  // no finger to race — close them synchronously.
  if (!buf.mirror) {
    flushCrayonBuffer(target);
    return;
  }
  buf.pendingStamp = buf.bounds;
  buf.bounds = null;
  buf.dirty = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      settlePendingPlaneBake(target, buf);
    });
  });
}

// Apply a closed pass's deferred glaze — restore + stamp over the stashed
// bounds, force WebKit to flush the stamp's command buffer while we are
// still between strokes (idle time does not flush it, only a read does, and
// an unflushed stamp makes the NEXT stroke's undo capture pay the sync
// in-contact — measured at 1.7% against 0.37% flushed), then release the
// buffer.
function settlePendingStamp(target: CanvasRenderingContext2D, buf: CrayonPassBuffer) {
  const pending = buf.pendingStamp;
  if (!pending) return;
  buf.pendingStamp = null;
  buf.virgin = false;
  restampRect(target, buf, pending);
  // TRIAL T10: force WebKit to flush the stamp's command buffer NOW, while
  // we are still between strokes — idle time does not flush it, only a read
  // does, and without this the NEXT stroke's undo capture pays the
  // accumulated sync inside the contact window.
  target.getImageData(pending.x0, pending.y0, 1, 1);
  buf.ctx.save();
  buf.ctx.setTransform(1, 0, 0, 1, 0, 0);
  buf.ctx.clearRect(pending.x0, pending.y0, pending.x1 - pending.x0, pending.y1 - pending.y0);
  buf.ctx.restore();
  buf.underValid = false;
}

// Stamp a plane pass into the tile as the two-blit glaze. Buffer and target
// share backing dimensions and ops were painted through the target's own
// transform, so the blits are 1:1 rect copies in device space.
function bakePlanePassIntoTile(
  target: CanvasRenderingContext2D,
  buf: CrayonPassBuffer,
  bounds: { x0: number; y0: number; x1: number; y1: number } | null
) {
  if (!bounds) return;
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  stampSubtractiveGlaze(target, getCrayonMix(), () => {
    target.drawImage(buf.ctx.canvas, bounds.x0, bounds.y0, w, h, bounds.x0, bounds.y0, w, h);
  });
  target.restore();
}

// Land a plane pass's deferred bake and retire its planes in the same turn.
// The planes were showing exactly these pixels through CSS compositing, so
// the tile gaining them as the planes clear is a swap the eye cannot see —
// which is the whole reason this pipeline can defer at all.
function settlePendingPlaneBake(target: CanvasRenderingContext2D, buf: CrayonPassBuffer) {
  const pending = buf.pendingStamp;
  if (!pending) return;
  buf.pendingStamp = null;
  bakePlanePassIntoTile(target, buf, pending);
  // TRIAL T10: force WebKit to flush the bake's command buffer NOW, while we
  // are still between strokes. Deferring the bake without this merely moves
  // its cost onto the next stroke's undo capture, in contact (T8: 3.5%).
  target.getImageData(pending.x0, pending.y0, 1, 1);
  buf.bounds = pending;
  buf.dirty = true;
  clearCrayonBounds(buf);
}

// A CLOSED pass whose deferred glaze has not landed yet still owes the target
// its committed pixels. Clear takes an undo snapshot of the tile, so that debt
// must be paid before the snapshot — otherwise the snapshot preserves pre-glaze
// pixels and the scheduled callback mutates the tile afterwards, splitting the
// Clear undo image across both.
//
// An OPEN pass is deliberately left alone: a stroke straddling drag-to-clear
// must not resurrect wiped wax (ADR-0068), which is what dropping it achieves.
export function settleClosedCrayonPass(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf) return;
  if (depositionMode === 'planes-deferred') settlePendingPlaneBake(target, buf);
  else settlePendingStamp(target, buf);
}

// Tiles the renderer observed to be blank when a crayon op arrived — consumed
// at the next pass open to select the virgin fast path. The renderer notes
// blankness from tile visibility BEFORE it shows the tile for the op, which
// is the only moment blankness is knowable without reading pixels.
const blankAtPassOpen = new WeakSet<CanvasRenderingContext2D>();

export function noteCrayonTargetBlank(target: CanvasRenderingContext2D) {
  blankAtPassOpen.add(target);
}

// TRIAL T9: where a deferred pass's under pixels come from, WITHOUT crayon
// ever reading the composited tile (the WKWebView's measured poison):
//   'patch'      — the undo system's pre-command snapshot (it already paid
//                  the read; blank commands capture nothing and are virgin)
//   'offscreen'  — the target is not a live tile (history base, export):
//                  reading it directly is safe
// A repaint replay flips replayContext: direct reads are acceptable off the
// gesture path.
type CrayonUnderSource =
  | { kind: 'patch'; canvas: HTMLCanvasElement }
  | { kind: 'blank' }
  | { kind: 'offscreen' };
let underProvider: (target: CanvasRenderingContext2D) => CrayonUnderSource = () => ({
  kind: 'offscreen',
});
let replayContext = false;

export function setCrayonUnderProvider(
  provider: (target: CanvasRenderingContext2D) => CrayonUnderSource
) {
  underProvider = provider;
}

export function setCrayonReplayContext(active: boolean) {
  replayContext = active;
}

function seedUnderFromCanvas(buf: CrayonPassBuffer, source: HTMLCanvasElement) {
  if (!buf.under) {
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    buf.under = c.getContext('2d')!;
  } else if (buf.under.canvas.width !== source.width || buf.under.canvas.height !== source.height) {
    buf.under.canvas.width = source.width;
    buf.under.canvas.height = source.height;
  } else {
    buf.under.clearRect(0, 0, source.width, source.height);
  }
  buf.under.drawImage(source, 0, 0);
  buf.underValid = true;
}

// The renderer's one-call seam for a crayon ink op's tile visibility: plane
// deposition previews on the composited planes, so the tile must stay as it
// was (returns false); restamp deposition mutates the tile directly, so it is
// shown like any ink op — and a still-hidden tile is blank
// (prepareTileForMutation has run), which is what opens the virgin fast path.
export function crayonOpShowsTile(target: CanvasRenderingContext2D, targetHidden: boolean) {
  if (usesPreviewPlanes()) return false;
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
  // A pending post-lift stamp describes pixels this reset just invalidated.
  buf.pendingStamp = null;
  if (usesPreviewPlanes()) {
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
  if (!buf) return;
  if (depositionMode === 'deferred') {
    // Direct callers (export, a foreign op about to composite over the
    // pass) need the exact glazed pixels NOW — close synchronously,
    // settling any stamp still pending from an earlier close first.
    settlePendingStamp(target, buf);
    if (!buf.dirty) return;
    if (!buf.virgin && buf.bounds) restampRect(target, buf, buf.bounds);
    clearCrayonBounds(buf);
    buf.underValid = false;
    return;
  }
  if (!buf.dirty) return;
  if (usesPreviewPlanes()) {
    bakePlanePassIntoTile(target, buf, buf.bounds);
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
  // Either of those replaces the pixels a pending stamp was computed against,
  // so disarm it before anything else — and independently of `dirty`, since a
  // closed-but-unstamped pass is exactly the state that is NOT dirty.
  const existing = existingBufferFor(target);
  if (existing) cancelPendingStamp(existing);
  dropCrayonBuffer(target);
  const buf = existingBufferFor(target);
  if (!buf) return;
  buf.underValid = false;
  markShadowStale(target);
}

// Disarm a stamp still pending from a closed pass, and drop the wax it was
// going to stamp. Both halves matter: the scheduled callback bails on a null
// token, and the buffer must not keep that pass's wax, because the next pass
// stamps its own bounds out of the same buffer.
function cancelPendingStamp(buf: CrayonPassBuffer) {
  const pending = buf.pendingStamp;
  if (!pending) return;
  buf.pendingStamp = null;
  if (usesPreviewPlanes()) {
    // Here the buffer IS the bottom preview plane and there is a mirror beside
    // it, both still composited over the tile because a deferred bake leaves
    // them up. Clearing only the buffer would retire half the preview and
    // leave the mirror showing the wax the undo just discarded.
    buf.bounds = pending;
    buf.dirty = true;
    clearCrayonBounds(buf);
    return;
  }
  buf.ctx.save();
  buf.ctx.setTransform(1, 0, 0, 1, 0, 0);
  buf.ctx.clearRect(pending.x0, pending.y0, pending.x1 - pending.x0, pending.y1 - pending.y0);
  buf.ctx.restore();
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
  if (usesPreviewPlanes()) {
    // A pass opening while an earlier pass's bake is still pending must land
    // that bake FIRST: both passes share one plane pair, so the new wax would
    // otherwise join the old pass's pixels and be glazed with it as a single
    // pass. Synchronous, and it only fires when strokes arrive closer together
    // than the two-frame settle.
    if (!buf.dirty) settlePendingPlaneBake(target, buf);
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
  if (depositionMode === 'deferred') {
    // NATIVE TRIAL: live preview is the opaque wax painted straight onto the
    // tile — pattern strokes are free here, blits are not. The buffer keeps
    // accumulating so the close-time glaze has the whole pass, and the
    // pre-pass pixels are snapshotted once per non-virgin pass open.
    if (!buf.dirty) {
      settlePendingStamp(target, buf);
      buf.virgin = blankAtPassOpen.has(target);
      blankAtPassOpen.delete(target);
      if (!buf.virgin) {
        const source = replayContext ? { kind: 'offscreen' as const } : underProvider(target);
        if (source.kind === 'patch') seedUnderFromCanvas(buf, source.canvas);
        else if (source.kind === 'offscreen') captureUnderSnapshot(buf, target);
        else buf.virgin = true;
      }
    }
    paintCrayon(buf.ctx, op);
    paintCrayon(target, op);
    buf.dirty = true;
    unionCrayonBounds(buf, deviceRectFor(buf, matrix, opPaddedUserBounds(op)));
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
