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
  // A crayon buildup command bakes its whole stroke into a bbox raster once at
  // commit (ADR-0065), so every replay multiply-blits that raster instead of
  // re-rendering the expensive stipple — undo/resize stay cheap. Paper-space
  // origin (x,y); blitted through the target's transform like a keyframe.
  buildupRaster?: { canvas: HTMLCanvasElement; x: number; y: number } | null;
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

// A command is a "buildup" unit when its drawing ops are the crayon brush and not
// erasing: the whole command composites onto the canvas with `multiply`, so a NEW
// crayon stroke over existing ink DARKENS it (wax buildup, ADR-0065). A command is
// homogeneous in brush (the brush can't change mid-gesture), so the first drawing
// op decides. Crucially this is per-command, not per-op: rendering a single
// stroke's many per-frame ops into a buffer FIRST (below) then multiplying once
// means the stroke never self-darkens at its op joints — which would otherwise
// re-create the periodic-bead artifact the crayon redesign fixed.
export function commandIsBuildup(ops: StrokeOp[]): boolean {
  for (const op of ops) {
    if (op.kind === 'clear') continue;
    return op.brush === 'crayon' && !op.erase;
  }
  return false;
}

// The device-space rectangle a command's ops cover (under `m`, the target's
// current transform), padded for the crayon grain + clamped to the canvas — so
// the buffer compositing below only touches the strokes' region, not the whole
// canvas. Null when the command has no drawable ops.
function commandDeviceRect(ops: StrokeOp[], m: DOMMatrix, cw: number, ch: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ext = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  };
  for (const op of ops) {
    if (op.kind === 'dot') ext(op.x, op.y, op.radius + 5);
    else if (op.kind === 'path') {
      const r = op.lineWidth / 2 + 5;
      ext(op.startX, op.startY, r);
      for (const s of op.segs) {
        ext(s.cx, s.cy, r);
        ext(s.x, s.y, r);
        if (s.c2x !== undefined) ext(s.c2x, s.c2y!, r);
      }
    }
  }
  if (maxX < minX) return null;
  let dminX = Infinity;
  let dminY = Infinity;
  let dmaxX = -Infinity;
  let dmaxY = -Infinity;
  for (const [px, py] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ]) {
    const dx = m.a * px + m.c * py + m.e;
    const dy = m.b * px + m.d * py + m.f;
    if (dx < dminX) dminX = dx;
    if (dx > dmaxX) dmaxX = dx;
    if (dy < dminY) dminY = dy;
    if (dy > dmaxY) dmaxY = dy;
  }
  const x = Math.max(0, Math.floor(dminX));
  const y = Math.max(0, Math.floor(dminY));
  const w = Math.min(cw, Math.ceil(dmaxX)) - x;
  const h = Math.min(ch, Math.ceil(dmaxY)) - y;
  return w <= 0 || h <= 0 ? null : { x, y, w, h };
}

// One shared buffer for buildup compositing, allocated lazily (SSR-safety).
let cmdBuf: HTMLCanvasElement | null = null;
let cmdBufCtx: CanvasRenderingContext2D | null = null;

// Paper-space bbox of a command's ops (no transform), padded for the grain.
function opsPaperBounds(ops: StrokeOp[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ext = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  };
  for (const op of ops) {
    if (op.kind === 'dot') ext(op.x, op.y, op.radius + 5);
    else if (op.kind === 'path') {
      const r = op.lineWidth / 2 + 5;
      ext(op.startX, op.startY, r);
      for (const s of op.segs) {
        ext(s.cx, s.cy, r);
        ext(s.x, s.y, r);
        if (s.c2x !== undefined) ext(s.c2x, s.c2y!, r);
      }
    }
  }
  if (maxX < minX) return null;
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  return { x, y, w: Math.ceil(maxX) - x, h: Math.ceil(maxY) - y };
}

// Bake a buildup command's whole stroke into a bbox raster (paper coords, full
// opacity) once at commit, so replay multiply-blits it instead of re-rendering
// the stipple. Origin is the paper-space bbox corner; the raster blits through
// the target's transform (like a keyframe).
export function bakeBuildupRaster(ops: StrokeOp[]) {
  const b = opsPaperBounds(ops);
  if (!b || b.w <= 0 || b.h <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = b.w;
  canvas.height = b.h;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.translate(-b.x, -b.y);
  for (const op of ops) renderOp(c, op);
  return { canvas, x: b.x, y: b.y };
}

// Render one command onto a target — the single entry point every replay path
// uses (undoHistory, export, live settle). A normal command renders op-by-op
// through renderOp (identical to before). A crayon BUILDUP command multiply-blits
// its pre-baked stroke raster (so it darkens whatever earlier commands laid down
// without self-darkening at op joints), falling back to a live buffer render if
// the raster is somehow absent.
export function renderCommand(target: CanvasRenderingContext2D, cmd: StrokeGroupCommand) {
  if (cmd.buildupRaster) {
    target.globalCompositeOperation = 'multiply';
    target.globalAlpha = 1;
    target.drawImage(cmd.buildupRaster.canvas, cmd.buildupRaster.x, cmd.buildupRaster.y);
    target.globalCompositeOperation = 'source-over';
    return;
  }
  renderCommandOps(target, cmd.ops);
}

// Fallback buffer path for a buildup command with no baked raster: render its ops
// into a scratch buffer at full opacity, then multiply that region onto the
// target. Also the non-buildup path (op-by-op renderOp).
export function renderCommandOps(target: CanvasRenderingContext2D, ops: StrokeOp[]) {
  if (ops.length === 0) return;
  if (!commandIsBuildup(ops)) {
    for (const op of ops) renderOp(target, op);
    return;
  }
  const cw = target.canvas.width;
  const ch = target.canvas.height;
  const m = target.getTransform();
  const rect = commandDeviceRect(ops, m, cw, ch);
  if (!rect) return;
  if (!cmdBuf) {
    cmdBuf = document.createElement('canvas');
    cmdBufCtx = cmdBuf.getContext('2d');
  }
  if (!cmdBufCtx || !cmdBuf) return;
  if (cmdBuf.width < cw) cmdBuf.width = cw;
  if (cmdBuf.height < ch) cmdBuf.height = ch;
  const b = cmdBufCtx;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  b.clearRect(rect.x, rect.y, rect.w, rect.h);
  b.setTransform(m);
  b.lineCap = 'round';
  b.lineJoin = 'round';
  for (const op of ops) renderOp(b, op);
  b.setTransform(1, 0, 0, 1, 0, 0);
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'multiply';
  target.globalAlpha = 1;
  target.drawImage(cmdBuf, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  target.restore();
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
