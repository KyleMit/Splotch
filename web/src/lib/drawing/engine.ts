// Imperative drawing engine. Owns the <canvas>, the undo baseline + command
// log, and the pointer tracking. Svelte components mount this on
// onMount and adapt reactive state (active color, stroke width) by calling
// setColor() / setStrokeWidth() from $effect.

import { ERASER_SIZE_MULTIPLIER } from '$lib/state/strokeWidth.svelte';
import {
  calculateStrokeSpeed,
  edgeSwipeIsOsGesture,
  edgeSwipeDirectionDecided,
  guardedEdgeAt,
  pointerWasResumed,
  type GuardEdge,
} from './strokeMath';
import { sampleReducedSpans, splineReducedSpans, type PathSeg } from './strokeSimplify';

// Build-flag-gated user-timing marks on the drawing hot paths, read by the
// profiling harness (scripts/perf/). __PERF_MARKS__ is a compile-time literal
// (false unless built with PERF_MARKS=true), so every `if (PERF_MARKS)` block —
// including its mark/measure name strings — dead-code-eliminates in production.
const PERF_MARKS = typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__;

interface DrawSoundData {
  speed: number;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  midX: number;
  midY: number;
  startX: number;
  startY: number;
  isDrawing: boolean;
  color: string;
  lineWidth: number;
  erase: boolean;
  lastTime: number;
  speedSamples: { t: number; distance: number }[];
  // Non-null while a touch that began in a guarded edge's gesture band hasn't
  // decided its direction yet: render nothing and buffer its points until it
  // either commits (any non-inward movement, or a stationary tap on lift) or is
  // discarded as an OS edge-swipe (an inward flick). See EDGE_SWIPE_* below.
  edgeSwipeGuard: GuardEdge | null;
  pendingPoints: { x: number; y: number }[];
}

// Undo history is a log of replayable draw ops, not pixel snapshots. Each op is
// captured at the exact granularity it was rendered (one path op per
// strokeSmoothSegments call, one dot op per stroke start). Live rendering is
// bit-identical to its op; the stored ops are then simplified once at commit
// (ADR-0036) so replay re-strokes far fewer segments without a visible change. A
// 'clear' op wipes the target. See ADR-0033.
type StrokeOp =
  | { kind: 'dot'; x: number; y: number; radius: number; color: string; erase: boolean }
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
    }
  | { kind: 'clear' };

// One stroke-group (all fingers down together) = one undo unit. `wasEmpty` is
// the canvas-empty state before the group drew, so undo can restore the flag
// without re-scanning. `keyframe`, when set, is a cumulative square raster of
// the whole drawing *through this command* (replacing its now-dropped `ops`):
// any command whose op list grew past OP_KEYFRAME_THRESHOLD is collapsed to a
// keyframe so rebuilds blit it instead of re-stroking thousands of ops. See
// ADR-0035.
interface StrokeGroupCommand {
  ops: StrokeOp[];
  wasEmpty: boolean;
  keyframe?: HTMLCanvasElement | null;
}

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface InitOptions {
  onDrawSound?: ((data: DrawSoundData) => void) | null;
  onDrawStop?: (() => void) | null;
  onUndoStateChange?: ((canUndo: boolean) => void) | null;
  onCanvasEmptyChange?: ((empty: boolean) => void) | null;
  onStrokeEnd?: (() => void) | null;
  initialColor?: string;
}

interface ExportOptions {
  includePaperTexture?: boolean;
}

// Set in initDrawingCanvas() before any handler runs (definite-assignment `!`).
let canvas!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let currentColor = '';
let currentLineWidth = 8;
let eraserActive = false;
let lastColorChangeTime = 0;
const activePointerIds = new Set<number>();
const activePointers = new Map<number, PointerState>();
let onDrawSoundCallback: ((data: DrawSoundData) => void) | null = null;
let onDrawStopCallback: (() => void) | null = null;

// The undo baseline: one offscreen raster (a max(w,h) square) holding
// the state from before the oldest retained command. Undo = redraw this, then
// replay the surviving command log on top. A single raster replaces the old
// stack of MAX_UNDO_STACK_SIZE full-canvas snapshots (ADR-0033).
let baselineCanvas: HTMLCanvasElement | null = null;
let baselineCtx: CanvasRenderingContext2D | null = null;

// Strokes rasterize at the device pixel ratio so they stay crisp on mobile
// screens, capped at 2× — DPR-3 panels would cost 9× the pixels for detail a
// finger-drawn stroke can't use (see ADR 0015). Fixed for the session at init:
// a mid-session DPR change (desktop zoom, monitor move) would otherwise need
// every pixel surface (visible canvas, baseline) rescaled in place.
const MAX_RENDER_SCALE = 2;
let renderScale = 1;

// Cached canvas geometry so the pointer hot path never calls
// getBoundingClientRect() (each call forces a synchronous reflow). Recomputed
// only on resize/scroll/orientation change — see refreshCanvasRect().
let canvasRect: CanvasRect = { left: 0, top: 0, width: 0, height: 0 };
let rectScaleX = 1;
let rectScaleY = 1;

// The retained command log; commands older than this fold into the baseline.
const commandLog: StrokeGroupCommand[] = [];
const MAX_UNDO_STACK_SIZE = 10;

// Keyframe safety net (ADR-0035, now downstream of ADR-0036 simplification).
// Simplification already collapses a normal long scribble to tens of segments,
// so the common case stays cheap replayable ops. A pathological high-detail
// gesture (a finger held down for a minute, every frame a real direction change)
// can still leave more segments than we want to re-stroke on every undo, so a
// command whose *simplified* segment total passes this bound is baked into a
// cumulative raster keyframe (once, at commit, off the draw frame) and its ops
// dropped — keeping worst-case undo at one drawImage blit. Set well above the
// segment counts real drawing produces (peak ~140 in profiled sessions) so it
// fires only for genuine outliers. Mutable so the profiling harness can raise it
// to Infinity to isolate pure-simplification fidelity (see setSimplifyParams).
let keyframeSegmentThreshold = 384;
// The stroke group currently being drawn (set on first paint, pushed to the log
// when the last finger lifts), so a multi-touch gesture undoes as a single unit.
let activeCommand: StrokeGroupCommand | null = null;
let canUndo = false;
let onUndoStateChange: ((canUndo: boolean) => void) | null = null;

