// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';
import { crayonPatternFor, getCrayonPasses, getCrayonMix } from './crayonBrush';

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
// deterministic; every op in one pass shares it.
// Crayon ops do not paint the target directly: they accumulate on a per-target
// PASS BUFFER at full opacity, and a 'crayonFlush' op stamps the buffer onto
// the target at (1 - colorMix) — that single stamp is what lets a new pass mix
// slightly with the ink under it (yellow over blue → a little green) without
// the pass ever mixing with its own overlapping per-frame ops. The engine
// records a flush at every pass close (mid-stroke split, pointer lift, resume
// jump), so replay stamps at exactly the live positions in the op order.
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
  | { kind: 'crayonFlush' }
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

// Lay a crayon op down as textured wax: one pass per density band (widest first),
// each filled with the paper-tooth pattern for the op's colour + seed. Opaque
// where wax deposits, transparent in the tooth pits — so overlapping same-colour
// strokes build up coverage without shifting hue (ADR-0065). No-op until the
// tooth tile is buildable (a DOM canvas exists), matching the magic sheet's
// decode-pending skip.
function paintCrayon(
  target: CanvasRenderingContext2D,
  op: Extract<StrokeOp, { kind: 'dot' | 'path' }>
) {
  const seed = op.seed ?? 0;
  const passes = getCrayonPasses();
  target.globalCompositeOperation = 'source-over';
  for (let i = 0; i < passes.length; i++) {
    const pattern = crayonPatternFor(target, op.color, seed, i);
    if (!pattern) continue;
    paintOpShape(target, op, pattern, passes[i].widthScale);
  }
}

// --- Crayon pass buffer ------------------------------------------------------
//
// A deposition pass accumulates on a buffer at FULL opacity (overlapping
// per-frame ops stay idempotent there — binary tooth, same rgb), then one
// 'crayonFlush' stamps the whole buffer onto the target at (1 - colorMix).
// Source-over algebra makes the stamp do exactly the physical thing per pixel:
// over blank paper out_alpha = 1-k (near-opaque pure wax, the paper tinting
// through slightly); over existing ink out = (1-k)·crayon + k·under, at full
// opacity — the crayon-mixing the pass buffer exists for. Mixing ONCE per pass
// is the crux: any per-op mix would compound across the dozens of overlapping
// per-frame ops and cancel itself toward pure crayon colour in the interior.
//
// One buffer per target context. For replay surfaces (baseline, keyframes,
// exports) it is an offscreen canvas allocated on demand (WeakMap — GC'd with
// its target). For the LIVE canvas the engine registers its overlay element's
// context as the buffer, so the open pass is visible under the finger: the
// overlay's CSS opacity is (1 - colorMix), which composites to the same pixels
// the stamp will produce — no snap at pass close.
interface CrayonPassBuffer {
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
  // Device-px bounding box of the open pass's ink, so the stamp and the
  // post-stamp clear touch only the pass-sized rect. Stamping the full canvas
  // per pass turned replay (undo, keyframe builds — one stamp per pass over the
  // whole history) into hundreds of ms of full-canvas blits; the bbox keeps a
  // flush proportional to the pass, not the canvas.
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

const bufferByTarget = new WeakMap<CanvasRenderingContext2D, CrayonPassBuffer>();
let liveTarget: CanvasRenderingContext2D | null = null;
let liveBuffer: CrayonPassBuffer | null = null;

// The engine points the live canvas's buffer at its overlay canvas (null to
// unregister on teardown). The overlay is engine-sized alongside the canvas.
export function setLiveCrayonBuffer(
  target: CanvasRenderingContext2D | null,
  buffer: CanvasRenderingContext2D | null
) {
  liveTarget = buffer ? target : null;
  liveBuffer = buffer ? { ctx: buffer, dirty: false, bounds: null } : null;
}

function crayonBufferFor(target: CanvasRenderingContext2D): CrayonPassBuffer {
  if (target === liveTarget && liveBuffer) return liveBuffer;
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
    buf = { ctx: g, dirty: false, bounds: null };
    bufferByTarget.set(target, buf);
  } else if (buf.ctx.canvas.width !== w || buf.ctx.canvas.height !== h) {
    buf.ctx.canvas.width = w;
    buf.ctx.canvas.height = h;
    buf.ctx.lineCap = 'round';
    buf.ctx.lineJoin = 'round';
    buf.dirty = false;
    buf.bounds = null;
  }
  return buf;
}

