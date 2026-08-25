// Imperative drawing engine (ADR-0004). earlyBoot.ts initializes it at
// module-evaluation time — before SvelteKit hydrates the route — so the canvas
// accepts strokes as soon as this chunk evaluates (ADR-0072); Svelte components
// then ADOPT the running engine via adoptDrawingCanvas(), attaching the
// callbacks it reports through (onDrawSound, onUndoStateChange, …) and pushing
// reactive state (active color, stroke width) via setColor() / setStrokeWidth()
// from $effect.
//
// The engine is the conductor over focused modules — it owns the <canvas>, the
// paper coordinate space, all pointer tracking, and the public API, and
// delegates the rest:
//
//   strokeOps.ts        the op vocabulary + the one renderer every surface shares
//   crayonPassBuffer.ts the crayon pass's accumulation buffers + glaze stamp
//   tiledRenderer.ts    live surfaces + vector-tail undo (ADR-0085)
//   tiledSurfaces.ts    allocation and lifecycle of each tile's canvas surfaces
//   undoHistory.ts      the shared undo depth and debug contracts
//   strokeMath.ts       pure gesture math (edge swipes, resume detection, speed)
//   paperView.ts        pure rotation-lock view geometry (ADR-0050)
//   magicBrush.ts       the magic brush's color sheet + paint pattern (ADR-0043)
//   emptyScan.ts        cheap blank-canvas detection
//   penStreamQuirks.ts  WebKit merged-stream pen-contact adoption
//   engineListeners.ts  DOM listener registration and teardown tracking
//   canvasMeasure.ts    cached canvas geometry + the unmeasured-rect rule
//   exportDrawing.ts    PNG composition for save/share (loaded on demand)

import { dev } from '$app/environment';
import type { Orientation } from '$lib/platform';
import { pageCompositionKey } from '$lib/state/books';
import { DEFAULT_STROKE_COLOR } from '$lib/state/colors.svelte';
import type { BrushType } from '$lib/state/tool.svelte';
import {
  DEFAULT_SIZE,
  ERASER_SIZE_MULTIPLIER,
  getStrokeWidthPx,
  type StrokeSize,
} from '$lib/state/strokeWidth.svelte';
import {
  calculateStrokeSpeed,
  COLOR_CHANGE_DEBOUNCE_MS,
  edgeSwipeIsOsGesture,
  edgeSwipeDirectionDecided,
  guardedEdgeAt,
  pointerWasResumed,
  type GuardEdge,
  type Point,
} from './strokeMath';
import {
  isIdentityView,
  IDENTITY_PAPER_VIEW,
  paperPresentationFor,
  viewForPresentation,
  type PaperPresentation,
  viewToPaper,
  type PaperView,
} from './paperView';
import {
  initMagicBrush,
  resizeMagicSheet,
  ensureMagicSheet,
  clearMagicGradient,
  captureMagicSheet,
  deferColorSheet,
  setColorSheet as setMagicColorSheet,
} from './magicBrush';
import { type StrokeOp } from './strokeOps';
import { flushCrayonBuffer } from './crayonPassBuffer';
import {
  setCrayonOptions,
  crayonColorMix,
  warmCrayonTiles,
  cancelCrayonWarmup,
  CrayonPassTracker,
  type CrayonOptions,
} from './crayonBrush';
import { type HistoryDebug, type RecordedPaperState } from './undoHistory';
import { createCanvasMeasure, type CanvasRect } from './canvasMeasure';
import { createPenStreamAdopter } from './penStreamQuirks';
import { createStrokeRasterQueue, type RasterBatch } from './strokeRasterQueue';
import { createIdleEmptyScan } from './idleEmptyScan';
import type { ExportOptions, ExportSnapshot, TiledExportSnapshot } from './exportDrawing';
import { getActiveOverlayExportSource } from './overlay';
import { currentExportScale } from './exportScale';
import {
  captureLiveTileSnapshot,
  captureTiledSnapshot,
  createStrokeSnapshot,
} from './strokeSnapshot';
import { registerDrawingEngineListeners } from './engineListeners';
import { scheduleIdle } from '../idle';
import { PERF_MARKS } from './perf';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  beginTiledMagicRecode,
  clearTiledRenderer,
  commitTiledCommand,
  detachTiledRenderer,
  hasRetainedTiledMagicOps,
  peekTiledUndoPaper,
  recordTiledOp,
  recodeTiledMagicOps,
  repaintTiledRenderer,
  recoverTiledRendererIfNeeded,
  renderTiledOp,
  renderTiledSnapshot,
  resizeTiledRenderer,
  scanTiledRendererIsEmpty,
  scheduleTiledHistoryFold,
  syncTiledCrayonMix,
  tiledHistoryDebug,
  tiledSurfaceTopologyDebug,
  tiledWorkDebug,
  undoTiledCommand,
} from './tiledRenderer';
import type { DrawingWorkDebug } from './drawingWorkDebug';

// --- Canvas, tool, and callback state -------------------------------------

export interface DrawSoundData {
  speed: number;
  isStrokeStart: boolean;
}

export type StrokeStartData = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'> & {
  magic: boolean;
};

interface InitOptions {
  onDrawSound?: (data: DrawSoundData) => void;
  onDrawStop?: () => void;
  onUndoStateChange?: (canUndo: boolean) => void;
  onCanvasEmptyChange?: (empty: boolean) => void;
  // Fires where the engine begins painting a stroke, the down-less pen streams
  // it adopts mid-move included (see isOrphanPenContact) — those deliver no
  // pointerdown to the owning component at all. A buffered edge-swipe candidate
  // reports nothing, at start or at commitEdgeSwipe: its contact point is
  // already stale by the time the swipe is judged a stroke.
  onStrokeStart?: (stroke: StrokeStartData) => void;
  onStrokeEnd?: () => void;
  onViewChange?: (view: EngineViewState) => void;
  initialColor?: string;
}

// Set in initDrawingCanvas() before any handler runs (definite-assignment `!`).
let canvas!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let currentColor = '';
const DEFAULT_LINE_WIDTH_PX = getStrokeWidthPx(DEFAULT_SIZE);
const TILED_INPUT_BITMAP_SIDE_PX = 1;
let viewport = { width: 0, height: 0 };
let currentLineWidth = DEFAULT_LINE_WIDTH_PX;
let eraserActive = false;
let magicActive = false;
let crayonActive = false;
let lastColorChangeTime = 0;

// Each live tile has two crayon canvases holding the open deposition pass at
// full opacity. The bottom layer
// composites with mix-blend-mode: darken and the top with CSS opacity
// (1 - colorMix), so the browser's compositing of (darken, then lerp) shows
// pixel-for-pixel the two-blit subtractive mix the pass's 'crayonFlush'
// stamp will bake into the normal tile at close (see crayonPassBuffer.ts)
// — no visible snap. pointer-events: none, so input still lands on the canvas
// beneath. LiveSurface's `.canvas-stack` sets `isolation: isolate`, confining
// the darken blend to the drawing pixels. Without it the blend sees the
// composited paper, and dark paper erases the bottom layer into a faint
// `1 - mix`-opacity preview until the flush.
//
function syncCrayonOverlayMix() {
  const opacity = String(1 - crayonColorMix());
  syncTiledCrayonMix(opacity);
}