let canvasEmpty = true;
let onCanvasEmptyChange: ((empty: boolean) => void) | null = null;
let onStrokeEnd: (() => void) | null = null;

// Pointer speed (which drives the drawing sound) is averaged over the most
// recent slice of the stroke so the audio cue tracks gesture speed without
// reacting to every per-frame jitter.
const SPEED_WINDOW_MS = 100;

// After a color/tool change, ignore touch/mouse pointerdowns for a short window
// so the tap that picked the color doesn't immediately start a stray stroke.
// Pen input is precise enough to skip the debounce.
const COLOR_CHANGE_DEBOUNCE_MS = 100;

// iOS/WebKit can silently merge a fast tap-then-drag into one pointer stream: it
// drops the intervening pointerup + pointerdown and resumes the SAME pointerId
// at the new spot, with no coalesced samples bridging the gap. draw() then
// curves from the old position to the resumed one — a stray straight line
// joining what should be two separate strokes. A long idle gap AND a jump too
// large for continuous contact together mean the finger really lifted, so the
// stroke is restarted at the resumed point. The gap/jump thresholds and the
// decision predicate live in ./strokeMath (pointerWasResumed).

// The iPad/Android system gesture for the home/menu bar is a swipe inward from
// the device's physical-bottom edge, so a touch starting in that edge's gesture
// band is probably not a stroke. Such a touch is buffered, not drawn, until it
// has travelled EDGE_SWIPE_DECISION_PX: a swipe inward (perpendicular to the
// edge, within ~45°) is the system gesture and is discarded; any other
// direction — or a stationary tap — commits as a normal stroke. Which edges to
// guard is driven by orientation (always available, so this works even where
// the OS exposes no safe-area insets): the bottom in portrait, and both short
// side edges in landscape — a phone's physical bottom rotates to a short edge.
// A tablet instead keeps its home indicator on the long bottom in landscape, so
// that edge is additionally guarded, but only when the OS reports an inset there
// (so we don't suppress ordinary strokes along a phone's long bottom). The top
// edge is never guarded. Only touch input is affected; pen and mouse never
// trigger the gesture. Children who want to draw at a guarded edge draw away.
// The band/decision/inset thresholds and the geometry live in ./strokeMath.

// OS safe-area insets in CSS px, pushed from the canvas's owner component. Used
// only to additionally guard a tablet's long bottom edge in landscape (above).
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// One undo snapshot + one empty-state flip per stroke group (all fingers down
// together). Set the first time the group paints a pixel — deferred so a
// buffered edge-swipe candidate that's later discarded never pollutes the undo
// stack or the empty flag. Reset when the last finger lifts.
let groupHasDrawn = false;

function setCanvasEmptyState(empty: boolean) {
  if (canvasEmpty === empty) return;
  canvasEmpty = empty;
  if (onCanvasEmptyChange) onCanvasEmptyChange(empty);
}

// Emptiness is scanned on a small CPU-side scratch canvas instead of the main
// canvas: reading the (GPU-backed) main canvas directly would either force a
// slow readback or require willReadFrequently, which de-accelerates every
// stroke. Downscaling shrinks the pixel loop ~16× and the drawImage stays
// GPU→GPU until the tiny scratch readback.
const EMPTY_SCAN_SCALE = 0.25;
// Downscale rounding can smear residue to near-zero alpha; anything below this
// counts as empty.
const EMPTY_SCAN_ALPHA_THRESHOLD = 4;
let emptyScanCanvas: HTMLCanvasElement | null = null;
let emptyScanCtx: CanvasRenderingContext2D | null = null;

function scanCanvasIsEmpty(): boolean {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return true;
  if (PERF_MARKS) performance.mark('engine.scanEmpty:start');
  if (!emptyScanCanvas) {
    emptyScanCanvas = document.createElement('canvas');
    emptyScanCtx = emptyScanCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!emptyScanCtx) return true;
  // Scan relative to CSS pixels so the readback loop stays the same size
  // regardless of renderScale.
  const w = Math.max(1, Math.ceil((canvas.width * EMPTY_SCAN_SCALE) / renderScale));
  const h = Math.max(1, Math.ceil((canvas.height * EMPTY_SCAN_SCALE) / renderScale));
  if (emptyScanCanvas.width !== w || emptyScanCanvas.height !== h) {
    emptyScanCanvas.width = w;
    emptyScanCanvas.height = h;
  } else {
    emptyScanCtx.clearRect(0, 0, w, h);
  }
  emptyScanCtx.drawImage(canvas, 0, 0, w, h);
  const { data } = emptyScanCtx.getImageData(0, 0, w, h);
  let empty = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= EMPTY_SCAN_ALPHA_THRESHOLD) {
      empty = false;
      break;
    }
  }
  if (PERF_MARKS) performance.measure('engine.scanEmpty', 'engine.scanEmpty:start');
  return empty;
}

// The undo baseline grew beyond its current size (e.g. a desktop window
// stretched larger). Grow it and copy existing
// pixels so no drawing is lost. The fold path strokes onto the baseline, so the
// fresh context inherits the round line cap/join.
function growCanvas(
  existing: HTMLCanvasElement,
  newW: number,
  newH: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const grown = document.createElement('canvas');
  grown.width = newW;
  grown.height = newH;
  const grownCtx = grown.getContext('2d');
  if (grownCtx) {
    grownCtx.lineCap = 'round';
    grownCtx.lineJoin = 'round';
    grownCtx.drawImage(existing, 0, 0);
  }
  return { canvas: grown, ctx: grownCtx };
}

