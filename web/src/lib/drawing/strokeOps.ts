// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';
import {
  captureCrayonMixCells,
  crayonMixArmedFor,
  crayonMixOverlapRect,
  crayonMixUnder,
  crayonPatternFor,
  crayonScratchFor,
  getCrayonColorMix,
  getCrayonPasses,
  noteCrayonInk,
  resetCrayonInk,
  type DeviceBox,
} from './crayonBrush';

// Each op is captured at the exact granularity it was rendered (one path op per
// strokeSmoothSegments call, one dot op per stroke start). Live rendering is
// bit-identical to its op; the stored ops are then simplified once at commit
// (ADR-0036) so replay re-strokes far fewer segments without a visible change. A
// 'clear' op wipes the target.
// `magic`, when true, means the op reveals the coloring page's colored fill
// instead of laying down `color` — its shape samples the pre-rendered color sheet
// (ADR-0043). Magic ops are otherwise ordinary members of the command log, so
// undo, eraser (destination-out clears revealed pixels too), and later solid
// strokes overriding them all fall out of the existing replay for free.
// `crayon`, when true, lays the colour down as textured wax instead of a flat
// fill (ADR-0065): the op shape is filled with the paper-tooth pattern from
// crayonBrush.ts, phase-shifted by `seed` so overlapping same-colour strokes
// build up (fill tooth) at a constant hue. `seed` is stored so replay is
// deterministic; every op in one stroke shares it.
export type StrokeOp =
  | {
      kind: 'dot';
      x: number;
      y: number;
      radius: number;
      color: string;
      erase: boolean;
      magic?: boolean;
      crayon?: boolean;
      seed?: number;
    }
  | {
      kind: 'path';
      // Which pointer drew this op, so commit-time simplification (ADR-0036) can
      // regroup a multi-touch command's interleaved per-frame ops back into one
      // run per finger before reducing them. Not used at render time.
      pid: number;
      startX: number;
      startY: number;
      // Live ops carry midpoint-smoothed quadratic segments (cx/cy = control,
      // x/y = endpoint); commit-time simplification (ADR-0036) rewrites them to
      // fewer segments — quadratics in 'samples' mode, cubics (c2x/c2y set) in
      // the diagnostic 'spline' mode. See strokeSimplify.ts.
      segs: PathSeg[];
      color: string;
      lineWidth: number;
      erase: boolean;
      magic?: boolean;
      crayon?: boolean;
      seed?: number;
    }
  | { kind: 'clear' };

export type PathOp = Extract<StrokeOp, { kind: 'path' }>;

// One stroke-group (all fingers down together) = one undo unit. `wasEmpty` is
// the canvas-empty state before the group drew, so undo can restore the flag
// without re-scanning. `keyframe`, when set, is a cumulative square raster of
// the whole drawing *through this command* (replacing its now-dropped `ops`):
// any command whose op list grew past the keyframe threshold is collapsed to a
// keyframe so rebuilds blit it instead of re-stroking thousands of ops. See
// ADR-0035.
export interface StrokeGroupCommand {
  ops: StrokeOp[];
  wasEmpty: boolean;
  // Whether the live render of this group actually sampled the crayon
  // colour-mix under image (ADR-0065). Recorded at commit so every rebuild
  // arms the mix for exactly these commands — and pays nothing for the rest.
  mixedUnder?: boolean;
  keyframe?: HTMLCanvasElement | null;
}

// Stroke or dot the op's bare geometry onto a target using `paint` as the
// fill/stroke style — a solid colour for a normal op, the sheet pattern for a
// magic one. `widthScale` shrinks a path op's line width / a dot's radius for a
// crayon density pass (1 = the op's full size).
function paintOpShape(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>,
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
      if (s.c2x !== undefined) target.bezierCurveTo(s.cx, s.cy, s.c2x, s.c2y!, s.x, s.y);
      else target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
}