// Close the current deposition pass by stamping each tile's live buffer and
// recording the same flush in the command retained for history and export.
function recordCrayonFlush() {
  const flush: StrokeOp = { kind: 'crayonFlush' };
  renderTiledOp(flush);
  recordCurrentOp(flush);
  crayonOpsSinceFlush = 0;
}

// A per-pass seed stamped onto every crayon op, so the paper-tooth pattern is
// phase-shifted per deposition pass (the source of wax buildup — ADR-0065). A
// pass is usually a whole stroke, but a continuous gesture that re-covers its
// own paper (a back-and-forth scribble) splits into further passes mid-stroke
// — see strokeCrayonSegments. A monotonic counter guarantees consecutive
// passes differ even when drawn over the same spot; the value is stored on the
// op, so repaints reproduce the live pixels regardless of the counter's
// position.
let crayonSeedCounter = 1;

let callbacks: Omit<InitOptions, 'initialColor'> = {};

// Strokes rasterize at the device pixel ratio so they stay crisp on mobile
// screens, capped at 2× — DPR-3 panels would cost 9× the pixels for detail a
// finger-drawn stroke can't use (see ADR 0015). Fixed for the session at init:
// a mid-session DPR change (desktop zoom, monitor move) would otherwise need
// every tile surface rescaled in place.
const MAX_RENDER_SCALE = 2;
// Bound live crayon memory without making ordinary short strokes pay a checkpoint.
const CRAYON_CHECKPOINT_OPS = 64;
let renderScale = 1;
let crayonOpsSinceFlush = 0;

function backingSizeOf(rect: DOMRect): { w: number; h: number } {
  return { w: Math.round(rect.width * renderScale), h: Math.round(rect.height * renderScale) };
}

let canUndo = false;

function setCanUndo(value: boolean) {
  canUndo = value;
  callbacks.onUndoStateChange?.(value);
}

let canvasEmpty = true;

function readoptPaperAfterTiledCanvasHides() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (engineLive && canvasEmpty && activePointers.size === 0 && paperLocked) {
        resizeCanvas();
      }
    });
  });
}

function setCanvasEmptyState(
  empty: boolean,
  recordedPaper?: RecordedPaperState,
  repaintDeferredToRestore = false
) {
  // An in-flight stroke already owns the live paper and marks it non-empty; undo must not replace
  // its coordinate space with metadata from the removed command.
  if (canvasEmpty === empty) return;
  const paperUnchanged =
    recordedPaper !== undefined &&
    paper.pxW === recordedPaper.pxW &&
    paper.pxH === recordedPaper.pxH &&
    paper.cssW === recordedPaper.cssW &&
    paper.cssH === recordedPaper.cssH &&
    paperAngle === recordedPaper.angle;
  const restoringPaper = !empty && !paperUnchanged ? recordedPaper : undefined;
  canvasEmpty = empty;
  if (restoringPaper) {
    paper = {
      pxW: restoringPaper.pxW,
      pxH: restoringPaper.pxH,
      cssW: restoringPaper.cssW,
      cssH: restoringPaper.cssH,
    };
    paperAngle = restoringPaper.angle;
    resizeCanvas(undefined, { repaintDeferredToRestore });
  }
  callbacks.onCanvasEmptyChange?.(empty);
  // A blank canvas frees the locked paper to match the live viewport again
  // (clear, undo-to-blank, erase-to-blank): re-adopt right away instead of
  // leaving the child a letterboxed — or system-bar-cropped — blank page until
  // the next rotation.
  if (empty && activePointers.size === 0 && paperLocked) {
    readoptPaperAfterTiledCanvasHides();
  }
}

// --- Paper space and the rotation-lock view (ADR-0050) --------------------

// The paper: the coordinate space every recorded op, the committed paper
// raster, and the magic sheet live in (ADR-0050). It tracks the viewport while
// the canvas is empty, but ink LOCKS it: the drawing keeps its space — and its
// tall/wide coloring page — and is instead *presented* through `paperView`,
// contain-fit upright for a rotation or at identity for a viewport the system
// bars merely shrank. See PaperPresentation in ./paperView.
let paper = { pxW: 0, pxH: 0, cssW: 0, cssH: 0 };
// Screen Orientation angle when the paper was adopted, so a later resize can
// tell an actual rotation (angle delta ≠ 0) from a plain viewport resize.
let paperAngle = 0;
// Screen Orientation angle the last resizeCanvas ran against. Unlike
// paperAngle it advances even when the paper stays locked, so the re-entry
// re-sync can tell whether the device rotated while the document was hidden.
let resizedAngle = 0;
let paperView: PaperView = IDENTITY_PAPER_VIEW;
// True while the paper is held apart from the live viewport. Not inferable from
// the view transform — a windowed paper presents at identity yet is still held
// — so the "blank canvas frees the paper" paths consult this instead.
let paperLocked = false;

// The /dev/engine harness intentionally mutates this unlike the drawing route's
// read-only seams: simulated rotation has no equivalent DOM state to drive.
// The compile-time gate drops both the state and currentScreenAngle branch from
// release builds.
let screenAngleOverride: number | null = null;
export function setScreenAngleOverride(angle: number | null) {
  if (!dev && !__DEV_HARNESS__) return;
  screenAngleOverride = angle;
}

function currentScreenAngle(): number {
  if ((dev || __DEV_HARNESS__) && screenAngleOverride !== null) return screenAngleOverride;
  const angle = window.screen?.orientation?.angle;
  return typeof angle === 'number' ? angle : 0;
}

// The paper view published to components (CSS px), so the coloring-page overlay
// can be positioned with the same transform the canvas paints through, and the
// picker can keep offering the locked paper's tall/wide art variant.
export interface EngineViewState {
  active: boolean;
  scale: number;
  rotate: PaperView['rotate'];
  tx: number;
  ty: number;
  paperCssWidth: number;
  paperCssHeight: number;
  paperOrientation: Orientation;
}

// The pre-adoption SSR-shell value of EngineViewState, before getViewState() has
// any paper/render-scale state to derive from.
export const INITIAL_ENGINE_VIEW_STATE: EngineViewState = Object.freeze({
  active: false,
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
  paperCssWidth: 0,
  paperCssHeight: 0,
  paperOrientation: 'portrait',
});

export function getViewState(): EngineViewState {
  return {
    active: !isIdentityView(paperView),
    scale: paperView.scale,
    rotate: paperView.rotate,
    tx: paperView.tx / renderScale,
    ty: paperView.ty / renderScale,
    paperCssWidth: paper.cssW,
    paperCssHeight: paper.cssH,
    paperOrientation: paper.pxW > paper.pxH ? 'landscape' : 'portrait',
  };
}

function notifyViewChange() {
  callbacks.onViewChange?.(getViewState());
}

// --- Pointer → paper coordinate mapping ------------------------------------

const measure = createCanvasMeasure({
  canvas: () => canvas,
  viewport: () => viewport,
});
const refreshCanvasRect = measure.refresh;
const pointerToScreen = measure.toScreen;

// Paper coordinates — the space ops are recorded and rendered in. Identity
// unless a rotation has locked the paper (see resizeCanvas / ADR-0050).
function screenToPaper(pt: Point): Point {
  return isIdentityView(paperView) ? pt : viewToPaper(paperView, pt.x, pt.y);
}

// Magic is drawable only on the paper, so its sheet uses the paper's exact
// coordinate bounds even when CSS contain-fits the paper after rotation.
function sheetBoundsPaper(): { x: number; y: number; width: number; height: number } {
  return { x: 0, y: 0, width: paper.pxW, height: paper.pxH };
}