function resizeCanvas() {
  if (PERF_MARKS) performance.mark('engine.resize:start');
  const rect = canvas.getBoundingClientRect();

  // The baseline is a max(w,h) square so it covers both orientations and
  // rotation never loses pixels; anything larger (e.g. a resized desktop window)
  // goes through the grow path. Replayed ops use its coordinates, and content
  // off the current (rotated) viewport survives here even though the visible
  // canvas clips it.
  const squareSide = Math.ceil(Math.max(rect.width, rect.height) * renderScale);
  if (!baselineCanvas) {
    baselineCanvas = document.createElement('canvas');
    baselineCanvas.width = squareSide;
    baselineCanvas.height = squareSide;
    baselineCtx = baselineCanvas.getContext('2d');
    if (baselineCtx) {
      baselineCtx.lineCap = 'round';
      baselineCtx.lineJoin = 'round';
    }
  } else if (squareSide > baselineCanvas.width || squareSide > baselineCanvas.height) {
    const newW = Math.max(squareSide, baselineCanvas.width);
    const newH = Math.max(squareSide, baselineCanvas.height);
    ({ canvas: baselineCanvas, ctx: baselineCtx } = growCanvas(baselineCanvas, newW, newH));
  }

  // Resizing the backing store wipes the visible canvas and resets its context
  // state, so re-arm the round caps and repaint from the baseline + command log.
  canvas.width = Math.round(rect.width * renderScale);
  canvas.height = Math.round(rect.height * renderScale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  rebuildFromBaseline();

  refreshCanvasRect();

  if (PERF_MARKS) performance.measure('engine.resize', 'engine.resize:start');
}

// Snapshot the canvas's client rect and the backing-pixel scale factors. Called
// only off the hot path (resize/scroll/orientation), so the per-pointermove
// pointerToCanvas() can stay reflow-free.
function refreshCanvasRect() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  rectScaleX = rect.width ? canvas.width / rect.width : 1;
  rectScaleY = rect.height ? canvas.height / rect.height : 1;
}

function pointerToCanvas(e: PointerEvent) {
  return {
    x: (e.clientX - canvasRect.left) * rectScaleX,
    y: (e.clientY - canvasRect.top) * rectScaleY,
  };
}

// The cached canvas client rect, so components can position pointer-following
// UI (e.g. the eraser cursor) without their own per-move getBoundingClientRect.
export function getCanvasRect(): CanvasRect {
  return canvasRect;
}

