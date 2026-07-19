// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';
import { crayonPatternFor } from './crayonBrush';

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
// `crayon`, when true, paints the op's shape with the waxy grain pattern instead
// of a flat colour (area:crayon / crayonBrush.ts). `layer` is the wax-buildup
// ordinal captured live at draw time — how many prior committed same-colour
// crayon strokes this op overlapped — so replay reproduces the exact grain the
// child saw fill in. Stored, never recomputed on replay (that would depend on
// partial replay state and break bit-identical rebuild).
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
      layer?: number;
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
      layer?: number;
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
  // Coverage footprint of this command's crayon ops (union bbox in paper coords +
  // colour key), captured at commit so wax-buildup can count how many prior
  // same-colour crayon strokes a new op overlaps. Kept on the command even after
  // a keyframe drops `ops`, so buildup survives the keyframe safety net; it
  // travels with the command and disappears when the command folds/pops away.
  crayonCover?: { colorKey: string; minX: number; minY: number; maxX: number; maxY: number };
}

// Stroke or dot the op's bare geometry onto a target using `paint` as the
// fill/stroke style — a solid colour for a normal op, the sheet pattern for a
// magic one.
function paintOpShape(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>,
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
// surface). Erasing composites destination-out; a magic op reveals the color
// sheet (source-over, its shape filled with the sheet pattern) and paints
// nothing until the sheet has decoded; everything else lays down its solid color.
export function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    clearAllOf(target);
    return;
  }
  if (op.magic) {
    const pattern = sheetPatternFor(target);
    if (!pattern) return;
    target.globalCompositeOperation = 'source-over';
    paintOpShape(target, op, pattern);
    return;
  }
  // A crayon op (never an eraser — the eraser is its own tool) lays down waxy
  // grain: the paper-tooth pattern tinted to `color` at this op's buildup layer.
  // Source-over with opaque wax, so a later same-colour pass fills new tooth
  // valleys without darkening the overlap (crayonBrush.ts). Falls through to the
  // solid path only if the pattern can't be built (degenerate colour).
  if (op.crayon && !op.erase) {
    const pattern = crayonPatternFor(target, op.color, op.layer ?? 0);
    if (pattern) {
      target.globalCompositeOperation = 'source-over';
      paintOpShape(target, op, pattern);
      return;
    }
  }
  target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  paintOpShape(target, op, op.color);
  target.globalCompositeOperation = 'source-over';
}

export interface OpBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Axis-aligned paper-space bounds of a dot/path op, inflated by its half-width so
// the box covers the painted ink (not just the path centreline). Used by
// wax-buildup to test stroke overlap; returns null for a clear op.
export function opBounds(op: StrokeOp): OpBounds | null {
  if (op.kind === 'clear') return null;
  if (op.kind === 'dot') {
    return {
      minX: op.x - op.radius,
      minY: op.y - op.radius,
      maxX: op.x + op.radius,
      maxY: op.y + op.radius,
    };
  }
  const half = op.lineWidth / 2;
  let minX = op.startX;
  let minY = op.startY;
  let maxX = op.startX;
  let maxY = op.startY;
  for (const s of op.segs) {
    // The control point can bulge the curve outside the endpoint span; including
    // it over-covers slightly, which is the safe direction for an overlap test.
    for (const [x, y] of s.c2x !== undefined
      ? ([
          [s.cx, s.cy],
          [s.c2x, s.c2y!],
          [s.x, s.y],
        ] as const)
      : ([
          [s.cx, s.cy],
          [s.x, s.y],
        ] as const)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX: minX - half, minY: minY - half, maxX: maxX + half, maxY: maxY + half };
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
