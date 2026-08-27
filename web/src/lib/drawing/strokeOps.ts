// The engine's retained op vocabulary and renderer. Tiled live surfaces,
// history bases, repaints, and exports all dispatch the same operations here.

import { captureMagicSheet, sheetPatternFor, type MagicSheetSnapshot } from './magicBrush';
import { paintOpShape } from './opGeometry';
import {
  flushCrayonBuffer,
  invalidateCrayonUnder,
  renderCrayonOp,
  resetCrayonStateForClear,
} from './crayonPassBuffer';
import type { RecordedPaperState } from './undoHistory';

// One rendered curve segment: a quadratic with control cx/cy and endpoint x/y.
interface PathSeg {
  cx: number;
  cy: number;
  x: number;
  y: number;
}

// Each op is captured at the exact granularity it was rendered (one path op per
// strokeSmoothSegments call, one dot op per stroke start), so folding the ops
// reproduces the live pixels exactly. A 'clear' op wipes the target.
// `magic`, when true, means the op reveals the coloring page's colored fill
// instead of laying down `color` — its shape samples the pre-rendered color sheet
// (ADR-0043). Magic ops are otherwise ordinary ops, so the eraser
// (destination-out clears revealed pixels too) and later solid strokes
// overriding them fall out of the shared renderer for free.
// `crayon`, when true, lays the colour down as textured wax instead of a flat
// fill (ADR-0065): the op shape is filled with the paper-tooth pattern from
// crayonBrush.ts, phase-shifted by `seed` so overlapping same-colour strokes
// build up (fill tooth) at a constant hue. Every op in one pass shares its
// seed.
// Crayon ops accumulate on a per-target PASS BUFFER at full opacity and
// restamp the pass's subtractive glaze onto the target per op (see
// crayonPassBuffer.ts) — the buffered pass is what lets new wax mix once
// with the ink under it (blue over yellow → green) without ever mixing with
// its own overlapping per-frame ops; a 'crayonFlush' op closes the pass.
export type StrokeOp =
  | {
      kind: 'dot';
      x: number;
      y: number;
      radius: number;
      color: string;
      erase: boolean;
      magic?: boolean;
      magicSheet?: MagicSheetSnapshot;
      crayon?: boolean;
      seed?: number;
    }
  | {
      kind: 'path';
      // Which pointer drew this op. Not used at render time, but it keeps a
      // multi-touch command's interleaved per-frame ops attributable per finger.
      pid: number;
      startX: number;
      startY: number;
      // Midpoint-smoothed quadratic segments (cx/cy = control, x/y = endpoint).
      segs: PathSeg[];
      color: string;
      lineWidth: number;
      erase: boolean;
      magic?: boolean;
      magicSheet?: MagicSheetSnapshot;
      crayon?: boolean;
      seed?: number;
    }
  | { kind: 'crayonFlush' }
  | { kind: 'clear' };

export type PathOp = Extract<StrokeOp, { kind: 'path' }>;
export type DotOp = Extract<StrokeOp, { kind: 'dot' }>;

// An op that deposits crayon wax — the shape the renderer routes through the
// pass buffer (a crayon-mode eraser op erases like any other).
export function isCrayonInkOp(op: StrokeOp): op is (DotOp | PathOp) & { crayon: true } {
  return (op.kind === 'dot' || op.kind === 'path') && op.crayon === true && !op.erase;
}
export type MagicStrokeOp = (PathOp | DotOp) & { magic: true };

export interface MagicRecodeUndo {
  targetSourceKey: string | null;
  previousSheets: Map<MagicStrokeOp, MagicSheetSnapshot | undefined>;
  restoreAppearance: () => void;
  applied: boolean;
}

// One stroke-group (all fingers down together) = one undo unit. `wasEmpty` is
// the canvas-empty state before the group drew, so undo can restore the flag
// without re-scanning. `recordedPaper` restores the coordinate space beneath a
// clear or erase after a blank-page rotation re-adopted the live viewport.
export interface StrokeGroupCommand {
  ops: StrokeOp[];
  wasEmpty: boolean;
  recordedPaper?: RecordedPaperState;
  magicRecode?: MagicRecodeUndo;
}

// Clear everything a target could be showing in device space, independent of
// the tile or export transform currently installed on the context.
export function clearAllOf(target: CanvasRenderingContext2D) {
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.restore();
}

// Paint one recorded op onto a tile or export context. Erasing composites
// destination-out; a magic op reveals the color sheet and paints nothing until
// the sheet has decoded; a crayon op deposits through the target's pass buffer
// and a 'crayonFlush' closes the pass. Any non-crayon ink op flushes an open
// pass first so compositing order matches the op order.
export function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    resetCrayonStateForClear(target);
    clearAllOf(target);
    return;
  }
  if (op.kind === 'crayonFlush') {
    flushCrayonBuffer(target);
    return;
  }
  if (op.magic) {
    flushCrayonBuffer(target);
    const snapshot = op.magicSheet ?? captureMagicSheet();
    const pattern = sheetPatternFor(target, snapshot);
    if (!pattern) return;
    op.magicSheet ??= snapshot ?? undefined;
    target.globalCompositeOperation = 'source-over';
    paintOpShape(target, op, pattern);
    // Foreign ink stales the crayon under shadow.
    invalidateCrayonUnder(target);
    return;
  }
  if (op.crayon && !op.erase) {
    renderCrayonOp(target, op);
    return;
  }
  flushCrayonBuffer(target);
  target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  paintOpShape(target, op, op.color);
  target.globalCompositeOperation = 'source-over';
  // Foreign ink stales the crayon under shadow.
  invalidateCrayonUnder(target);
}