// Paint one recorded op onto a target context. Used both live (target = the
// visible ctx) and during undo/resize replay (target = the visible or baseline
// surface). Erasing composites destination-out; everything else source-over.
function renderOp(target: CanvasRenderingContext2D, op: StrokeOp) {
  if (op.kind === 'clear') {
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    return;
  }
  target.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
  if (op.kind === 'dot') {
    target.fillStyle = op.color;
    target.beginPath();
    target.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    target.fill();
  } else {
    target.strokeStyle = op.color;
    target.lineWidth = op.lineWidth;
    target.beginPath();
    target.moveTo(op.startX, op.startY);
    for (const s of op.segs) {
      if (s.c2x !== undefined) target.bezierCurveTo(s.cx, s.cy, s.c2x, s.c2y!, s.x, s.y);
      else target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
  target.globalCompositeOperation = 'source-over';
}

// Append an op to the active stroke-group command so it can be replayed for
// undo. No-op between groups (activeCommand is null).
function recordOp(op: StrokeOp) {
  if (activeCommand) activeCommand.ops.push(op);
}

// --- Stroke simplification (ADR-0036) ---
// A finger drawing records one path op per frame, so a single stroke can hold
// hundreds of near-collinear samples that undo/resize re-stroke segment by
// segment. At commit each command's ops are reduced once: per finger, the run of
// path ops is rebuilt into its raw point list and thinned with
// Ramer–Douglas–Peucker — a point is dropped when it lies within an
// epsilon-tolerance of the chord between its surviving neighbours, so only real
// direction changes remain. The rendered curve already approximates rather than
// interpolates its points, so thinning them shifts only antialiased stroke
// edges (<1px), not the stroke's shape or position.
//
// The tolerance scales with stroke width: a wiggle far smaller than the round
// brush's radius can't be seen, so a thick stroke tolerates a coarser polyline
// than a thin one. Clamped so even the thinnest stroke drops sub-pixel jitter and
// the thickest doesn't cut visible corners. All in device px — stored coordinates
// already include renderScale.
// Mutable so the dev profiling harness can sweep them at runtime
// (setSimplifyParams, exposed only on the dev/engine page behind
// PUBLIC_ENABLE_DEV_HARNESS). Production never calls the setter, so these keep
// their tuned defaults.
let simplifyEpsilonFraction = 0.03;
let simplifyEpsilonMinPx = 1;
let simplifyEpsilonMaxPx = 6;
function simplifyEpsilonFor(lineWidth: number): number {
  return Math.min(
    simplifyEpsilonMaxPx,
    Math.max(simplifyEpsilonMinPx, lineWidth * simplifyEpsilonFraction)
  );
}

// Lifetime counters (raw samples seen vs. points kept after simplification),
// surfaced through getUndoDebug for the profiling harness and the engine spec.
let simplifyRawPoints = 0;
let simplifyKeptPoints = 0;

// Dev profiling seam (ADR-0036 tuning): override the simplification tolerance
// and the keyframe safety-net bound so a single build can sweep every setting.
// Wired onto window.__engine only on the /dev/engine page (PUBLIC_ENABLE_DEV_HARNESS);
// production never calls it. Resets the lifetime counters so each sweep point
// reads a clean raw/kept ratio.
export function setSimplifyParams(params: {
  fraction?: number;
  min?: number;
  max?: number;
  keyframeThreshold?: number;
  cornerAngleDeg?: number;
  mode?: 'midpoint' | 'spline' | 'samples';
  reduce?: boolean;
  enabled?: boolean;
  split?: 'none' | 'corner';
}) {
  if (params.fraction !== undefined) simplifyEpsilonFraction = params.fraction;
  if (params.min !== undefined) simplifyEpsilonMinPx = params.min;
  if (params.max !== undefined) simplifyEpsilonMaxPx = params.max;
  if (params.keyframeThreshold !== undefined) keyframeSegmentThreshold = params.keyframeThreshold;
  if (params.cornerAngleDeg !== undefined)
    simplifyCornerCos = Math.cos((params.cornerAngleDeg * Math.PI) / 180);
  if (params.mode !== undefined) simplifyMode = params.mode;
  if (params.reduce !== undefined) simplifyReduce = params.reduce;
  if (params.enabled !== undefined) simplifyEnabled = params.enabled;
  if (params.split !== undefined) simplifySplit = params.split;
  simplifyRawPoints = 0;
  simplifyKeptPoints = 0;
}

type PathOp = Extract<StrokeOp, { kind: 'path' }>;

// Turn threshold shared by the corner pinning/splitting in strokeSimplify.ts
// (cos of the corner angle; sharper turns than this are corners).
let simplifyCornerCos = Math.cos((40 * Math.PI) / 180);
// Rebuild renderer. 'samples' (the default) thins the recovered RAW finger
// samples and re-applies the live midpoint-quadratic construction over them
// (sampleReducedSpans, strokeSimplify.ts) — the SAME curve family as the live
// render, so turns, tips,
// and hold-still corners rebuild exactly and the whole-battery worst shift is
// ~1.5 CSS px (vs 2.5 for 'spline'). 'spline' interpolates derived ON-CURVE
// points (rawPointsOf) with a corner-aware centripetal Catmull-Rom — kept for
// comparison sweeps; it reduces more (~4.3× vs ~2.7×) at visibly lower corner/
// tip fidelity. 'midpoint' is a legacy/diagnostic mode that re-applies midpoint
// smoothing to ON-CURVE points; it HALVES them and is wrong for reconstruction
// (kept only for the profiling seam). Tunable via setSimplifyParams.
let simplifyMode: 'midpoint' | 'spline' | 'samples' = 'samples';
// When false, keep every raw point (no RDP) — for measuring the renderer floor.
let simplifyReduce = true;
// 'corner' splits a reduced run into one stroke op per span between sharp corners,
// so each kept corner is a stroke boundary and gets a round CAP (a full disc) just
// like the live per-frame draw — eliminating the merged-path round-JOIN shift at
// sharp turns. 'none' emits one merged op per run (round joins at every vertex).
let simplifySplit: 'none' | 'corner' = 'corner';
// SHIPPING DEFAULT: true. simplifyCommand reduces a committed command's per-frame
// ops to a few thinned sub-strokes (ADR-0036, 'samples' mode above). Verified on
// perf:units: every stroke in the synthetic + real battery rebuilds within
// ≤1.5 CSS px of the live render (max; the bulk far under), at ~2.7x fewer
// points. The key is staying in the live render's own curve family — thin the
// recovered raw samples, pin turn/tip/duplicate neighbourhoods so their local
// geometry is exact, and re-apply midpoint smoothing — instead of fitting a
// different spline through derived points (the retired 'spline' mode, which
// reduced more but shifted corners and scribble tips by up to 2.5 px: the jump
// users saw on undo). Long all-corners commands that RDP can't thin are still
// bounded by ADR-0035 keyframing.
let simplifyEnabled = true;

function pathStyleMatches(a: PathOp, b: PathOp): boolean {
  return a.color === b.color && a.lineWidth === b.lineWidth && a.erase === b.erase;
}

// Reduce one continuous, same-style run of a single finger's path ops through
// the geometry pipeline for the active mode (strokeSimplify.ts), re-attach the
// run's style to each returned span, and track the lifetime raw/kept counters.
function reducePathRun(run: PathOp[]): PathOp[] {
  const first = run[0];
  const opts = {
    epsilon: simplifyEpsilonFor(first.lineWidth),
    cornerCos: simplifyCornerCos,
    reduce: simplifyReduce,
  };
  const { spans, rawCount, keptCount } =
    simplifyMode === 'samples'
      ? sampleReducedSpans(run, opts)
      : splineReducedSpans(run, {
          ...opts,
          midpoint: simplifyMode === 'midpoint',
          split: simplifySplit,
        });
  simplifyRawPoints += rawCount;
  simplifyKeptPoints += keptCount;
  return spans.map((span) => ({
    kind: 'path' as const,
    pid: first.pid,
    startX: span.startX,
    startY: span.startY,
    segs: span.segs,
    color: first.color,
    lineWidth: first.lineWidth,
    erase: first.erase,
  }));
}

// Simplify a committed command's per-frame path ops in place. A multi-touch
// command interleaves several fingers' ops, so they're first regrouped by pointer
// id, then each finger's ops are split into spatially continuous, same-style
// sub-runs (a pointer-resume jump or a mid-stroke style/eraser change breaks
// continuity, so no stray line bridges the gap) before reduction. Each finger's
// reduced ops are emitted at the position of its first op; dots and clears pass
// through in place, preserving compositing order for the single-finger case.
function simplifyCommand(cmd: StrokeGroupCommand) {
  if (!simplifyEnabled || cmd.ops.length === 0) return;
  if (PERF_MARKS) performance.mark('engine.simplify:start');

  const byPid = new Map<number, PathOp[]>();
  for (const op of cmd.ops) {
    if (op.kind !== 'path') continue;
    const list = byPid.get(op.pid);
    if (list) list.push(op);
    else byPid.set(op.pid, [op]);
  }

  const reducedByPid = new Map<number, PathOp[]>();
  for (const [pid, ops] of byPid) {
    const reduced: PathOp[] = [];
    let run: PathOp[] = [];
    const flush = () => {
      if (run.length > 0) reduced.push(...reducePathRun(run));
      run = [];
    };
    for (const op of ops) {
      if (run.length > 0) {
        const prev = run[run.length - 1];
        const prevAnchor = prev.segs[prev.segs.length - 1];
        const continuous = op.startX === prevAnchor.x && op.startY === prevAnchor.y;
        if (!continuous || !pathStyleMatches(prev, op)) flush();
      }
      run.push(op);
    }
    flush();
    reducedByPid.set(pid, reduced);
  }

  const out: StrokeOp[] = [];
  const emitted = new Set<number>();
  for (const op of cmd.ops) {
    if (op.kind !== 'path') {
      out.push(op);
      continue;
    }
    if (!emitted.has(op.pid)) {
      out.push(...reducedByPid.get(op.pid)!);
      emitted.add(op.pid);
    }
  }
  cmd.ops = out;
  if (PERF_MARKS) performance.measure('engine.simplify', 'engine.simplify:start');
}

// Total quadratic segments a command will re-stroke on replay — the keyframe
// safety net's trigger, measured after simplification.
function commandSegmentCount(cmd: StrokeGroupCommand): number {
  let n = 0;
  for (const op of cmd.ops) if (op.kind === 'path') n += op.segs.length;
  return n;
}

// One quadratic segment per input point: the path runs midpoint-to-midpoint
// with the raw point as the control, so consecutive segments share a tangent
// and the stroke curves smoothly instead of showing straight-chord corners.
// Each call is captured as one path op (matching its own beginPath/stroke
// boundary) so undo replay reproduces identical pixels and anti-aliasing.
function strokeSmoothSegments(ps: PointerState, points: { x: number; y: number }[]) {
  if (points.length === 0) return;
  const op: StrokeOp = {
    kind: 'path',
    pid: ps.id,
    startX: ps.midX,
    startY: ps.midY,
    segs: [],
    color: ps.color,
    lineWidth: ps.lineWidth,
    erase: ps.erase,
  };
  for (const { x, y } of points) {
    const midX = (ps.x + x) / 2;
    const midY = (ps.y + y) / 2;
    op.segs.push({ cx: ps.x, cy: ps.y, x: midX, y: midY });
    ps.x = x;
    ps.y = y;
    ps.midX = midX;
    ps.midY = midY;
  }
  renderOp(ctx, op);
  recordOp(op);
}

export function releaseAllPointers() {
  if (!ctx) return;
  ctx.beginPath();

  activePointers.clear();
  groupHasDrawn = false;
  commitActiveCommand();

  activePointerIds.forEach((pointerId) => {
    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {}
  });

  activePointerIds.clear();
}

// First paint of a stroke group: open a new undo command and flip the empty
// flag, once. A multi-touch gesture undoes as a single unit, so later fingers
// record into the same command. `wasEmpty` is captured before the flag flips.
function beginRender() {
  if (groupHasDrawn) return;
  activeCommand = { ops: [], wasEmpty: canvasEmpty };
  setCanvasEmptyState(false);
  groupHasDrawn = true;
}

// Paint the round dot that anchors a stroke at its start point, and kick the
// drawing sound. Used both for a normal pointerdown and when a deferred
// edge-swipe candidate commits.
function renderStrokeStart(ps: PointerState) {
  beginRender();

  // Erasing clears pixels via destination-out; the stroke color is irrelevant
  // there, only its (opaque) alpha matters.
  const dot: StrokeOp = {
    kind: 'dot',
    x: ps.x,
    y: ps.y,
    radius: ps.lineWidth / 2,
    color: ps.color,
    erase: ps.erase,
  };
  renderOp(ctx, dot);
  recordOp(dot);

  ctx.beginPath();
  ctx.moveTo(ps.x, ps.y);

  if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });
}

