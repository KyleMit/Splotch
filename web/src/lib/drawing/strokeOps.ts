// The engine's op vocabulary and its single renderer. Undo history is a log of
// replayable draw ops, not pixel snapshots (ADR-0033): live rendering paints an
// op and records it, and undo/resize/export replay the same ops through the
// same renderOp() so every surface is bit-identical.

import type { PathSeg } from './strokeSimplify';
import { sheetPatternFor } from './magicBrush';
import { crayonPattern } from './crayonBrush';

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
      crayon?: boolean;
      textureSeed?: number;
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
      textureSeed?: number;
    }
  | { kind: 'clear' };

export type PathOp = Extract<StrokeOp, { kind: 'path' }>;
export type DrawOp = Extract<StrokeOp, { kind: 'dot' | 'path' }>;

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
  const paint = op.crayon ? crayonPattern(target, op.color, op.textureSeed ?? 0) : op.color;
  if (paint) paintOpShape(target, op, paint);
  target.globalCompositeOperation = 'source-over';
}

// ── crayon: one non-accumulating layer per stroke-group ─────────────────────
//
// Crayon ink is a semi-transparent wax texture, and a single stroke is recorded
// as many overlapping ops (a start dot plus one path op per pointermove frame).
// Compositing those ops individually with source-over darkens every overlap, so
// a stroke's alpha depends on how many ops it was split into — and commit-time
// simplification (ADR-0036) collapses that count, so the same stroke replayed
// for undo/resize came out ~20% lighter than it drew (a visible fade/shift).
//
// The fix makes a stroke's pixels independent of its op count: build the whole
// group's coverage opaquely first (an idempotent union — overlapping opaque
// shapes just re-cover the same pixels) and stamp the wax texture through it
// once. Separate stroke-groups still composite over each other, so wax buildup
// across passes is preserved. Live drawing uses the same union via an
// incremental coverage layer (see the CrayonLive* API below), so what the child
// sees while drawing is bit-identical to every later replay.

const OPAQUE_COVERAGE = '#000';

// Device-space scratch surfaces, reused across calls and grown to fit the
// largest target (the visible viewport, or the larger max(w,h) baseline square).
let coverageScratch: HTMLCanvasElement | null = null;
let textureScratch: HTMLCanvasElement | null = null;

function fitScratch(existing: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const cv = existing ?? document.createElement('canvas');
  if (cv.width < w) cv.width = w;
  if (cv.height < h) cv.height = h;
  return cv;
}

function isLayerableCrayon(op: StrokeOp): op is DrawOp {
  return op.kind !== 'clear' && !!op.crayon && !op.erase && !op.magic;
}

