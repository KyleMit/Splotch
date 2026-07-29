// The engine's op vocabulary and its single renderer. Live rendering paints an
// op onto the visible canvas and records it; the commit fold paints the same
// ops through the same renderOp() onto the paper raster (ADR-0066), so the
// committed pixels are bit-identical to what the child saw live. Closed crayon
// passes are the carve-out that retires that re-render: they travel as
// 'crayonPassRaster' ops — pixels captured once from the live paper-space
// accumulation — so folding them is a blit, and crayon texture is free to stop
// being deterministic. The pass buffer those ops come from lives in
// crayonPassBuffer.ts; renderOp only dispatches into it.

import { sheetPatternFor } from './magicBrush';
import { paintOpShape } from './opGeometry';
import {
  flushCrayonBuffer,
  renderCrayonOp,
  resetCrayonStateForClear,
  stampSubtractiveGlaze,
} from './crayonPassBuffer';

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
// build up (fill tooth) at a constant hue. `seed` is stored so the commit fold
// matches the live render; every op in one pass shares it.
// Crayon ops do not paint the target directly: they accumulate on a per-target
// PASS BUFFER at full opacity, and a 'crayonFlush' op stamps the buffer onto
// the target as a subtractive glaze (see crayonPassBuffer.ts) — that single
// stamp is what lets a new pass mix slightly with the ink under it
// (blue over yellow → green) without the pass ever mixing with its own
// overlapping per-frame ops.
// A 'crayonPassRaster' op is a CLOSED pass, carried as its prerendered
// paper-space pixels instead of its dot/path ops: at pass close the engine
// crops the live paper-space accumulation buffer and swaps the pass's recorded
// ops for one raster op (replaceOpenCrayonPassOps). Rendering it is the same
// two-blit subtractive stamp a flush performs, but from pixels that were
// painted exactly once, live — so the commit fold, repaints, snapshot pending
// replay, and export all BLIT the pass rather than re-rendering its pattern
// fills. This is what frees brush texture from the live-equals-fold
// determinism contract (ADR-0066): there is no re-render left that must
// reproduce the live pixels.
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
      crayon?: boolean;
      seed?: number;
    }
  | { kind: 'crayonFlush' }
  // x/y = the raster's top-left in paper coordinates (canvas dims are its
  // size). `mix` is the glaze strength captured at pass close, so the stamp
  // the fold/repaint performs matches the live preview even if the dev
  // harness's setCrayonParams changes colorMix before the raster renders.
  | { kind: 'crayonPassRaster'; canvas: HTMLCanvasElement; x: number; y: number; mix: number }
  | { kind: 'clear' };

export type PathOp = Extract<StrokeOp, { kind: 'path' }>;
export type DotOp = Extract<StrokeOp, { kind: 'dot' }>;
export type CrayonPassRasterOp = Extract<StrokeOp, { kind: 'crayonPassRaster' }>;

// One stroke-group (all fingers down together) = one undo unit. `wasEmpty` is
// the canvas-empty state before the group drew, so undo can restore the flag
// without re-scanning.
export interface StrokeGroupCommand {
  ops: StrokeOp[];
  wasEmpty: boolean;
}

// Clear everything a target could be showing. The visible ctx's user space is
// PAPER coordinates whenever the paper view is active — and with the margins
// drawable, ink can sit at negative paper coordinates that a rect from (0,0)
// would miss — so clear in device space. Identity targets (the paper raster,
// exports) are unaffected: device space is their own space.
export function clearAllOf(target: CanvasRenderingContext2D) {
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.restore();
}

// Paint one recorded op onto a target context. Used both live (target = the
// visible ctx) and by the commit fold / repaint paths (target = the paper
// raster, the visible canvas, or an export surface). Erasing composites
// destination-out; a magic op reveals the color
// sheet (source-over, its shape filled with the sheet pattern) and paints
// nothing until the sheet has decoded; a crayon op accumulates on the target's
// pass buffer until a 'crayonFlush' stamps it (see crayonPassBuffer.ts);
// everything else lays down its solid color. Any non-crayon ink op
// flushes an open pass first so compositing order matches the op order.
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
  if (op.kind === 'crayonPassRaster') {
    // A closed pass, stamped from its live-captured pixels: the same two-blit
    // subtractive glaze flushCrayonBuffer performs (see crayonPassBuffer.ts),
    // drawn in user space at the raster's paper position so the target's own
    // transform places it — identity on the paper/fold surfaces, the paper
    // view on the visible canvas. The glaze strength is the op's CAPTURED mix,
    // not the current option, so the stamp matches the live preview even if
    // the dev harness changed colorMix since the pass closed.
    flushCrayonBuffer(target);
    stampSubtractiveGlaze(target, op.mix, () => {
      target.drawImage(op.canvas, op.x, op.y);
    });
    return;
  }
  if (op.magic) {
    flushCrayonBuffer(target);
    const pattern = sheetPatternFor(target);
    if (!pattern) return;
    target.globalCompositeOperation = 'source-over';
    paintOpShape(target, op, pattern);
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
}