// A buffered edge-swipe candidate turned out to be a real stroke: render its
// start dot and flush every point withheld while the direction was undecided,
// then let it draw normally from here on.
function commitEdgeSwipe(ps: PointerState) {
  ps.edgeSwipeGuard = null;
  renderStrokeStart(ps);
  if (ps.pendingPoints.length > 0) {
    strokeSmoothSegments(ps, ps.pendingPoints);
    ps.pendingPoints = [];
  }
  // Restart speed sampling from the commit point so the buffered span doesn't
  // register as one giant first chord.
  const now = Date.now();
  ps.speedSamples = [{ t: now, distance: 0 }];
  ps.lastTime = now;
}

// Drop a pointer without rendering anything (an OS edge-swipe). Nothing was
// painted, so undo/empty state and the group flag are left untouched.
function discardPointer(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);
  ctx.beginPath();
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
}

function startDrawing(e: PointerEvent) {
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 0 : COLOR_CHANGE_DEBOUNCE_MS;
  if (timeSinceColorChange < requiredDelay) return;

  const { x, y } = pointerToCanvas(e);

  // The eraser runs a bit larger than the pen at the same stroke level. Stroke
  // widths are authored in CSS pixels, so they scale to backing-store pixels.
  const lineWidth =
    (eraserActive ? currentLineWidth * ERASER_SIZE_MULTIPLIER : currentLineWidth) * renderScale;

  const edgeSwipeGuard =
    e.pointerType === 'touch'
      ? guardedEdgeAt(x, y, {
          width: canvas.width,
          height: canvas.height,
          renderScale,
          bottomInset: safeInsets.bottom,
        })
      : null;

  const now = Date.now();
  const pointerState: PointerState = {
    id: e.pointerId,
    x,
    y,
    midX: x,
    midY: y,
    startX: x,
    startY: y,
    isDrawing: true,
    color: currentColor,
    lineWidth,
    erase: eraserActive,
    lastTime: now,
    // Time-stamped distance samples for the sliding speed window. The first
    // entry is a zero-distance anchor so the very first move has a span to
    // divide by.
    speedSamples: [{ t: now, distance: 0 }],
    edgeSwipeGuard,
    pendingPoints: [],
  };
  activePointers.set(e.pointerId, pointerState);
  activePointerIds.add(e.pointerId);

  // A candidate paints nothing yet — renderStrokeStart runs later, on commit.
  if (!edgeSwipeGuard) renderStrokeStart(pointerState);

  // Capture every pointer — pen included — so a stroke keeps flowing to the
  // canvas when it crosses a floating control (Clear button, Actions Panel) or
  // the canvas edge, instead of ending on the pointerout that fires there.
  // Without capture, Apple Pencil strokes were silently cut short at those spots
  // (touch was already captured, so it never had the problem).
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
}

// Every pointerdown actually delivered anywhere in the document, until its
// up/cancel arrives. A pen contact stream whose id is missing here never got a
// pointerdown at all — the WebKit merged-stream signature — which is what
// licenses adoption below without stealing pointers that legitimately began on
// a UI control (drag-to-clear's uncaptured drag, the color picker's captured
// drag, a slide off a swatch).
const liveDownIds = new Set<number>();
const trackPointerDown = (e: PointerEvent) => liveDownIds.add(e.pointerId);
const trackPointerLift = (e: PointerEvent) => liveDownIds.delete(e.pointerId);

