// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';
import { renderBrushOp } from './brushRender';

// The brush that laid down an op. Each brush is a distinct way of turning the
// op's bare geometry into pixels, dispatched by renderOp() below:
//   pen        solid stroke in `color` — the default (ADR-0004).
//   magic      reveals the coloring page's colored fill / rainbow (ADR-0043).
//   crayon     textured, waxy stroke (see brushRender.ts).
//   watercolor soft, translucent stroke that pools where it overlaps.
// Stored on the op (not just the tool state) so undo/resize/export replay each
// op through the same brush and stay bit-identical to live drawing (ADR-0033).
// The eraser is orthogonal (`erase`), so it isn't a brush — it removes pixels
// under whatever brush was selected.
export type BrushKind = 'pen' | 'magic' | 'crayon' | 'watercolor';

// Each op is captured at the exact granularity it was rendered (one path op per
// strokeSmoothSegments call, one dot op per stroke start). Live rendering is
// bit-identical to its op; the stored ops are then simplified once at commit
// (ADR-0036) so replay re-strokes far fewer segments without a visible change. A
// 'clear' op wipes the target.
// `brush` selects how the op paints (see BrushKind). A missing value means the
// default pen. Non-pen brushes are otherwise ordinary members of the command
// log, so undo, eraser (destination-out clears their pixels too), and later
// strokes overriding them all fall out of the existing replay for free.
export type StrokeOp =
  | {
      kind: 'dot';
      x: number;
      y: number;
      radius: number;
      color: string;
      erase: boolean;
      brush?: BrushKind;
      // A per-stroke-group id (constant across one gesture's ops), stamped by the
      // engine. Crayon offsets its paper-tooth holes by it so a NEW stroke's gaps
      // fall in different places than an earlier one's — overlapping strokes fill
      // each other's tooth (wax buildup as coverage, ADR-0065), while one stroke's
      // own overlapping ops share the seed and stay bit-identical (no joint beads).
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
      brush?: BrushKind;
      // Per-stroke-group id (see the dot op): crayon phases its paper-tooth holes
      // by it, so a new stroke's gaps land where an earlier one's wax did — the
      // overlap fills toward solid (coverage buildup), while one stroke's own
      // ops share the seed and stay idempotent (no joint beads).
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
  keyframe?: HTMLCanvasElement | null;
}

// A dot or path op — the two ops that carry brush geometry. Shared by renderOp
// and the per-brush renderers in brushRender.ts.
export type InkOp = Extract<StrokeOp, { kind: 'dot' | 'path' }>;

// Stroke or dot the op's bare geometry onto a target using `paint` as the
// fill/stroke style — a solid colour for a normal op, the sheet pattern for a
// magic one. Exported so the per-brush renderers can reuse the exact same path
// geometry (keeping live and replay bit-identical).
export function paintOpShape(
  target: CanvasRenderingContext2D,
  op: InkOp,
  paint: string | CanvasPattern
) {
  if (op.kind === 'dot') {
    target.fillStyle = paint;
    target.beginPath();
    target.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    target.fill();
  } else {
    target.strokeStyle = paint;
    target.lineWidth = op.lineWidth;
    target.beginPath();
    target.moveTo(op.startX, op.startY);
    for (const s of op.segs) {
      if (s.c2x !== undefined) target.bezierCurveTo(s.cx, s.cy, s.c2x, s.c2y!, s.x, s.y);
      else target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
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
// surface). The brush dispatch is the single point every surface shares, so a
// crayon or watercolor stroke replays exactly as it was drawn (ADR-0033):
//   - erasing composites destination-out (a modifier orthogonal to the brush);
//   - a magic op reveals the color sheet (source-over, filled with the sheet
//     pattern) and paints nothing until the sheet has decoded;
//   - crayon/watercolor delegate to their renderers in brushRender.ts;
//   - the pen (default) lays down its solid color.
export function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    clearAllOf(target);
    return;
  }
  if (op.erase) {
    target.globalCompositeOperation = 'destination-out';
    paintOpShape(target, op, op.color);
    target.globalCompositeOperation = 'source-over';
    return;
  }
  const brush = op.brush ?? 'pen';
  if (brush === 'magic') {
    const pattern = sheetPatternFor(target);
    if (!pattern) return;
    target.globalCompositeOperation = 'source-over';
    paintOpShape(target, op, pattern);
    return;
  }
  if (brush === 'crayon' || brush === 'watercolor') {
    renderBrushOp(target, op, brush);
    return;
  }
  target.globalCompositeOperation = 'source-over';
  paintOpShape(target, op, op.color);
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