// The cached canvas client rect, so components can position pointer-following
// UI (e.g. the eraser cursor) without their own per-move getBoundingClientRect.
export function getCanvasRect(): Readonly<CanvasRect> {
  return measure.rect;
}

// --- Resize and rotation ----------------------------------------------------

function adoptPaper(rect: DOMRect) {
  const { w, h } = backingSizeOf(rect);
  paper = { pxW: w, pxH: h, cssW: rect.width, cssH: rect.height };
  paperAngle = currentScreenAngle();
}

function recordedPaperState(): RecordedPaperState | null {
  if (!paperIsSized()) return null;
  return { ...paper, angle: paperAngle };
}

// Keep tile contexts in upright paper coordinates and report the presentation
// matrix to LiveSurface. A `fit` presentation contain-fits the locked paper;
// `window` fills the viewport. Letterbox margins are outside the paper and
// reject pointer starts (ADR-0089).
function applyPaperView(presentation: PaperPresentation) {
  paperView = viewForPresentation(presentation, { width: paper.pxW, height: paper.pxH }, viewport);
  applyTiledView(IDENTITY_PAPER_VIEW);
}

// An unmeasured rect is refused rather than adopted — see canvasMeasure.ts for
// why rebuilding from one is unrecoverable — and the rebuild re-arms for the
// first layout that gives the canvas a box.
interface ResizeCanvasOptions {
  repaintRecoveredPixels?: boolean;
  // Undo's pre-restore telling the resize that an immediate snapshot restore
  // (or its repaint fallback) owns the next paint: the full history repaint
  // here would render through the command about to be popped — blank tiles for
  // an undone clear — and be overwritten within the same frame (issue 1198).
  // Only valid for the SYNCHRONOUS call from undo(): the deferred-rect retry
  // below deliberately drops it, because by the time that retry fires the
  // undo's restore has long since painted and this resize's backing wipe
  // needs the repaint — threading the flag there left a permanent blank
  // canvas with canvasEmpty false.
  repaintDeferredToRestore?: boolean;
}

function resizeCanvas(
  rect: DOMRect = canvas.getBoundingClientRect(),
  { repaintRecoveredPixels = false, repaintDeferredToRestore = false }: ResizeCanvasOptions = {}
) {
  if (!measure.accept(rect, (measured) => resizeCanvas(measured, { repaintRecoveredPixels }))) {
    return;
  }
  if (PERF_MARKS) performance.mark('engine.resize:start');
  const presentation = paperPresentationFor({
    canvasEmpty,
    paper: { width: paper.cssW, height: paper.cssH },
    paperAngle,
    screenAngle: currentScreenAngle(),
    viewport: rect,
  });
  paperLocked = presentation !== 'adopt';
  if (!paperLocked) adoptPaper(rect);
  resizedAngle = currentScreenAngle();

  // The input canvas only receives pointers. The visible paper stays in the
  // template-owned tile surfaces and is presented with CSS (ADR-0089).
  const { w, h } = backingSizeOf(rect);
  viewport = { width: w, height: h };
  if (canvas.width !== TILED_INPUT_BITMAP_SIDE_PX) canvas.width = TILED_INPUT_BITMAP_SIDE_PX;
  if (canvas.height !== TILED_INPUT_BITMAP_SIDE_PX) canvas.height = TILED_INPUT_BITMAP_SIDE_PX;
  if (PERF_MARKS) performance.mark('engine.resize.tiles:start');
  const tiledRendererResized = resizeTiledRenderer(paper.pxW, paper.pxH, renderScale, canvasEmpty);
  if (PERF_MARKS) performance.measure('engine.resize.tiles', 'engine.resize.tiles:start');
  applyPaperView(presentation);

  resizeMagicSheet(magicActive);
  if (
    (tiledRendererResized || repaintRecoveredPixels) &&
    !canvasEmpty &&
    !repaintDeferredToRestore
  ) {
    if (PERF_MARKS) performance.mark('engine.resize.repaint:start');
    repaintTiledRenderer();
    if (PERF_MARKS) performance.measure('engine.resize.repaint', 'engine.resize.repaint:start');
  }

  refreshCanvasRect(rect);
  notifyViewChange();

  if (PERF_MARKS) performance.measure('engine.resize', 'engine.resize:start');
}

// A desktop window-edge drag fires resize continuously, and every backing-store
// reassignment in resizeCanvas() wipes the canvas and forces a repaint. The
// resize listener refreshes the cached rect immediately (so pointer mapping
// tracks the moving layout) but defers the wipe + rebuild until the size
// settles. Native skips the debounce: rotation is a single resize event, and
// delaying its rebuild would only prolong the stretched frame. Exported so the
// dev harness's resizeTo() can wait out the settle window.
export const RESIZE_SETTLE_MS = 150;
let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;

function handleResize() {
  if (__IS_CAPACITOR__) {
    resizeCanvas();
    return;
  }
  refreshCanvasRect();
  if (resizeSettleTimer !== null) clearTimeout(resizeSettleTimer);
  resizeSettleTimer = setTimeout(() => {
    resizeSettleTimer = null;
    resizeCanvas();
  }, RESIZE_SETTLE_MS);
}

// A hidden document gets no resize/orientationchange, so rotating the device
// while the app is backgrounded leaves the backing store, the cached rect, and
// the paper view stale until some later event happens to fire. On re-entry
// Browser visibility and Capacitor's document-level resume event both land
// here. Rebuild synchronously only when the geometry actually moved while away,
// so a plain tab switch doesn't pay the backing-store wipe + repaint.
function resyncOnReentry() {
  if (document.visibilityState !== 'visible') return;
  const rect = canvas.getBoundingClientRect();
  const { w, h } = backingSizeOf(rect);
  const stale =
    viewport.width !== w || viewport.height !== h || resizedAngle !== currentScreenAngle();
  if (stale) {
    const contextsRecovered = recoverTiledRendererIfNeeded(false);
    resizeCanvas(rect, { repaintRecoveredPixels: contextsRecovered });
  } else {
    recoverTiledRendererIfNeeded();
    refreshCanvasRect(rect);
  }
}

// --- Stroke rendering -------------------------------------------------------

// One undo command + one empty-state flip per stroke group (all fingers down
// together). Opened the first time the group paints a pixel — deferred so a
// buffered edge-swipe candidate that's later discarded never pollutes the undo
// stack or the empty flag. Reset when the last finger lifts.
let groupHasDrawn = false;

function recordCurrentOp(op: StrokeOp) {
  recordTiledOp(op);
}

function beginStrokeGroup() {
  if (groupHasDrawn) return;
  beginTiledCommand(canvasEmpty);
  setCanvasEmptyState(false);
  groupHasDrawn = true;
}

// A mid-gesture brush switch can interleave a non-crayon op into a group whose
// crayon pass is open. Flush at that boundary so tile compositing preserves the
// operation order; continued crayon ops open a fresh pass.
function closeCrayonPassBeforeForeignOp(ps: PointerState) {
  const hasOpenPass = crayonOpsSinceFlush > 0;
  if (!(ps.crayon && !ps.erase) && hasOpenPass) recordCrayonFlush();
}