// Device-space integer bounds of an op's painted area (its geometry padded by
// half the line width plus an anti-aliasing margin, mapped through the target's
// current transform), clamped to the canvas. Null when nothing lands on-canvas.
// A quadratic/cubic segment stays inside the convex hull of its anchor and
// control points, so taking min/max over every stored point is a true bound.
function opDeviceBounds(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
): DeviceBox | null {
  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;
  let pad: number;
  if (op.kind === 'dot') {
    minX = maxX = op.x;
    minY = maxY = op.y;
    pad = op.radius + 2;
  } else {
    minX = maxX = op.startX;
    minY = maxY = op.startY;
    for (const s of op.segs) {
      minX = Math.min(minX, s.cx, s.x);
      maxX = Math.max(maxX, s.cx, s.x);
      minY = Math.min(minY, s.cy, s.y);
      maxY = Math.max(maxY, s.cy, s.y);
      if (s.c2x !== undefined) {
        minX = Math.min(minX, s.c2x);
        maxX = Math.max(maxX, s.c2x);
        minY = Math.min(minY, s.c2y!);
        maxY = Math.max(maxY, s.c2y!);
      }
    }
    pad = op.lineWidth / 2 + 2;
  }
  // Identity fallback for contexts without getTransform (happy-dom's unit-test
  // stub); real identity targets (baseline, keyframes, exports) take the same
  // values either way.
  const m = typeof target.getTransform === 'function' ? target.getTransform() : null;
  let dMinX = Infinity;
  let dMinY = Infinity;
  let dMaxX = -Infinity;
  let dMaxY = -Infinity;
  for (const [px, py] of [
    [minX - pad, minY - pad],
    [maxX + pad, minY - pad],
    [minX - pad, maxY + pad],
    [maxX + pad, maxY + pad],
  ]) {
    const dx = m ? m.a * px + m.c * py + m.e : px;
    const dy = m ? m.b * px + m.d * py + m.f : py;
    dMinX = Math.min(dMinX, dx);
    dMaxX = Math.max(dMaxX, dx);
    dMinY = Math.min(dMinY, dy);
    dMaxY = Math.max(dMaxY, dy);
  }
  const x = Math.max(0, Math.floor(dMinX));
  const y = Math.max(0, Math.floor(dMinY));
  const w = Math.min(target.canvas.width, Math.ceil(dMaxX)) - x;
  const h = Math.min(target.canvas.height, Math.ceil(dMaxY)) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

// Lay a crayon op down as textured wax: one pass per density band (widest first),
// each filled with the paper-tooth pattern for the op's colour + seed. Opaque
// where wax deposits, transparent in the tooth pits — so overlapping same-colour
// strokes build up coverage without shifting hue (ADR-0065). No-op until the
// tooth tile is buildable (a DOM canvas exists), matching the magic sheet's
// decode-pending skip.
//
// While the colour mix is armed for the target (colorMix, ADR-0065), the op
// also captures its overlap rect's pre-stroke snapshot cells before painting;
// the mix itself is applied later, once per command, by applyCrayonMixFixup.
function paintCrayon(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>,
  box: DeviceBox | null
) {
  const seed = op.seed ?? 0;
  const passes = getCrayonPasses();
  target.globalCompositeOperation = 'source-over';
  if (box) captureCrayonMixCells(target, box);
  for (let i = 0; i < passes.length; i++) {
    const pattern = crayonPatternFor(target, op.color, seed, i);
    if (!pattern) continue;
    paintOpShape(target, op, pattern, passes[i].widthScale);
  }
}

function unionBox(a: DeviceBox, b: DeviceBox): DeviceBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

// Pre-capture exactly the snapshot cells a command's mix fixup will sample —
// the replay loops call this right after arming, before the command's ops
// paint, replacing many per-op read-backs with one bounded copy.
export function captureCrayonMixForOps(target: CanvasRenderingContext2D, ops: StrokeOp[]) {
  if (!crayonMixArmedFor(target)) return;
  for (const op of ops) {
    if (op.kind === 'clear' || !op.crayon || op.erase || op.magic) continue;
    const box = opDeviceBounds(target, op);
    if (box) captureCrayonMixCells(target, box);
  }
}

// Apply a command's crayon colour mix (ADR-0065) to a target the command's ops
// have just been painted onto — at commit for the live canvas (with the
// freshly simplified ops), and after each mixed command in every replay loop
// (with the same simplified ops, so live-final and every rebuild agree on
// deposit values by construction). One scratch pass: re-render every crayon
// op's tooth (in op order, so layering matches) clipped to the union of the
// ops' pre-stroke-ink overlap rects, lerp the deposits toward the under-ink
// snapshot with a single source-atop at colorMix alpha (the atop confines the
// lerp to the deposits' own alpha — pits stay transparent, so the old ink
// showing through them is untouched), and blit the rect over the direct
// render, replacing the pure deposits with their mixed values. Returns
// whether anything mixed — recorded on the command as `mixedUnder`.
export function applyCrayonMixFixup(target: CanvasRenderingContext2D, ops: StrokeOp[]): boolean {
  if (!crayonMixArmedFor(target)) return false;
  const crayonOps: Extract<StrokeOp, { kind: 'dot' | 'path' }>[] = [];
  let union: DeviceBox | null = null;
  for (const op of ops) {
    if (op.kind === 'clear' || !op.crayon || op.erase || op.magic) continue;
    crayonOps.push(op);
    const box = opDeviceBounds(target, op);
    if (!box) continue;
    const rect = crayonMixOverlapRect(target, box);
    if (rect) union = union ? unionBox(union, rect) : rect;
  }
  if (!union) return false;
  const under = crayonMixUnder();
  const scratch = crayonScratchFor(target.canvas.width, target.canvas.height);
  if (!under || !scratch) return false;
  const passes = getCrayonPasses();
  scratch.save();
  scratch.setTransform(1, 0, 0, 1, 0, 0);
  scratch.clearRect(union.x, union.y, union.w, union.h);
  scratch.beginPath();
  scratch.rect(union.x, union.y, union.w, union.h);
  scratch.clip();
  if (typeof target.getTransform === 'function') scratch.setTransform(target.getTransform());
  for (const op of crayonOps) {
    for (let i = 0; i < passes.length; i++) {
      const pattern = crayonPatternFor(scratch, op.color, op.seed ?? 0, i);
      if (!pattern) continue;
      paintOpShape(scratch, op, pattern, passes[i].widthScale);
    }
  }
  scratch.setTransform(1, 0, 0, 1, 0, 0);
  scratch.globalCompositeOperation = 'source-atop';
  scratch.globalAlpha = getCrayonColorMix();
  scratch.drawImage(under, union.x, union.y, union.w, union.h, union.x, union.y, union.w, union.h);
  scratch.restore();
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(
    scratch.canvas,
    union.x,
    union.y,
    union.w,
    union.h,
    union.x,
    union.y,
    union.w,
    union.h
  );
  target.restore();
  return true;
}

// Clear everything a target could be showing. The visible ctx's user space is
// PAPER coordinates whenever the paper view is active — and with the margins
// drawable, ink can sit at negative paper coordinates that a rect from (0,0)
// would miss — so clear in device space. Identity targets (baseline, keyframes,
// exports) are unaffected: device space is their own space.
export function clearAllOf(target: CanvasRenderingContext2D) {
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.restore();
}

// Paint one recorded op onto a target context. Used both live (target = the
// visible ctx) and during undo/resize replay (target = the visible or baseline
// surface). Erasing composites destination-out; a magic op reveals the color
// sheet (source-over, its shape filled with the sheet pattern) and paints
// nothing until the sheet has decoded; everything else lays down its solid color.
export function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    clearAllOf(target);
    resetCrayonInk(target);
    return;
  }
  // Every painted op reports its device bounds to the target's ink-occupancy
  // grid, the cheap "is there anything under this op to mix with?" filter for
  // the crayon colour mix (ADR-0065). All tools report — crayon later mixes
  // with solid and magic ink too, and erasing reports as a conservative
  // superset. Reported AFTER painting: a crayon op's mix decision must see the
  // grid as it was before the op's own ink joined it.
  const box = opDeviceBounds(target, op);
  if (op.magic) {
    const pattern = sheetPatternFor(target);
    if (!pattern) return;
    target.globalCompositeOperation = 'source-over';
    paintOpShape(target, op, pattern);
  } else if (op.crayon && !op.erase) {
    paintCrayon(target, op, box);
  } else {
    target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
    paintOpShape(target, op, op.color);
    target.globalCompositeOperation = 'source-over';
  }
  if (box) noteCrayonInk(target, box);
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
