// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';

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
      deposit?: number;
      grain?: number;
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
      deposit?: number;
      grain?: number;
    }
  | { kind: 'clear' };

export type PathOp = Extract<StrokeOp, { kind: 'path' }>;

export type CrayonVariant = 'wax-tooth' | 'flat';

let crayonVariant: CrayonVariant = 'wax-tooth';

export function setCrayonVariant(variant: CrayonVariant) {
  crayonVariant = variant;
}

const grainPatterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function grainPattern(
  target: CanvasRenderingContext2D,
  color: string,
  grain: number
): CanvasPattern {
  let patterns = grainPatterns.get(target);
  if (!patterns) {
    patterns = new Map();
    grainPatterns.set(target, patterns);
  }
  const key = `${color}:${grain & 15}`;
  const cached = patterns.get(key);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = 24;
  tile.height = 24;
  const tileCtx = tile.getContext('2d')!;
  const pixels = tileCtx.createImageData(tile.width, tile.height);
  const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const r = rgb ? Number.parseInt(rgb[1], 16) : 0;
  const g = rgb ? Number.parseInt(rgb[2], 16) : 0;
  const b = rgb ? Number.parseInt(rgb[3], 16) : 0;
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      const i = (y * tile.width + x) * 4;
      let noise =
        Math.imul(x + 1, 0x1f123bb5) ^
        Math.imul(y + 1, 0x5f356495) ^
        Math.imul((grain & 15) + 1, 0x6c8e9cf5);
      noise ^= noise >>> 16;
      noise = Math.imul(noise, 0x45d9f3b);
      const tooth = (noise ^ (noise >>> 16)) >>> 29;
      pixels.data[i] = r;
      pixels.data[i + 1] = g;
      pixels.data[i + 2] = b;
      pixels.data[i + 3] = tooth === 0 ? 132 : tooth < 3 ? 190 : 235;
    }
  }
  tileCtx.putImageData(pixels, 0, 0);
  const pattern = target.createPattern(tile, 'repeat')!;
  patterns.set(key, pattern);
  return pattern;
}

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
  if (op.erase || crayonVariant === 'flat') {
    paintOpShape(target, op, op.color);
  } else {
    target.globalAlpha = op.deposit ?? 0.72;
    paintOpShape(target, op, grainPattern(target, op.color, op.grain ?? 0));
    target.globalAlpha = 1;
  }
  target.globalCompositeOperation = 'source-over';
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