// The five style modifiers every `dot`/`path` op carries. Erasing clears pixels
// via destination-out; the stroke color is irrelevant there, only its (opaque)
// alpha matters. A magic op ignores `color` too — it reveals the sheet — but
// carries it so every op is style-complete.
function strokeStyleOf(
  ps: PointerState
): Pick<PointerState, 'color' | 'erase' | 'magic' | 'crayon' | 'seed'> {
  return { color: ps.color, erase: ps.erase, magic: ps.magic, crayon: ps.crayon, seed: ps.seed };
}

// Paint the round dot that anchors a stroke at its start point, and kick the
// drawing sound. Used both for a normal pointerdown and when a deferred
// edge-swipe candidate commits.
function renderStrokeStart(ps: PointerState) {
  beginStrokeGroup();
  closeCrayonPassBeforeForeignOp(ps);

  const dot: StrokeOp = {
    kind: 'dot',
    x: ps.x,
    y: ps.y,
    radius: ps.lineWidth / 2,
    ...strokeStyleOf(ps),
  };
  renderTiledOp(dot);
  recordCurrentOp(dot);

  callbacks.onDrawSound?.({ speed: 0, isStrokeStart: true });
}

// One quadratic segment per input point: the path runs midpoint-to-midpoint
// with the raw point as the control, so consecutive segments share a tangent
// and the stroke curves smoothly instead of showing straight-chord corners.
// Each call is captured as one path op (matching its own beginPath/stroke
// boundary) so live rendering, history replay, and export share the same
// anti-aliasing behavior.
function strokeSmoothSegments(ps: PointerState, points: Point[], moveCount = 1) {
  if (points.length === 0) return;
  closeCrayonPassBeforeForeignOp(ps);
  const op: StrokeOp = {
    kind: 'path',
    pid: ps.id,
    startX: ps.midX,
    startY: ps.midY,
    segs: [],
    lineWidth: ps.lineWidth,
    ...strokeStyleOf(ps),
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
  renderTiledOp(op);
  recordCurrentOp(op);
  // Counted in POINTERMOVES, not in ops. ADR-0085 specifies one increment per
  // recorded path op, which was the same thing when an op was exactly one
  // pointermove. Rasterizing once per frame merges every move in a frame into a
  // single op, so counting ops would stretch the pass to twice the wax before a
  // checkpoint — ADR-0085 trial 23's failure, measured here as physical-iPad
  // crayon going from 1.57% to 2.11% of in-contact frame time lost.
  if (ps.crayon && !ps.erase) {
    crayonOpsSinceFlush += moveCount;
    if (crayonOpsSinceFlush >= CRAYON_CHECKPOINT_OPS) {
      recordCrayonFlush();
      ps.seed = crayonSeedCounter++;
      ps.passTracker = new CrayonPassTracker(ps.x, ps.y, ps.lineWidth);
    }
  }
}

// Crayon-aware segment routing: feed each point through the stroke's pass
// tracker, and where it detects the gesture re-covering its own laid strip
// (a scribble reversal, a loop closing), flush the points so far as ops of the
// current pass, then bump to a fresh seed for the rest — real wax doesn't care
// whether the crayon lifted before re-covering a spot, so mid-stroke overdraw
// must build up exactly like a fresh stroke does. The flush boundary reuses
// strokeSmoothSegments' own start/mid bookkeeping, so the drawn PATH is
// identical to the unsplit one — only the pattern phase of the later ops
// changes. Seeds are stored per op, so every replay reproduces the splits.
function strokeCrayonSegments(ps: PointerState, points: Point[], moveCount = 1) {
  let batch: Point[] = [];
  for (const p of points) {
    if (ps.passTracker!.advance(p) === 'split') {
      // A split flushes and resets the counter itself, so the moves in the
      // batch it closes cannot carry toward the next checkpoint.
      strokeSmoothSegments(ps, batch, 0);
      batch = [];
      recordCrayonFlush();
      ps.seed = crayonSeedCounter++;
      ps.passTracker = new CrayonPassTracker(ps.x, ps.y, ps.lineWidth);
      ps.passTracker.advance(p);
    }
    batch.push(p);
  }
  strokeSmoothSegments(ps, batch, moveCount);
}

function strokeSegments(ps: PointerState, points: Point[], moveCount = 1) {
  if (ps.passTracker) strokeCrayonSegments(ps, points, moveCount);
  else strokeSmoothSegments(ps, points, moveCount);
}

export interface HarnessStrokeReplay {
  color: string;
  points: Point[];
  size: StrokeSize;
}

export function replayHarnessStroke(replay: HarnessStrokeReplay): void {
  if (!dev && !__DEV_HARNESS__) throw new Error();
  const { color, points, size } = replay;
  if (points.length === 0) return;
  if (eraserActive) throw new Error('Store drawing replay does not support the eraser');
  if (!engineLive) throw new Error('Drawing engine is not live');
  if (activePointers.size > 0 || penStreamAdopter.hasCanvasExit()) {
    throw new Error('Cannot replay a stroke while pointer input is active');
  }

  const rect = measure.rect;
  if (rect.width === 0 || rect.height === 0) throw new Error('Drawing canvas is not measured');
  const screenPoints = points.map(({ x, y }) => ({
    x: (x * viewport.width) / rect.width,
    y: (y * viewport.height) / rect.height,
  }));
  const paperPoints = screenPoints.map(screenToPaper);
  const first = paperPoints[0];
  const lineWidth = getStrokeWidthPx(size) * renderScale;
  const pointerState: PointerState = {
    id: -1,
    x: first.x,
    y: first.y,
    midX: first.x,
    midY: first.y,
    startX: screenPoints[0].x,
    startY: screenPoints[0].y,
    color,
    lineWidth,
    erase: eraserActive,
    magic: magicActive,
    crayon: crayonActive,
    seed: crayonActive ? crayonSeedCounter++ : 0,
    passTracker:
      crayonActive && !eraserActive && !magicActive
        ? new CrayonPassTracker(first.x, first.y, lineWidth)
        : null,
    lastTime: 0,
    speedSamples: [],
    edgeSwipeGuard: null,
    pendingPoints: [],
    pendingRaster: [],
  };

  renderStrokeStart(pointerState);
  for (const point of paperPoints.slice(1)) strokeSegments(pointerState, [point]);
  if (pointerState.passTracker) recordCrayonFlush();
  finishStrokeGroup();
}

// Push the finished stroke group onto the undo log (once per group, when the
// last finger lifts) and tell reactive consumers. While an undo restore is
// still pending on the paper chain the copy+fold defers behind it (see
// queuePaperStep) so it lands on the restored paper. onStrokeEnd fires at
// stroke end, not start, so consumers (e.g. mounting the install banner)
// never do DOM work while a finger is mid-stroke.
function commitStrokeGroup() {
  if (PERF_MARKS) performance.mark('engine.commit:start');
  try {
    if (!commitTiledCommand()) return;
    setCanUndo(true);
    callbacks.onStrokeEnd?.();
  } finally {
    if (PERF_MARKS) {
      performance.mark('engine.commit:end');
      performance.measure('engine.commit', 'engine.commit:start', 'engine.commit:end');
    }
  }
}

// The last pointer of a group is gone: reset the per-group flag, commit, and let
// consumers know drawing has stopped.
function finishStrokeGroup(notifyDrawStop = true) {
  groupHasDrawn = false;
  commitStrokeGroup();
  // An off-canvas pen lift passes false because pointerout stopped its audio segment.
  if (notifyDrawStop) callbacks.onDrawStop?.();
}

// --- Pointer tracking -------------------------------------------------------

// x/y/midX/midY are PAPER coordinates (the space ops are recorded in).
// startX/startY and pendingPoints are SCREEN (backing-store) coordinates: they
// exist only for the edge-swipe guard, whose geometry is physical — see
// pointerToScreen(). A committed candidate maps its buffered points to paper.
interface PointerState {
  id: number;
  x: number;
  y: number;
  midX: number;
  midY: number;
  startX: number;
  startY: number;
  color: string;
  lineWidth: number;
  erase: boolean;
  magic: boolean;
  crayon: boolean;
  seed: number;
  // Live pass-split detector for a crayon stroke (null for every other tool):
  // when the gesture re-covers its own laid strip, the seed bumps so buildup
  // happens mid-stroke. Replaced with a fresh instance at each split.
  passTracker: CrayonPassTracker | null;
  lastTime: number;
  speedSamples: { t: number; distance: number }[];
  // Non-null while a touch that began in a guarded edge's gesture band hasn't
  // decided its direction yet: render nothing and buffer its points until it
  // either commits (any non-inward movement, or a stationary tap on lift) or is
  // discarded as an OS edge-swipe (an inward flick). See the edge-swipe notes
  // at startDrawing().
  edgeSwipeGuard: GuardEdge | null;
  pendingPoints: Point[];
  // Paper points delivered since the last raster flush, one entry per
  // pointermove. Rasterizing them together once a frame is what keeps a
  // digitizer that outruns the display from making the engine paint the same
  // presentable frame several times over.
  pendingRaster: RasterBatch[];
}

const activePointers = new Map<number, PointerState>();

function finishGroupWhenCanvasIdle() {
  if (activePointers.size > 0) return;
  if (penStreamAdopter.hasCanvasExit()) callbacks.onDrawStop?.();
  else finishStrokeGroup();
}

// Pointer speed (which drives the drawing sound) is averaged over the most
// recent slice of the stroke so the audio cue tracks gesture speed without
// reacting to every per-frame jitter.
const SPEED_WINDOW_MS = 100;

// Start a fresh sliding speed window. The first entry is a zero-distance anchor
// so the very first move has a span to divide by, and lastTime is realigned to
// the same instant.
function resetSpeedWindow(ps: PointerState, now: number): void {
  ps.speedSamples = [{ t: now, distance: 0 }];
  ps.lastTime = now;
}

// OS safe-area insets in CSS px, pushed from the canvas's owner component. Used
// only to additionally guard a tablet's long bottom edge in landscape (see the
// edge-swipe notes at startDrawing).
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// Release pointer capture without throwing when the pointer isn't (or is no
// longer) captured — the hasPointerCapture pre-check plus the swallow-all catch
// make this safe to call unconditionally at every teardown site.
function releaseCaptureSafe(id: number): void {
  try {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(id)) {
      canvas.releasePointerCapture(id);
    }
  } catch {}
}

