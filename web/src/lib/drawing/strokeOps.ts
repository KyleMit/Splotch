// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';

export type CrayonVariant = 'wax' | 'solid';

let crayonVariant: CrayonVariant = 'wax';

// Dev/profiling seam for comparing the former solid pen to the wax renderer.
// Stroke ops carry their chosen variant, so changing this never changes history.
export function setCrayonVariant(variant: CrayonVariant) {
  crayonVariant = variant;
}

export function currentCrayonVariant(): CrayonVariant {
  return crayonVariant;
}

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
export type StrokeOp =
  | {
      kind: 'dot';
      x: number;
      y: number;
      radius: number;
      color: string;
      erase: boolean;
      magic?: boolean;
      crayon?: CrayonVariant;
      waxPass?: number;
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
      crayon?: CrayonVariant;
      waxPass?: number;
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
  crayonBounds?: CrayonBounds[];
}

export interface CrayonBounds {
  color: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function opCrayonBounds(op: StrokeOp): CrayonBounds | null {
  if (op.kind === 'clear' || op.erase || op.magic || op.crayon !== 'wax') return null;
  if (op.kind === 'dot') {
    return {
      color: op.color,
      left: op.x - op.radius,
      top: op.y - op.radius,
      right: op.x + op.radius,
      bottom: op.y + op.radius,
    };
  }
  let left = op.startX;
  let top = op.startY;
  let right = op.startX;
  let bottom = op.startY;
  for (const segment of op.segs) {
    left = Math.min(left, segment.cx, segment.x, segment.c2x ?? segment.cx);
    top = Math.min(top, segment.cy, segment.y, segment.c2y ?? segment.cy);
    right = Math.max(right, segment.cx, segment.x, segment.c2x ?? segment.cx);
    bottom = Math.max(bottom, segment.cy, segment.y, segment.c2y ?? segment.cy);
  }
  const radius = op.lineWidth / 2;
  return {
    color: op.color,
    left: left - radius,
    top: top - radius,
    right: right + radius,
    bottom: bottom + radius,
  };
}

export function boundsOverlap(a: CrayonBounds, b: CrayonBounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

const waxPatterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function waxPattern(
  target: CanvasRenderingContext2D,
  color: string,
  pass: number
): CanvasPattern | null {
  let patterns = waxPatterns.get(target);
  if (!patterns) waxPatterns.set(target, (patterns = new Map()));
  const key = `${color}:${pass}`;
  const cached = patterns.get(key);
  if (cached) return cached;
  const tile = document.createElement('canvas');
  tile.width = 64;
  tile.height = 64;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  tileCtx.fillStyle = color;
  // A deterministic, fine paper-tooth mask. Each pass shifts the mask phase,
  // so a same-colour overlap deposits wax into previously open tooth instead of
  // darkening the existing colour. The 64px tile avoids visible repetition.
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      let seed = (x * 374761393 + y * 668265263 + pass * 2246822519) >>> 0;
      seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
      const noise = (seed ^ (seed >>> 16)) % 100;
      if (noise >= 68) continue;
      tileCtx.globalAlpha = 0.68 + ((seed >>> 8) % 12) / 100;
      tileCtx.fillRect(x, y, 1, 1);
    }
  }
  const pattern = target.createPattern(tile, 'repeat');
  if (pattern) patterns.set(key, pattern);
  return pattern;
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
  target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  const wax = op.crayon === 'wax' ? waxPattern(target, op.color, op.waxPass ?? 0) : null;
  paintOpShape(target, op, wax ?? op.color);
  target.globalCompositeOperation = 'source-over';
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