const cancelTouch = (e: TouchEvent) => e.preventDefault();

// The WebKit merge quirk of POINTER_RESUME_GAP_MS, for a stream that began on a
// UI control: a fast pen tap on e.g. a color swatch merged with the following
// stroke drops the intervening pointerup + pointerdown, so the stroke arrives
// as bare pointermoves — a down-less contact stream. Hover moves (buttons ===
// 0) never match, and touch keeps its 100ms color-change debounce precisely to
// absorb this kind of tap fallout.
function isOrphanPenContact(e: PointerEvent) {
  return e.pointerType === 'pen' && e.buttons !== 0 && !liveDownIds.has(e.pointerId);
}

// Pens get no implicit capture, so an orphaned stream's moves usually hit-test
// onto the canvas (draw() adopts those directly) — but WebKit can also keep
// delivering them to the control the merged stream started on. This
// window-level listener catches that flavor: an orphaned pen contact move
// physically over exposed canvas (elementFromPoint, so an open picker or a
// floating control still wins) becomes the stroke start, and startDrawing's
// setPointerCapture retargets the rest of the stream to the canvas.
function adoptStrayPenStream(e: PointerEvent) {
  if (e.target === canvas || activePointers.has(e.pointerId)) return;
  if (!isOrphanPenContact(e)) return;
  if (document.elementFromPoint(e.clientX, e.clientY) !== canvas) return;
  startDrawing(e);
}

function draw(e: PointerEvent) {
  const pointerState = activePointers.get(e.pointerId);

  // Canvas-targeted flavor of the merged-stream quirk (see adoptStrayPenStream):
  // adopt the down-less stream as the stroke start instead of dropping the
  // whole first stroke after a color pick.
  if (!pointerState && isOrphanPenContact(e)) {
    startDrawing(e);
    return;
  }

  if (!pointerState || !pointerState.isDrawing) return;

  if (PERF_MARKS) performance.mark('engine.draw:start');

  e.preventDefault();

  // Browsers coalesce fast input to ~one pointermove per frame but keep the
  // intermediate samples; replay them all so quick scribbles don't render as
  // straight chords. Synthetic/untrusted events report an empty list — fall
  // back to the event itself.
  const coalesced = e.getCoalescedEvents?.() ?? [];
  const events = coalesced.length > 0 ? coalesced : [e];
  const points = events.map(pointerToCanvas);

  const now = Date.now();

  // Edge-gesture candidate: withhold rendering until the direction is decided.
  if (pointerState.edgeSwipeGuard) {
    pointerState.pendingPoints.push(...points);
    const last = points[points.length - 1];
    const dx = last.x - pointerState.startX;
    const dy = last.y - pointerState.startY;
    if (!edgeSwipeDirectionDecided(Math.hypot(dx, dy), renderScale)) return;
    // Decided. A mostly-inward flick (within ~45° of perpendicular, toward the
    // canvas centre) is the OS gesture — discard the whole stroke. Anything else
    // is a real stroke; commit it and let the next pointermove draw normally.
    if (edgeSwipeIsOsGesture(pointerState.edgeSwipeGuard, dx, dy)) {
      discardPointer(e);
    } else {
      commitEdgeSwipe(pointerState);
    }
    return;
  }

  // A resumed pointer (see POINTER_RESUME_GAP_MS) reappears far from where it
  // left off after an idle gap, with no coalesced samples bridging the two.
  // Restart the path there so the next segment doesn't span the gap.
  const resume = points[0];
  const resumeDeltaX = resume.x - pointerState.x;
  const resumeDeltaY = resume.y - pointerState.y;
  const jump = Math.sqrt(resumeDeltaX * resumeDeltaX + resumeDeltaY * resumeDeltaY);
  if (pointerWasResumed(now - pointerState.lastTime, jump, Math.min(canvas.width, canvas.height))) {
    pointerState.x = resume.x;
    pointerState.y = resume.y;
    pointerState.midX = resume.x;
    pointerState.midY = resume.y;
    pointerState.speedSamples = [{ t: now, distance: 0 }];
    ctx.beginPath();
  }

  // Speed is sampled from the final event only: one chord per pointermove,
  // matching the cadence the sliding window was tuned for.
  const last = points[points.length - 1];
  const deltaX = last.x - pointerState.x;
  const deltaY = last.y - pointerState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const speed = calculateStrokeSpeed(
    pointerState.speedSamples,
    { t: now, distance },
    SPEED_WINDOW_MS
  );

  strokeSmoothSegments(pointerState, points);

  pointerState.lastTime = now;

  if (onDrawSoundCallback) onDrawSoundCallback({ speed });

  if (PERF_MARKS) performance.measure('engine.draw', 'engine.draw:start');
}

function stopDrawing(e?: PointerEvent) {
  if (!e) return;

  const pointerState = activePointers.get(e.pointerId);

  // An edge-band touch that lifted before its direction was decided was a tap,
  // not a swipe — commit it (typically just the start dot). A pointercancel
  // (the OS took the gesture over) instead leaves it a candidate, so nothing is
  // rendered and the canvas state below is left alone.
  if (pointerState?.edgeSwipeGuard && e.type === 'pointerup') {
    commitEdgeSwipe(pointerState);
  }

  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();

  if (pointerState && !pointerState.edgeSwipeGuard && pointerState.erase) {
    setCanvasEmptyState(scanCanvasIsEmpty());
  }

  if (activePointers.size === 0) {
    groupHasDrawn = false;
    commitActiveCommand();
  }

  if (onDrawStopCallback) onDrawStopCallback();

  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
}

// Finalize the stroke group built up since beginRender() and push it onto the
// undo log. Called once per group, when the last finger lifts.
function commitActiveCommand() {
  if (!activeCommand) return;
  if (PERF_MARKS) performance.mark('engine.commit:start');
  pushCommand(activeCommand);
  activeCommand = null;
  // Fired at stroke end, not start, so reactive consumers (e.g. mounting the
  // install banner) never do DOM work while a finger is mid-stroke.
  if (onStrokeEnd) onStrokeEnd();
  if (PERF_MARKS) performance.measure('engine.commit', 'engine.commit:start');
}