// The iPad/Android system gesture for the home/menu bar is a swipe inward from
// the device's physical-bottom edge, so a touch starting in that edge's gesture
// band is probably not a stroke. Such a touch is buffered, not drawn, until it
// has travelled the decision distance: a swipe inward (perpendicular to the
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
function startDrawing(e: PointerEvent) {
  idleEmptyScan.cancel();
  const timeSinceColorChange = Date.now() - lastColorChangeTime;
  const requiredDelay = e.pointerType === 'pen' ? 0 : COLOR_CHANGE_DEBOUNCE_MS;
  if (timeSinceColorChange < requiredDelay) return;

  const screen = pointerToScreen(e);
  const { x, y } = screenToPaper(screen);
  if (!isIdentityView(paperView) && (x < 0 || y < 0 || x > paper.pxW || y > paper.pxH)) {
    return;
  }

  // Re-entry gets fresh pointer geometry below without closing the physical gesture's command.
  penStreamAdopter.consumeCanvasExit(e.pointerId);

  // The eraser runs a bit larger than the pen at the same stroke level. Stroke
  // widths are authored in CSS pixels, so they scale to backing-store pixels.
  const lineWidth =
    (eraserActive ? currentLineWidth * ERASER_SIZE_MULTIPLIER : currentLineWidth) * renderScale;

  const edgeSwipeGuard =
    e.pointerType === 'touch'
      ? guardedEdgeAt(screen.x, screen.y, {
          width: viewport.width,
          height: viewport.height,
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
    startX: screen.x,
    startY: screen.y,
    color: currentColor,
    lineWidth,
    erase: eraserActive,
    magic: magicActive,
    crayon: crayonActive,
    seed: crayonActive ? crayonSeedCounter++ : 0,
    passTracker:
      crayonActive && !eraserActive && !magicActive ? new CrayonPassTracker(x, y, lineWidth) : null,
    // Speed-window fields are seeded by resetSpeedWindow() immediately below.
    lastTime: 0,
    speedSamples: [],
    edgeSwipeGuard,
    pendingPoints: [],
    pendingRaster: [],
  };
  resetSpeedWindow(pointerState, now);
  activePointers.set(e.pointerId, pointerState);

  // A candidate paints nothing yet — renderStrokeStart runs later, on commit.
  if (!edgeSwipeGuard) {
    renderStrokeStart(pointerState);
    const { pointerId, clientX, clientY } = e;
    callbacks.onStrokeStart?.({ pointerId, clientX, clientY, magic: magicActive });
  }

  // Capture every pointer — pen included — so a stroke keeps flowing to the
  // canvas when it crosses a floating control (Clear button, Actions Panel) or
  // the canvas edge, instead of ending on the pointerout that fires there.
  // Without capture, Apple Pencil strokes were silently cut short at those spots
  // (touch was already captured, so it never had the problem).
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
}

// A buffered edge-swipe candidate turned out to be a real stroke: render its
// start dot and flush every point withheld while the direction was undecided,
// then let it draw normally from here on.
function commitEdgeSwipe(ps: PointerState) {
  ps.edgeSwipeGuard = null;
  renderStrokeStart(ps);
  if (ps.pendingPoints.length > 0) {
    strokeSegments(ps, ps.pendingPoints.map(screenToPaper));
    ps.pendingPoints = [];
  }
  // Restart speed sampling from the commit point so the buffered span doesn't
  // register as one giant first chord.
  resetSpeedWindow(ps, Date.now());
}

// Drop a pointer without rendering anything (an OS edge-swipe). Nothing was
// painted, so undo/empty state and the group flag are left untouched.
// Discarding the last live pointer does end the group here (flag reset
// included): the discarded id gets no later stopDrawing tail to complete it.
function discardPointer(e: PointerEvent) {
  activePointers.get(e.pointerId)?.pendingRaster.splice(0);
  activePointers.delete(e.pointerId);
  releaseCaptureSafe(e.pointerId);
  finishGroupWhenCanvasIdle();
}

// Edge-gesture candidate: withhold rendering until the direction is decided.
// The buffered points and the direction test stay in screen space (physical
// edges); commitEdgeSwipe maps them to paper coordinates when they turn out
// to be a real stroke.
function advanceEdgeSwipeCandidate(ps: PointerState, screenPoints: Point[], e: PointerEvent) {
  ps.pendingPoints.push(...screenPoints);
  const last = screenPoints[screenPoints.length - 1];
  const dx = last.x - ps.startX;
  const dy = last.y - ps.startY;
  if (!edgeSwipeDirectionDecided(Math.hypot(dx, dy), renderScale)) return;
  // Decided. A mostly-inward flick (within ~45° of perpendicular, toward the
  // canvas centre) is the OS gesture — discard the whole stroke. Anything else
  // is a real stroke; commit it and let the next pointermove draw normally.
  if (edgeSwipeIsOsGesture(ps.edgeSwipeGuard!, dx, dy)) {
    discardPointer(e);
  } else {
    commitEdgeSwipe(ps);
  }
}

// iOS/WebKit can silently merge a fast tap-then-drag into one pointer stream: it
// drops the intervening pointerup + pointerdown and resumes the SAME pointerId
// at the new spot, with no coalesced samples bridging the gap. draw() would then
// curve from the old position to the resumed one — a stray straight line
// joining what should be two separate strokes. A long idle gap AND a jump too
// large for continuous contact together mean the finger really lifted, so the
// stroke is restarted at the resumed point. The gap/jump thresholds and the
// decision predicate live in ./strokeMath (pointerWasResumed).
function restartStrokeIfResumed(ps: PointerState, resume: Point, now: number) {
  const deltaX = resume.x - ps.x;
  const deltaY = resume.y - ps.y;
  const jump = Math.hypot(deltaX, deltaY);
  if (!pointerWasResumed(now - ps.lastTime, jump, Math.min(paper.pxW, paper.pxH))) return;
  ps.x = resume.x;
  ps.y = resume.y;
  ps.midX = resume.x;
  ps.midY = resume.y;
  resetSpeedWindow(ps, now);
  // The finger really lifted, so a crayon's next contact is physically a fresh
  // pass — close the current one (stamp + recorded flush), new seed, tracker
  // restarted at the resumed point.
  if (ps.passTracker) {
    recordCrayonFlush();
    ps.seed = crayonSeedCounter++;
    ps.passTracker = new CrayonPassTracker(resume.x, resume.y, ps.lineWidth);
  }
}

// Speed is sampled from the final event only: one chord per pointermove,
// matching the cadence the sliding window was tuned for.
function strokeSpeed(ps: PointerState, last: Point, now: number): number {
  const deltaX = last.x - ps.x;
  const deltaY = last.y - ps.y;
  const distance = Math.hypot(deltaX, deltaY);
  return calculateStrokeSpeed(ps.speedSamples, { t: now, distance }, SPEED_WINDOW_MS);
}

const rasterQueue = createStrokeRasterQueue<PointerState>({
  activePointers,
  paperMinEdge: () => Math.min(paper.pxW, paper.pxH),
  pointerWasResumed,
  restartStrokeIfResumed,
  strokeSpeed,
  strokeSegments,
  onFlushed: (speed) => callbacks.onDrawSound?.({ speed, isStrokeStart: false }),
});

function draw(e: PointerEvent) {
  const pointerState = activePointers.get(e.pointerId);

  // Canvas-targeted flavor of the merged-stream quirk (see penStreamQuirks.ts's
  // adoptStrayPenStream): adopt the down-less stream as the stroke start
  // instead of dropping the whole first stroke after a color pick.
  if (!pointerState && penStreamAdopter.isOrphanPenContact(e)) {
    startDrawing(e);
    return;
  }

  if (!pointerState) return;

  {
    e.preventDefault();

    // Browsers coalesce fast input to ~one pointermove per frame but keep the
    // intermediate samples; replay them all so quick scribbles don't render as
    // straight chords. Synthetic/untrusted events report an empty list — fall
    // back to the event itself.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const events = coalesced.length > 0 ? coalesced : [e];
    const screenPoints = events.map(pointerToScreen);

    const now = Date.now();

    if (pointerState.edgeSwipeGuard) {
      advanceEdgeSwipeCandidate(pointerState, screenPoints, e);
      return;
    }

    pointerState.pendingRaster.push({ points: screenPoints.map(screenToPaper), at: now });
    rasterQueue.schedule();
  }
}

function scanDrawingIsEmpty() {
  return scanTiledRendererIsEmpty(renderScale);
}

const idleEmptyScan = createIdleEmptyScan({
  isDrawing: () => activePointers.size > 0,
  run: () => setCanvasEmptyState(scanDrawingIsEmpty()),
});

function stopDrawing(e: PointerEvent) {
  // Everything below closes the stroke — the crayon pass stamp, the commit, the
  // eraser's empty scan — so the queued points have to become ink first.
  rasterQueue.flushAll();
  const pointerState = activePointers.get(e.pointerId);

  // Not a pointer this engine is tracking: a hovering mouse's pointerout, or a
  // trailing cancel for an id already dropped by discardPointer (which ended
  // the group itself). Nothing to close down — releasing capture we never took
  // is harmless, and covers a tracked pointer that never captured.
  if (!pointerState) {
    releaseCaptureSafe(e.pointerId);
    return;
  }

  // An edge-band touch that lifted before its direction was decided was a tap,
  // not a swipe — commit it (typically just the start dot). A pointercancel
  // (the OS took the gesture over) instead leaves it a candidate, so nothing is
  // rendered and the canvas state below is left alone.
  if (pointerState?.edgeSwipeGuard && e.type === 'pointerup') {
    commitEdgeSwipe(pointerState);
  }

  // A lifting crayon finger closes its deposition pass by stamping each tile's
  // buffered wax and recording the flush at the same point in the op order.
  // A discarded edge-swipe candidate rendered nothing, so it has no pass.
  if (pointerState?.passTracker && !pointerState.edgeSwipeGuard) {
    recordCrayonFlush();
  }

  activePointers.delete(e.pointerId);

  if (pointerState && !pointerState.edgeSwipeGuard && pointerState.erase) {
    idleEmptyScan.schedule();
  }

  finishGroupWhenCanvasIdle();
  releaseCaptureSafe(e.pointerId);
}

function finishPenCanvasExit(e: PointerEvent) {
  if (!penStreamAdopter.consumeCanvasExit(e.pointerId)) return;
  if (activePointers.size === 0 && !penStreamAdopter.hasCanvasExit()) finishStrokeGroup(false);
}

export function releaseAllPointers() {
  if (!ctx) return;
  rasterQueue.flushAll();

  // Force-releasing mid-flight crayon strokes closes their open pass so the
  // committed command ends stamped (one flush covers every open pass — the
  // buffer is shared per target).
  for (const ps of activePointers.values()) {
    if (ps.passTracker && !ps.edgeSwipeGuard) {
      recordCrayonFlush();
      break;
    }
  }

  const ids = [...activePointers.keys()];
  activePointers.clear();
  penStreamAdopter.clearCanvasExits();
  finishStrokeGroup();

  ids.forEach(releaseCaptureSafe);
}

// --- WebKit merged-stream pen quirks ---------------------------------------
// See penStreamQuirks.ts for the quirk itself; the adopter below is wired to
// this engine's canvas, pointer tracking, and stroke-start action.

const penStreamAdopter = createPenStreamAdopter({
  canvas: () => canvas,
  isTracked: (pointerId) => activePointers.has(pointerId),
  adopt: startDrawing,
});

export function forgetPenPointer(pointerId: number) {
  penStreamAdopter.forgetPointer(pointerId);
}

const cancelTouch = (e: TouchEvent) => e.preventDefault();

// --- Undo, clear, and canvas-empty API --------------------------------------

export function undo(): Promise<void> {
  if (!canUndo || !canvas || !ctx) return Promise.resolve();
  if (PERF_MARKS) performance.mark('engine.undo:start');
  const recordedPaper =
    activePointers.size === 0 && !penStreamAdopter.hasCanvasExit()
      ? peekTiledUndoPaper()
      : undefined;
  if (recordedPaper) setCanvasEmptyState(false, recordedPaper, true);
  const state = undoTiledCommand(renderScale);
  setCanvasEmptyState(state.empty, state.recordedPaper);
  setCanUndo(state.canUndo);
  state.restoreAppearance?.();
  if (PERF_MARKS) {
    performance.mark('engine.undo:end');
    performance.measure('engine.undo', 'engine.undo:start', 'engine.undo:end');
  }
  return Promise.resolve();
}

export function setColorSheet(colorUrl: string | null) {
  setMagicColorSheet(colorUrl);
  if (!colorUrl && hasRetainedTiledMagicOps()) {
    ensureMagicSheet();
    recodeMagicOpsToCurrentSheet();
  }
}

export function prepareMagicSheetRecode(targetUrl: string | null, restoreAppearance: () => void) {
  const targetSourceKey = targetUrl ? pageCompositionKey(targetUrl) : null;
  const prepared = beginTiledMagicRecode(targetSourceKey, restoreAppearance);
  if (targetUrl) deferColorSheet(targetUrl);
  if (prepared) setCanUndo(true);
  return prepared;
}

export function clearCanvas() {
  if (!canvas || !ctx) return;
  const state = clearTiledRenderer(canvasEmpty);
  crayonOpsSinceFlush = 0;
  setCanvasEmptyState(state.empty);
  setCanUndo(state.canUndo);
  clearMagicGradient();
  if (magicActive) ensureMagicSheet();
}

export function isCanvasEmpty(): boolean {
  return canvasEmpty;
}

// Test/profiling seam: how tiled undo history is currently stored.
export function getUndoDebug(): HistoryDebug {
  if (!dev && !__DEV_HARNESS__ && !PERF_MARKS) throw new Error();
  return tiledHistoryDebug();
}

export function getLiveSurfaceTopology() {
  if (!dev && !__DEV_HARNESS__ && !PERF_MARKS) throw new Error();
  return tiledSurfaceTopologyDebug();
}

export function getDrawingWorkDebug(): DrawingWorkDebug | null {
  if (!dev && !__DEV_HARNESS__) throw new Error();
  return tiledWorkDebug();
}

// Dev A/B seam (ADR-0065 tuning): override the crayon tooth/coverage/pass knobs
// so one build can sweep render variants and the winner ships as the default.
// Wired onto window.__engine only on the /dev/engine page; production never calls
// it and keeps crayonBrush.ts's tuned defaults. After a change, repaint so the
// retained crayon ops pick up the new tooth; strokes already compacted into the
// tiled history base keep the pixels they were drawn with.
export function setCrayonParams(params: Partial<CrayonOptions>) {
  if (!dev && !__DEV_HARNESS__) return;
  setCrayonOptions(params);
  syncCrayonOverlayMix();
  if (ctx) repaintTiledRenderer();
}

// --- Mount / unmount ---------------------------------------------------------

let engineLive = false;
let listenerRemovers: (() => void)[] = [];

function attachCallbacks(options: InitOptions) {
  const { initialColor: _initialColor, ...rest } = options;
  callbacks = rest;
}

function teardownEngine() {
  if (!engineLive) return;
  engineLive = false;
  for (const remove of listenerRemovers) remove();
  listenerRemovers = [];
  if (resizeSettleTimer !== null) {
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = null;
  }
  measure.cancel();
  // Pointer-input state must not outlive the mount, unlike tiled drawing
  // history: a stale
  // activePointers entry surviving into a remount would let hover moves paint
  // after a remount reuses its pointerId, and the pen-stream adopter loses its
  // self-healing window trackers above. releaseAllPointers also commits any
  // mid-flight stroke into the log, so navigating away mid-stroke keeps
  // the ink.
  releaseAllPointers();
  crayonOpsSinceFlush = 0;
  idleEmptyScan.cancel();
  cancelCrayonWarmup();
  penStreamAdopter.reset();
  detachTiledRenderer();
  // After the pointer release above has fired its stop/commit callbacks,
  // detach them all: a torn-down engine (e.g. a deferred fold settling after
  // navigation) must never signal an unmounted component. The next adopt or
  // init re-attaches.
  attachCallbacks({});
}

export function engineOwnsCanvas(canvasElement: HTMLCanvasElement): boolean {
  return engineLive && canvas === canvasElement;
}

// Adopt the already-running engine (ADR-0072): attach the component's
// callbacks and replay the current state to the new subscriber — strokes may
// have landed between early boot and this mount, so canUndo / canvasEmpty /
// the paper view push immediately instead of waiting for their next change.
// Falls back to a full init when the engine isn't live on this exact element
// (client-side navigation back to `/` remounts a fresh canvas; a hydration
// fallback can replace the prerendered one). Either way the returned teardown
// is the full engine teardown, keeping mount/unmount symmetric. On the adopt
// path options.initialColor is deliberately ignored — the running engine
// already holds the same default, and the component's $effect pushes the live
// color right after mount.
export function adoptDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  if (!engineOwnsCanvas(canvasElement)) return initDrawingCanvas(canvasElement, options);
  attachCallbacks(options);
  callbacks.onUndoStateChange?.(canUndo);
  callbacks.onCanvasEmptyChange?.(canvasEmpty);
  notifyViewChange();
  return { teardown: teardownEngine };
}

