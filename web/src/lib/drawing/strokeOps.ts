// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';

export type CrayonRenderVariant = 'tooth' | 'solid';

let crayonRenderVariant: CrayonRenderVariant = 'tooth';

const WAX_ALPHA = 0.82;
const TOOTH_TILE_SIZE = 24;
const toothPatterns = new Map<number, CanvasPattern>();

export function setCrayonRenderVariant(variant: CrayonRenderVariant) {
  crayonRenderVariant = variant;
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

function hashCrayonOp(op: Extract<StrokeOp, { kind: 'dot' | 'path' }>) {
  let hash = op.kind === 'dot' ? 0x9e3779b9 : op.pid;
  const add = (value: number) => {
    hash = Math.imul(hash ^ Math.round(value * 16), 0x45d9f3b);
    hash ^= hash >>> 16;
  };
  if (op.kind === 'dot') add(op.x + op.y + op.radius);
  else {
    add(op.startX + op.startY + op.lineWidth);
    for (const s of op.segs) add(s.cx + s.cy + s.x + s.y);
  }
  return hash >>> 0;
}

function nextTooth(seed: number) {
  let value = seed || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

function toothPatternFor(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
  const seed = hashCrayonOp(op) & 7;
  const cached = toothPatterns.get(seed);
  if (cached) return cached;
  const tile = document.createElement('canvas');
  tile.width = TOOTH_TILE_SIZE;
  tile.height = TOOTH_TILE_SIZE;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  const random = nextTooth(seed);
  tileCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  for (let i = 0; i < 28; i++) {
    const size = random() < 0.82 ? 1 : 2;
    tileCtx.fillRect(
      Math.floor(random() * TOOTH_TILE_SIZE),
      Math.floor(random() * TOOTH_TILE_SIZE),
      size,
      1
    );
  }
  const pattern = target.createPattern(tile, 'repeat');
  if (pattern) toothPatterns.set(seed, pattern);
  return pattern;
}

function paintCrayonOp(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
  target.globalAlpha = WAX_ALPHA;
  paintOpShape(target, op, op.color);
  target.globalAlpha = 1;
  if (crayonRenderVariant === 'solid') return;
  const tooth = toothPatternFor(target, op);
  if (!tooth) return;
  target.globalCompositeOperation = 'destination-out';
  paintOpShape(target, op, tooth);
  target.globalCompositeOperation = 'source-over';
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
  if (op.erase) paintOpShape(target, op, op.color);
  else paintCrayonOp(target, op);
  target.globalCompositeOperation = 'source-over';
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