function existingBufferFor(target: CanvasRenderingContext2D): CrayonPassBuffer | null {
  if (target === liveTarget && liveBuffer) return liveBuffer;
  return bufferByTarget.get(target) ?? null;
}

// Grow the buffer's device-px bounds by an op's user-space bbox, mapped through
// the transform the op was painted with. Conservative: quadratic/cubic control
// points bound the curve's hull, the pad covers the stroke's half-width plus AA
// bleed, and a transformed rect unions its mapped corners.
function unionCrayonBounds(
  buf: CrayonPassBuffer,
  matrix: DOMMatrix | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pad: number
) {
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  if (matrix && !matrix.isIdentity) {
    const corners = [
      matrix.transformPoint({ x: x0, y: y0 }),
      matrix.transformPoint({ x: x1, y: y0 }),
      matrix.transformPoint({ x: x0, y: y1 }),
      matrix.transformPoint({ x: x1, y: y1 }),
    ];
    x0 = Math.min(...corners.map((p) => p.x));
    y0 = Math.min(...corners.map((p) => p.y));
    x1 = Math.max(...corners.map((p) => p.x));
    y1 = Math.max(...corners.map((p) => p.y));
  }
  const w = buf.ctx.canvas.width;
  const h = buf.ctx.canvas.height;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  const b = buf.bounds;
  if (!b) buf.bounds = { x0, y0, x1, y1 };
  else {
    b.x0 = Math.min(b.x0, x0);
    b.y0 = Math.min(b.y0, y0);
    b.x1 = Math.max(b.x1, x1);
    b.y1 = Math.max(b.y1, y1);
  }
}

function clearCrayonBounds(buf: CrayonPassBuffer) {
  const b = buf.bounds;
  if (b) {
    buf.ctx.save();
    buf.ctx.setTransform(1, 0, 0, 1, 0, 0);
    buf.ctx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    buf.ctx.restore();
  }
  buf.bounds = null;
  buf.dirty = false;
}

// Stamp the target's open pass (if any) at (1 - colorMix) and clear the buffer
// — both restricted to the pass's device-px bounds. Buffer and target share
// backing dimensions, and ops were painted into the buffer through the target's
// own transform, so the blit is a 1:1 rect copy in device space.
export function flushCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  const b = buf.bounds;
  if (b) {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'source-over';
    target.globalAlpha = 1 - getCrayonMix();
    target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);
    target.restore();
  }
  clearCrayonBounds(buf);
}

// Discard the target's open pass without stamping — a 'clear' wipes everything,
// open passes included.
function dropCrayonBuffer(target: CanvasRenderingContext2D) {
  const buf = existingBufferFor(target);
  if (!buf || !buf.dirty) return;
  clearCrayonBounds(buf);
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
// nothing until the sheet has decoded; a crayon op accumulates on the target's
// pass buffer until a 'crayonFlush' stamps it (see the pass-buffer notes
// above); everything else lays down its solid color. Any non-crayon ink op
// flushes an open pass first so compositing order matches the op order.
export function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    dropCrayonBuffer(target);
    clearAllOf(target);
    return;
  }
  if (op.kind === 'crayonFlush') {
    flushCrayonBuffer(target);
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
    const buf = crayonBufferFor(target);
    let matrix: DOMMatrix | null = null;
    if (typeof target.getTransform === 'function') {
      matrix = target.getTransform();
      buf.ctx.setTransform(matrix);
    }
    paintCrayon(buf.ctx, op);
    buf.dirty = true;
    if (op.kind === 'dot') {
      unionCrayonBounds(buf, matrix, op.x, op.y, op.x, op.y, op.radius + 2);
    } else {
      let x0 = op.startX;
      let y0 = op.startY;
      let x1 = op.startX;
      let y1 = op.startY;
      for (const s of op.segs) {
        x0 = Math.min(x0, s.cx, s.x);
        y0 = Math.min(y0, s.cy, s.y);
        x1 = Math.max(x1, s.cx, s.x);
        y1 = Math.max(y1, s.cy, s.y);
        if (s.c2x !== undefined) {
          x0 = Math.min(x0, s.c2x);
          y0 = Math.min(y0, s.c2y!);
          x1 = Math.max(x1, s.c2x);
          y1 = Math.max(y1, s.c2y!);
        }
      }
      unionCrayonBounds(buf, matrix, x0, y0, x1, y1, op.lineWidth / 2 + 2);
    }
    return;
  }
  flushCrayonBuffer(target);
  target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  paintOpShape(target, op, op.color);
  target.globalCompositeOperation = 'source-over';
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