function paperIsSized(): boolean {
  return paper.pxW > 0 && paper.pxH > 0;
}

function recodeMagicOpsToCurrentSheet() {
  if (!ctx) return;
  const snapshot = captureMagicSheet();
  if (!snapshot) return;
  recodeTiledMagicOps(snapshot, snapshot.sourceUrl ? pageCompositionKey(snapshot.sourceUrl) : null);
}

function wireMagicBrushHost(): void {
  // The magic brush's color sheet lives in paper coordinates (like every op) and
  // recodes recorded magic ops once an async fill finishes decoding
  // (ADR-0043/0121).
  initMagicBrush({
    paperSize: () => (paperIsSized() ? { width: paper.pxW, height: paper.pxH } : null),
    sheetBounds: () => (paperIsSized() ? sheetBoundsPaper() : null),
    repaint: recodeMagicOpsToCurrentSheet,
  });
}

export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  // Re-init over a live engine (dev HMR double-eval, the adopt fallback after
  // hydration replaced the canvas element) tears the previous instance down
  // first so window listeners and crayon overlays never double up.
  teardownEngine();
  canvas = canvasElement;
  // NB: no `desynchronized: true` here. It was tried for lower Android ink
  // latency and rejected — a desynchronized 2D canvas is promoted to a hardware
  // overlay that does not alpha-composite with content below it, so this
  // deliberately transparent canvas (the paper sheet + coloring overlay render
  // beneath it, ADR-0050) rendered as opaque black on the Android WebView. See
  // ADR-0051.
  ctx = canvas.getContext('2d')!;

  adoptTiledRenderer(canvas, {
    paperSize: () => (paperIsSized() ? { width: paper.pxW, height: paper.pxH } : null),
    recordedPaper: recordedPaperState,
    hasActivePointers: () => activePointers.size > 0 || penStreamAdopter.hasCanvasExit(),
  });
  syncCrayonOverlayMix();
  wireMagicBrushHost();

  attachCallbacks(options);
  currentColor = options.initialColor || DEFAULT_STROKE_COLOR;
  renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
  resizeCanvas();

  registerDrawingEngineListeners(listenerRemovers, canvas, {
    handleResize,
    refreshCanvasRect: () => refreshCanvasRect(),
    resyncOnReentry,
    startDrawing,
    draw,
    stopDrawing,
    finishPenCanvasExit,
    trackPenCanvasExit: penStreamAdopter.trackCanvasExit,
    cancelTouch,
    registerPenListeners: penStreamAdopter.registerWindowListeners,
  });

  // Warm the export compositor + paper texture at idle: the module is
  // dynamic-imported so it stays out of the startup bundle (issue #461), and
  // pre-loading it here means the first save doesn't stall on the chunk fetch
  // or the texture decode (~226ms). Best-effort — a failed warm just retries
  // at save time.
  scheduleIdle(() => {
    void import('./exportDrawing').then((m) => m.warmPaperTexture()).catch(() => {});
  });

  engineLive = true;
  scheduleTiledHistoryFold();
  return { teardown: teardownEngine };
}