// Paint a run of crayon ops that share a texture (one finger's sub-stroke) as a
// single layer onto `target`: union their shapes opaquely into the coverage
// scratch (in the target's coordinate space), clip the wax pattern to that
// coverage, then composite the result over whatever the target already holds.
function stampCrayonRun(
  target: CanvasRenderingContext2D,
  ops: DrawOp[],
  color: string,
  seed: number
) {
  const w = target.canvas.width;
  const h = target.canvas.height;
  const m = target.getTransform();
  const rect = crayonRunRect(ops, m, w, h);
  if (rect.w === 0 || rect.h === 0) return;
  coverageScratch = fitScratch(coverageScratch, w, h);
  textureScratch = fitScratch(textureScratch, w, h);
  const coverageCtx = coverageScratch.getContext('2d')!;
  const textureCtx = textureScratch.getContext('2d')!;

  coverageCtx.save();
  coverageCtx.setTransform(1, 0, 0, 1, 0, 0);
  coverageCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
  coverageCtx.restore();
  coverageCtx.save();
  coverageCtx.setTransform(m);
  coverageCtx.lineCap = 'round';
  coverageCtx.lineJoin = 'round';
  coverageCtx.globalCompositeOperation = 'source-over';
  for (const op of ops) paintOpShape(coverageCtx, op, OPAQUE_COVERAGE);
  coverageCtx.restore();

  buildCrayonTexture(textureCtx, coverageScratch, color, seed, rect.x, rect.y, rect.w, rect.h);

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'source-over';
  target.drawImage(textureScratch, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  target.restore();
}

// Clip the wax pattern to a coverage mask, within the given device rect, leaving
// the result in `textureCtx`. The pattern is device-anchored (identity), which
// matches the coverage's own space and keeps the tiling stable across the
// visible canvas and the baseline square (paper coordinates in the common
// upright view).
function buildCrayonTexture(
  textureCtx: CanvasRenderingContext2D,
  coverage: HTMLCanvasElement,
  color: string,
  seed: number,
  x: number,
  y: number,
  w: number,
  h: number
) {
  textureCtx.save();
  textureCtx.setTransform(1, 0, 0, 1, 0, 0);
  // Clip to the dirty rect: 'source-in' otherwise clears the whole canvas
  // outside the fill (a full-canvas cost, and it would wipe unrelated scratch),
  // so confine every step to the rect we actually stamp.
  textureCtx.beginPath();
  textureCtx.rect(x, y, w, h);
  textureCtx.clip();
  textureCtx.clearRect(x, y, w, h);
  textureCtx.globalCompositeOperation = 'source-over';
  textureCtx.drawImage(coverage, x, y, w, h, x, y, w, h);
  const pattern = crayonPattern(textureCtx, color, seed);
  if (pattern) {
    textureCtx.globalCompositeOperation = 'source-in';
    textureCtx.fillStyle = pattern;
    textureCtx.fillRect(x, y, w, h);
  }
  textureCtx.globalCompositeOperation = 'source-over';
  textureCtx.restore();
}

// Render one stroke-group command onto a target (undo/resize/keyframe replay).
// Crayon groups composite as one non-accumulating layer per texture; everything
// else falls through to the per-op renderer unchanged. A command mixing crayon
// with other ops (only a mid-stroke tool flip) also takes the per-op path — its
// z-order matters more than the rare, transient overlap fade.
export function renderCommand(target: CanvasRenderingContext2D, ops: StrokeOp[]) {
  let allCrayon = ops.length > 0;
  for (const op of ops) {
    if (!isLayerableCrayon(op)) {
      allCrayon = false;
      break;
    }
  }
  if (!allCrayon) {
    for (const op of ops) renderOp(target, op);
    return;
  }
  // Group by texture seed so each finger's sub-stroke is its own layer; two
  // fingers crossing then build up (separate composites) instead of unioning.
  const groups = new Map<number, DrawOp[]>();
  for (const op of ops) {
    if (!isLayerableCrayon(op)) continue;
    const seed = op.textureSeed ?? 0;
    const existing = groups.get(seed);
    if (existing) existing.push(op);
    else groups.set(seed, [op]);
  }
  for (const [seed, groupOps] of groups) {
    stampCrayonRun(target, groupOps, groupOps[0].color, seed);
  }
}

// ── crayon live layer ───────────────────────────────────────────────────────
//
// Live drawing can't buffer the whole stroke — ink must appear under the moving
// finger — so it keeps a persistent per-seed coverage layer and, each frame,
// recomposites only the new op's dirty rect as (committed snapshot + every
// seed's wax texture). Because the coverage layers hold the full union, that
// rect ends up identical to what renderCommand() paints on replay: same union,
// same single texture stamp, no per-op alpha buildup.

interface CrayonSeedLayer {
  coverage: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  color: string;
}

let liveActive = false;
let liveSnapshot: HTMLCanvasElement | null = null;
const liveSeeds = new Map<number, CrayonSeedLayer>();
// Coverage canvases are pooled and reused across strokes — a toddler draws many
// strokes a minute, and a fresh full-canvas allocation each time would churn GC.
const coveragePool: CrayonSeedLayer[] = [];
let coverageUsed = 0;

export function crayonLiveActive(): boolean {
  return liveActive;
}

function acquireCoverage(w: number, h: number, color: string): CrayonSeedLayer {
  let layer = coveragePool[coverageUsed];
  if (!layer) {
    const coverage = document.createElement('canvas');
    layer = { coverage, ctx: coverage.getContext('2d')!, color };
    coveragePool[coverageUsed] = layer;
  }
  coverageUsed++;
  layer.color = color;
  if (layer.coverage.width < w) layer.coverage.width = w;
  if (layer.coverage.height < h) layer.coverage.height = h;
  layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  layer.ctx.clearRect(0, 0, layer.coverage.width, layer.coverage.height);
  layer.ctx.lineCap = 'round';
  layer.ctx.lineJoin = 'round';
  return layer;
}

// Snapshot the committed background the wet stroke sits on (the target currently
// shows exactly that — the group hasn't painted yet) and start fresh coverage.
export function beginCrayonLive(target: CanvasRenderingContext2D) {
  const w = target.canvas.width;
  const h = target.canvas.height;
  if (!liveSnapshot) liveSnapshot = document.createElement('canvas');
  liveSnapshot.width = w;
  liveSnapshot.height = h;
  const sctx = liveSnapshot.getContext('2d')!;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(target.canvas, 0, 0);
  liveSeeds.clear();
  coverageUsed = 0;
  liveActive = true;
}

// Rebuild the wet-stroke background from the target's current pixels (after a
// mid-stroke resize/clear rebuilt the canvas). Coverage restarts from here;
// the already-drawn part of the stroke is baked into the fresh snapshot.
export function invalidateCrayonLive(target: CanvasRenderingContext2D) {
  if (!liveActive) return;
  beginCrayonLive(target);
}

export function endCrayonLive() {
  liveActive = false;
  liveSeeds.clear();
}

function mapPoint(m: DOMMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

// Device-space bounding rect covering a run of crayon ops, padded for the round
// cap/join and clamped to the target. Keeps both the live per-frame recomposite
// and the replay stamp proportional to the stroke, not the whole canvas.
function crayonRunRect(ops: DrawOp[], m: DOMMatrix, w: number, h: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pad = 0;
  const add = (px: number, py: number) => {
    const p = mapPoint(m, px, py);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const op of ops) {
    pad = Math.max(pad, (op.kind === 'dot' ? op.radius : op.lineWidth / 2) + 2);
    if (op.kind === 'dot') {
      add(op.x, op.y);
    } else {
      add(op.startX, op.startY);
      for (const s of op.segs) {
        add(s.cx, s.cy);
        add(s.x, s.y);
        if (s.c2x !== undefined) add(s.c2x, s.c2y!);
      }
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) || 1;
  const devPad = pad * scale;
  const x = Math.max(0, Math.floor(minX - devPad));
  const y = Math.max(0, Math.floor(minY - devPad));
  const right = Math.min(w, Math.ceil(maxX + devPad));
  const bottom = Math.min(h, Math.ceil(maxY + devPad));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

// Add one op to its seed's union coverage and recomposite its dirty rect on the
// visible ctx as committed snapshot + every seed's wax texture.
export function addCrayonLiveOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (!liveActive || !isLayerableCrayon(op)) return;
  const w = target.canvas.width;
  const h = target.canvas.height;
  const seed = op.textureSeed ?? 0;
  let layer = liveSeeds.get(seed);
  if (!layer) {
    layer = acquireCoverage(w, h, op.color);
    liveSeeds.set(seed, layer);
  }
  const m = target.getTransform();
  layer.ctx.save();
  layer.ctx.setTransform(m);
  layer.ctx.globalCompositeOperation = 'source-over';
  paintOpShape(layer.ctx, op, OPAQUE_COVERAGE);
  layer.ctx.restore();

  const rect = crayonRunRect([op], m, w, h);
  if (rect.w === 0 || rect.h === 0) return;
  textureScratch = fitScratch(textureScratch, w, h);
  const textureCtx = textureScratch.getContext('2d')!;

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'source-over';
  target.clearRect(rect.x, rect.y, rect.w, rect.h);
  if (liveSnapshot) {
    target.drawImage(liveSnapshot, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  }
  for (const [seedKey, seedLayer] of liveSeeds) {
    buildCrayonTexture(
      textureCtx,
      seedLayer.coverage,
      seedLayer.color,
      seedKey,
      rect.x,
      rect.y,
      rect.w,
      rect.h
    );
    target.drawImage(
      textureScratch,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      rect.x,
      rect.y,
      rect.w,
      rect.h
    );
  }
  target.restore();
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger (ADR-0035), measured after simplification.
export function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}