function pushCommand(cmd: StrokeGroupCommand) {
  commandLog.push(cmd);
  simplifyCommand(cmd);
  if (commandLog.length > MAX_UNDO_STACK_SIZE) foldOldestIntoBaseline();
  maybeKeyframe(cmd);

  canUndo = true;
  if (onUndoStateChange) onUndoStateChange(canUndo);
}

// Safety net: a command whose *simplified* segment total is still large enough
// to make undo/resize replay expensive is collapsed once, at commit (off the
// draw frame), into a cumulative square keyframe of the whole drawing through it,
// then its ops are dropped so rebuilds blit the keyframe instead. Built before
// the ops are cleared, so paintStateThrough still sees them. See ADR-0035 (the
// trigger now measures post-simplification segments, ADR-0036).
function maybeKeyframe(cmd: StrokeGroupCommand) {
  if (commandSegmentCount(cmd) <= keyframeSegmentThreshold || !baselineCanvas) return;
  const index = commandLog.indexOf(cmd);
  if (index < 0) return;
  const kf = document.createElement('canvas');
  kf.width = baselineCanvas.width;
  kf.height = baselineCanvas.height;
  const kfCtx = kf.getContext('2d');
  if (!kfCtx) return;
  kfCtx.lineCap = 'round';
  kfCtx.lineJoin = 'round';
  if (PERF_MARKS) performance.mark('engine.keyframe:start');
  paintStateThrough(kfCtx, index);
  cmd.keyframe = kf;
  cmd.ops = [];
  if (PERF_MARKS) performance.measure('engine.keyframe', 'engine.keyframe:start');
}

// History past the cap can no longer be undone, so bake the oldest command into
// the baseline raster and drop it. A keyframed command already holds the
// cumulative state through itself, so it becomes the new baseline wholesale;
// otherwise replay its ops in order (keeping eraser destination-out ops hitting
// exactly the pixels they originally did).
function foldOldestIntoBaseline() {
  const oldest = commandLog.shift();
  if (!oldest || !baselineCtx || !baselineCanvas) return;
  if (PERF_MARKS) performance.mark('engine.foldBaseline:start');
  if (oldest.keyframe) {
    baselineCtx.clearRect(0, 0, baselineCanvas.width, baselineCanvas.height);
    baselineCtx.drawImage(oldest.keyframe, 0, 0);
  } else {
    for (const op of oldest.ops) renderOp(baselineCtx, op);
  }
  if (PERF_MARKS) performance.measure('engine.foldBaseline', 'engine.foldBaseline:start');
}

// Paint the drawing state through commandLog[upToIndex] (inclusive) onto a
// target context. Starts from the most recent cumulative keyframe at or below
// that index (a keyframe is the whole drawing through its command, so blitting
// it replaces the baseline + every command up to it) and replays only the ops
// after it. With no keyframe in range it falls back to the baseline + a full
// replay. The baseline/keyframes are square (max(w,h)), so painting onto a
// resized or rotated visible canvas restores content that was off-screen.
function paintStateThrough(target: CanvasRenderingContext2D, upToIndex: number) {
  let start = -1;
  for (let i = upToIndex; i >= 0; i--) {
    if (commandLog[i].keyframe) {
      start = i;
      break;
    }
  }
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  let begin: number;
  if (start >= 0) {
    target.drawImage(commandLog[start].keyframe!, 0, 0);
    begin = start + 1;
  } else {
    if (baselineCanvas) target.drawImage(baselineCanvas, 0, 0);
    begin = 0;
  }
  for (let i = begin; i <= upToIndex; i++) {
    for (const op of commandLog[i].ops) renderOp(target, op);
  }
}

// Reconstruct the visible canvas from the baseline + command log (via the most
// recent keyframe). A mid-stroke resize still has an uncommitted activeCommand
// (its ops are recorded but not yet in the log, and it is never keyframed until
// commit), so replay it last to keep the in-flight stroke; between strokes
// activeCommand is null and this is a no-op.
function rebuildFromBaseline() {
  paintStateThrough(ctx, commandLog.length - 1);
  if (activeCommand) {
    for (const op of activeCommand.ops) renderOp(ctx, op);
  }
}

export function undo() {
  if (!canUndo || commandLog.length === 0 || !canvas || !ctx) return;

  if (PERF_MARKS) performance.mark('engine.undo:start');

  const undone = commandLog.pop();
  if (!undone) return;
  rebuildFromBaseline();
  setCanvasEmptyState(undone.wasEmpty);

  canUndo = commandLog.length > 0;
  if (onUndoStateChange) onUndoStateChange(canUndo);

  if (PERF_MARKS) performance.measure('engine.undo', 'engine.undo:start');
}

export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d')!;

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  onCanvasEmptyChange = options.onCanvasEmptyChange || null;
  onStrokeEnd = options.onStrokeEnd || null;
  currentColor = options.initialColor || '#AB71E1';

  renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  // Scroll/orientation move the canvas in the viewport without resizing it, so
  // refresh the cached rect (left/top) without the full backing-store rebuild.
  window.addEventListener('scroll', refreshCanvasRect, true);
  window.addEventListener('orientationchange', refreshCanvasRect);

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerout', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  // iPadOS Scribble claims an Apple Pencil stroke that starts within ~450ms of
  // a pen tap: pointer events still arrive and the engine paints, but the
  // system never presents those frames — the ink is invisible and never shows.
  // Cancelling the parallel TOUCH stream is the only thing that makes Scribble
  // let go; preventDefault on the pointer events (draw() already does it) is
  // documented and confirmed on-device NOT to help. Non-passive on purpose.
  // The palette needs the same guard for the tap that precedes a stroke — see
  // the scribbleGuard action.
  canvas.addEventListener('touchstart', cancelTouch, { passive: false });
  canvas.addEventListener('touchmove', cancelTouch, { passive: false });
  window.addEventListener('pointerdown', trackPointerDown, true);
  window.addEventListener('pointerup', trackPointerLift, true);
  window.addEventListener('pointercancel', trackPointerLift, true);
  window.addEventListener('pointermove', adoptStrayPenStream, true);

  // Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
  // first export. Safari lacks requestIdleCallback.
  const warmTexture = () => void loadPaperTexture();
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmTexture);
  } else {
    setTimeout(warmTexture, 0);
  }

  return {
    teardown() {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('scroll', refreshCanvasRect, true);
      window.removeEventListener('orientationchange', refreshCanvasRect);
      canvas.removeEventListener('pointerdown', startDrawing);
      canvas.removeEventListener('pointermove', draw);
      canvas.removeEventListener('pointerup', stopDrawing);
      canvas.removeEventListener('pointerout', stopDrawing);
      canvas.removeEventListener('pointercancel', stopDrawing);
      canvas.removeEventListener('touchstart', cancelTouch);
      canvas.removeEventListener('touchmove', cancelTouch);
      window.removeEventListener('pointerdown', trackPointerDown, true);
      window.removeEventListener('pointerup', trackPointerLift, true);
      window.removeEventListener('pointercancel', trackPointerLift, true);
      window.removeEventListener('pointermove', adoptStrayPenStream, true);
    },
  };
}