// --- Tool state pushed in by components --------------------------------------

export function setColor(color: string) {
  // Only a genuine change arms the debounce. The reactive bridge in
  // DrawingCanvas re-pushes the current color on mount (and on unrelated
  // store updates); arming on those would swallow the user's first stroke.
  if (color === currentColor) return;
  currentColor = color;
  lastColorChangeTime = Date.now();
  // Warm the new colour's wax tiles while the finger is still on the swatch,
  // so the first crayon draw never pays the tile build inside a frame.
  if (crayonActive) warmCrayonTiles(color);
}

export function setStrokeWidth(widthPx: number) {
  currentLineWidth = widthPx;
}

export function setEraserMode(active: boolean) {
  eraserActive = active;
}

// Magic brush on/off (ADR-0043). Mutually exclusive with the eraser at the UI
// level; the engine just tracks the flag and stamps it onto each op. Selecting the
// brush over a blank canvas locks in a random rainbow to reveal (a no-op when a
// coloring page is applied, or when a rainbow is already held from before).
export function setMagicMode(active: boolean) {
  magicActive = active;
  if (active) ensureMagicSheet();
}

// The brush mode the engine has COMMITTED — the mode a stroke started right now
// would paint in, resolved with renderOp's own precedence (magic outranks the
// eraser, which outranks crayon's texture; see strokeOps.renderOp), so it can
// never claim a mode the renderer would not honour.
//
// Test-only seam (ADR-0080). The mode toggles above are pushed from a Svelte
// $effect, so the button reports the new brush before the engine holds it, and a
// stroke dispatched in that window commits under the PREVIOUS brush. Nothing
// observable from the DOM distinguishes the two — a pen stroke fills the canvas
// exactly like a reveal — so the E2E harness waits on this instead of on
// `aria-pressed`. Reached only through lib/boot/devHarnessSeam.ts, which
// publishes it on `window` for test-harness and PERF_MARKS builds; release
// builds have no caller.
export function committedBrushMode(): BrushType {
  if (magicActive) return 'magic';
  if (crayonActive && !eraserActive) return 'crayon';
  return eraserActive ? 'eraser' : 'pen';
}

// Crayon brush on/off (ADR-0065). Like the eraser/magic it's a modifier the
// engine just tracks and stamps onto each op; renderOp turns a crayon op's solid
// colour into textured wax. Mutually exclusive with the eraser and magic brush
// at the UI level.
export function setCrayonMode(active: boolean) {
  crayonActive = active;
  if (active) warmCrayonTiles(currentColor);
  else cancelCrayonWarmup();
}

// CSS-px OS safe-area insets, used to decide which edges sit under a system
// gesture zone (see the edge-swipe notes at startDrawing). Pushed by the
// canvas's owner component on mount and whenever orientation/inset changes.
export function setSafeAreaInsets(insets: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}) {
  safeInsets = insets;
}

// --- Export -------------------------------------------------------------------

// Capture strokes in upright paper space rather than the CSS-presented view.
type StrokeSnapshots = { export: ExportSnapshot; preview: TiledExportSnapshot | null };

export interface CanvasExportPreparation {
  complete(options?: ExportOptions): Promise<Blob | null>;
  cancel(): void;
}

function snapshotStrokes(snapshotScale: number, capturePreview: boolean): StrokeSnapshots {
  const width = Math.round((paper.pxW / renderScale) * snapshotScale);
  const height = Math.round((paper.pxH / renderScale) * snapshotScale);
  const tiledSnapshot = captureTiledSnapshot(snapshotScale, renderScale);
  if (tiledSnapshot) return { export: tiledSnapshot, preview: null };
  const preview = capturePreview ? captureLiveTileSnapshot(renderScale) : null;
  return {
    export: createStrokeSnapshot(width, height, snapshotScale / renderScale, (target) => {
      renderTiledSnapshot(target);
      // An in-flight crayon stroke's open pass sits unstamped on the pass buffer
      // (its flush is only recorded at pass close); an export is terminal for this
      // snapshot, so stamp it now rather than dropping that ink.
      flushCrayonBuffer(target);
    }),
    preview,
  };
}

function closeTiledExportSnapshot(snapshot: TiledExportSnapshot | null) {
  if (!snapshot) return;
  for (const { bitmap } of snapshot.source.tiles) {
    void bitmap.then(
      (resolved) => resolved.close(),
      () => undefined
    );
  }
}

function closeStrokeSnapshots(snapshots: StrokeSnapshots) {
  if ('source' in snapshots.export) closeTiledExportSnapshot(snapshots.export);
  closeTiledExportSnapshot(snapshots.preview);
}

export function prepareCanvasExport(capturePreview = true): CanvasExportPreparation | null {
  if (!canvas || paper.pxW === 0 || paper.pxH === 0) return null;
  const overlaySource = getActiveOverlayExportSource();
  const scale = currentExportScale();
  // This snapshot must precede the compositor import: save-on-delete fire-and-forgets an export
  // and clears the live engine synchronously. web/tests/engine-export.spec.ts pins the race.
  const snapshots = snapshotStrokes(scale, capturePreview);
  let available = true;
  return {
    async complete(options: ExportOptions = {}) {
      if (!available) return null;
      available = false;
      let composeExportPng: (typeof import('./exportDrawing'))['composeExportPng'];
      try {
        ({ composeExportPng } = await import('./exportDrawing'));
      } catch (error) {
        closeStrokeSnapshots(snapshots);
        throw error;
      }
      const exportOptions =
        snapshots.preview && options.preview
          ? { ...options, preview: { ...options.preview, source: snapshots.preview } }
          : options;
      if (exportOptions === options) closeTiledExportSnapshot(snapshots.preview);
      return composeExportPng(snapshots.export, scale, overlaySource, exportOptions);
    },
    cancel() {
      if (!available) return;
      available = false;
      closeStrokeSnapshots(snapshots);
    },
  };
}

// The compositor is save-time-only, so it loads on demand and stays out of the
// startup bundle (issue #461). A dead connection can reject the import —
// callers own surfacing that (their tap handlers catch).
export async function exportCanvasBlob(options: ExportOptions = {}): Promise<Blob | null> {
  return prepareCanvasExport(!!options.preview)?.complete(options) ?? null;
}