export function setColor(color: string) {
  // Only a genuine change arms the debounce. The reactive bridge in
  // DrawingCanvas re-pushes the current color on mount (and on unrelated
  // store updates); arming on those would swallow the user's first stroke.
  if (color === currentColor) return;
  currentColor = color;
  lastColorChangeTime = Date.now();
}

export function setStrokeWidth(widthPx: number) {
  currentLineWidth = widthPx;
}

export function setEraserMode(active: boolean) {
  eraserActive = active;
}

// CSS-px OS safe-area insets, used to decide which edges sit under a system
// gesture zone (see EDGE_SWIPE_BAND_PX). Pushed by the canvas's owner component
// on mount and whenever orientation/inset changes.
export function setSafeAreaInsets(insets: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}) {
  safeInsets = insets;
}

export function clearCanvas() {
  // The clear is its own undo command: replaying it wipes the surface, and
  // undoing it replays the strokes that preceded it back from the baseline.
  pushCommand({ ops: [{ kind: 'clear' }], wasEmpty: canvasEmpty });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasEmptyState(true);
}

export function isCanvasEmpty(): boolean {
  return canvasEmpty;
}

// Test/profiling seam: how the undo history is currently stored. `keyframes`
// counts commands collapsed to a cumulative raster (ADR-0035) vs. ones still held
// as replayable ops; `maxSegments` is the heaviest retained command's replay cost
// (post-simplification, ADR-0036); `rawPoints`/`keptPoints` are the lifetime
// simplification totals. `maxOps` is retained for the profiling harness.
export function getUndoDebug(): {
  commands: number;
  keyframes: number;
  maxOps: number;
  maxSegments: number;
  totalSegments: number;
  rawPoints: number;
  keptPoints: number;
} {
  return {
    commands: commandLog.length,
    keyframes: commandLog.filter((c) => c.keyframe != null).length,
    maxOps: commandLog.reduce((m, c) => Math.max(m, c.ops.length), 0),
    maxSegments: commandLog.reduce((m, c) => Math.max(m, commandSegmentCount(c)), 0),
    // Segments re-stroked on a full rebuild (every retained command's ops) — the
    // perf proxy the sweep plots against fidelity.
    totalSegments: commandLog.reduce((m, c) => m + commandSegmentCount(c), 0),
    rawPoints: simplifyRawPoints,
    keptPoints: simplifyKeptPoints,
  };
}

let paperTextureImage: HTMLImageElement | null = null;
let paperTexturePromise: Promise<HTMLImageElement | null> | null = null;
function loadPaperTexture(): Promise<HTMLImageElement | null> {
  if (paperTextureImage) return Promise.resolve(paperTextureImage);
  if (paperTexturePromise) return paperTexturePromise;
  paperTexturePromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTextureImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = '/icons/handmade-paper.webp';
  });
  return paperTexturePromise;
}

export async function exportCanvasBlob(
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true } = options;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;

  // Snapshot the strokes before any await: save-on-delete fire-and-forgets the
  // export and then clears the live canvas synchronously, so reading `canvas`
  // after the paper-texture await (even a cache hit yields a microtask) would
  // export a blank page.
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d')!.drawImage(canvas, 0, 0);

  // Compose in CSS-pixel coordinates at an export scale of at least 2×, so the
  // paper texture and overlay keep their on-screen proportions while the
  // already-high-res strokes pass through with minimal resampling.
  const exportScale = Math.max(window.devicePixelRatio || 1, 2);
  const w = snapshot.width / renderScale;
  const h = snapshot.height / renderScale;

  const out = document.createElement('canvas');
  out.width = Math.round(w * exportScale);
  out.height = Math.round(h * exportScale);
  const outCtx = out.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.scale(exportScale, exportScale);

  outCtx.fillStyle = '#fcfbf8';
  outCtx.fillRect(0, 0, w, h);

  if (includePaperTexture) {
    const paper = await loadPaperTexture();
    if (paper) {
      const pattern = outCtx.createPattern(paper, 'repeat');
      if (pattern) {
        outCtx.fillStyle = pattern;
        outCtx.fillRect(0, 0, w, h);
      }
    }
  }

  outCtx.drawImage(snapshot, 0, 0, w, h);

  if (overlayImage && overlayImage.naturalWidth > 0 && overlayImage.naturalHeight > 0) {
    const scale = Math.min(w / overlayImage.naturalWidth, h / overlayImage.naturalHeight);
    const drawnW = overlayImage.naturalWidth * scale;
    const drawnH = overlayImage.naturalHeight * scale;
    const offsetX = (w - drawnW) / 2;
    const offsetY = (h - drawnH) / 2;
    outCtx.globalCompositeOperation = 'multiply';
    outCtx.drawImage(overlayImage, offsetX, offsetY, drawnW, drawnH);
    outCtx.globalCompositeOperation = 'source-over';
  }

  return await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

export function getActiveCanvas(): HTMLCanvasElement {
  return canvas;
}
