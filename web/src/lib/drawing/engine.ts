// Imperative drawing engine (ADR-0004). Svelte components mount it via
// initDrawingCanvas() and adapt reactive state (active color, stroke width) by
// calling setColor() / setStrokeWidth() from $effect; the engine reports back
// through the callbacks passed at init (onDrawSound, onUndoStateChange, …).
//
// The engine is the conductor over focused modules — it owns the <canvas>, the
// paper coordinate space, all pointer tracking, and the public API, and
// delegates the rest:
//
//   strokeOps.ts        the op vocabulary + the one renderer every surface shares
//   undoHistory.ts      undo baseline + command log + keyframes (ADR-0033/0035)
//   commandSimplify.ts  commit-time stroke simplification (ADR-0036)
//   strokeMath.ts       pure gesture math (edge swipes, resume detection, speed)
//   strokeSimplify.ts   pure reduction geometry (RDP, span reconstruction)
//   paperView.ts        pure rotation-lock view geometry (ADR-0050)
//   magicBrush.ts       the magic brush's color sheet + paint pattern (ADR-0043)
//   emptyScan.ts        cheap blank-canvas detection
//   exportDrawing.ts    PNG composition for save/share

import { ERASER_SIZE_MULTIPLIER } from '$lib/state/strokeWidth.svelte';
import {
  calculateStrokeSpeed,
  edgeSwipeIsOsGesture,
  edgeSwipeDirectionDecided,
  guardedEdgeAt,
  pointerWasResumed,
  type GuardEdge,
} from './strokeMath';
import {
  computePaperView,
  isIdentityView,
  IDENTITY_PAPER_VIEW,
  rotationDelta,
  viewMatrix,
  viewToPaper,
  type PaperView,
} from './paperView';
import {
  initMagicBrush,
  rasterizeSheet,
  ensureMagicSheet,
  clearMagicGradient,
  setColorSheet,
} from './magicBrush';
import { renderOp, clearAllOf, type StrokeOp } from './strokeOps';
import {
  createCrayonStrokeGeometry,
  extendCrayonStrokeGeometry,
  finishCrayonStrokeGeometry,
  sampleQuadratic,
  warmCrayonColor,
  type CrayonPolygon,
  type CrayonStrokeGeometry,
} from './crayonBrush';
import {
  beginCommand,
  commandCount,
  commitActiveCommand,
  ensureBaselineCovers,
  getHistoryDebug,
  popCommand,
  pushCommand,
  rebaseActiveCommand,
  recordOp,
  replayAll,
  resetActiveCommandForClear,
  setKeyframeSegmentThreshold,
} from './undoHistory';
import { getSimplifyCounters, setSimplifyOptions, type SimplifyOptions } from './commandSimplify';
import { scanCanvasIsEmpty } from './emptyScan';
import { exportDrawing, warmPaperTextureWhenIdle, type ExportOptions } from './exportDrawing';
import { PERF_MARKS } from './perf';

export { setColorSheet };

// --- Canvas, tool, and callback state -------------------------------------

interface DrawSoundData {
  speed: number;
}

interface InitOptions {
  onDrawSound?: ((data: DrawSoundData) => void) | null;
  onDrawStop?: (() => void) | null;
  onUndoStateChange?: ((canUndo: boolean) => void) | null;
  onCanvasEmptyChange?: ((empty: boolean) => void) | null;
  onStrokeEnd?: (() => void) | null;
  onViewChange?: ((view: EngineViewState) => void) | null;
  initialColor?: string;
}

// Set in initDrawingCanvas() before any handler runs (definite-assignment `!`).
let canvas!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let currentColor = '';
let currentLineWidth = 8;
let eraserActive = false;
let magicActive = false;
let crayonActive = false;
let lastColorChangeTime = 0;

let onDrawSoundCallback: ((data: DrawSoundData) => void) | null = null;
let onDrawStopCallback: (() => void) | null = null;
let onUndoStateChange: ((canUndo: boolean) => void) | null = null;
let onCanvasEmptyChange: ((empty: boolean) => void) | null = null;
let onStrokeEnd: (() => void) | null = null;
let onViewChange: ((view: EngineViewState) => void) | null = null;

// Strokes rasterize at the device pixel ratio so they stay crisp on mobile
// screens, capped at 2× — DPR-3 panels would cost 9× the pixels for detail a
// finger-drawn stroke can't use (see ADR 0015). Fixed for the session at init:
// a mid-session DPR change (desktop zoom, monitor move) would otherwise need
// every pixel surface (visible canvas, baseline) rescaled in place.
const MAX_RENDER_SCALE = 2;
let renderScale = 1;

let canUndo = false;

function setCanUndo(value: boolean) {
  canUndo = value;
  if (onUndoStateChange) onUndoStateChange(value);
}

let canvasEmpty = true;

function setCanvasEmptyState(empty: boolean) {
  if (canvasEmpty === empty) return;
  canvasEmpty = empty;
  if (onCanvasEmptyChange) onCanvasEmptyChange(empty);
  // A blank canvas frees the locked paper to match the live viewport again
  // (clear, undo-to-blank, erase-to-blank): re-adopt right away instead of
  // leaving the child a letterboxed blank page until the next rotation.
  if (empty && activePointers.size === 0 && !isIdentityView(paperView)) resizeCanvas();
}

// --- Paper space and the rotation-lock view (ADR-0050) --------------------

// The paper: the coordinate space every recorded op, the baseline, the
// keyframes, and the magic sheet live in (ADR-0050). It tracks the viewport
// while the canvas is empty or the screen angle is unchanged (today's
// semantics), but a device rotation with ink on the canvas LOCKS it: the
// drawing keeps its space — and its tall/wide coloring page — and is instead
// *presented* through `paperView` (upright contain-fit + center, scaled down
// when the paper doesn't fit the rotated viewport), so nothing rotates
// off-screen and rotating back restores the exact layout.
let paper = { pxW: 0, pxH: 0, cssW: 0, cssH: 0 };
// Screen Orientation angle when the paper was adopted, so a later resize can
// tell an actual rotation (angle delta ≠ 0) from a plain viewport resize.
let paperAngle = 0;
// Screen Orientation angle the last resizeCanvas ran against. Unlike
// paperAngle it advances even when the paper stays locked, so the re-entry
// re-sync can tell whether the device rotated while the document was hidden.
let resizedAngle = 0;
let paperView: PaperView = IDENTITY_PAPER_VIEW;

// Dev/test seam (mirrors setSimplifyParams): pin the screen angle the engine
// reads so the /dev/engine harness can simulate a device rotation without a
// device. Production never calls the setter.
let screenAngleOverride: number | null = null;
export function setScreenAngleOverride(angle: number | null) {
  screenAngleOverride = angle;
}

function currentScreenAngle(): number {
  if (screenAngleOverride !== null) return screenAngleOverride;
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
  paperOrientation: 'portrait' | 'landscape';
}

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
  if (onViewChange) onViewChange(getViewState());
}

// --- Pointer → paper coordinate mapping ------------------------------------

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Cached canvas geometry so the pointer hot path never calls
// getBoundingClientRect() (each call forces a synchronous reflow). Recomputed
// only on resize/scroll/orientation change — see refreshCanvasRect().
let canvasRect: CanvasRect = { left: 0, top: 0, width: 0, height: 0 };
let rectScaleX = 1;
let rectScaleY = 1;

// Snapshot the canvas's client rect and the backing-pixel scale factors. Called
// only off the hot path (resize/scroll/orientation), so the per-pointermove
// pointerToScreen() can stay reflow-free.
function refreshCanvasRect() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  rectScaleX = rect.width ? canvas.width / rect.width : 1;
  rectScaleY = rect.height ? canvas.height / rect.height : 1;
}

// Backing-store (screen) coordinates of a pointer event — the physical space
// the edge-swipe gesture geometry runs in (OS gesture bands sit at device
// edges, which a locked paper's rotation would otherwise move).
function pointerToScreen(e: PointerEvent) {
  return {
    x: (e.clientX - canvasRect.left) * rectScaleX,
    y: (e.clientY - canvasRect.top) * rectScaleY,
  };
}

// Paper coordinates — the space ops are recorded and rendered in. Identity
// unless a rotation has locked the paper (see resizeCanvas / ADR-0050).
function screenToPaper(pt: { x: number; y: number }): { x: number; y: number } {
  return isIdentityView(paperView) ? pt : viewToPaper(paperView, pt.x, pt.y);
}

// The paper-coordinate rectangle that the whole visible canvas maps to — the
// region the magic sheet must cover so a stroke anywhere on screen samples colour.
// Identity view: exactly the paper (canvas == paper). Under a rotation lock the
// paper is contain-fit into the viewport, so the visible area spills into the
// letterbox margins around it — the mapped viewport corners give that larger
// rect (unioned with the paper for safety). Ops in those margins record at these
// out-of-paper coordinates, so the sheet is extended there too (ADR-0043/0050).
function sheetBoundsPaper(): { x: number; y: number; width: number; height: number } {
  if (isIdentityView(paperView)) return { x: 0, y: 0, width: paper.pxW, height: paper.pxH };
  let minX = 0;
  let minY = 0;
  let maxX = paper.pxW;
  let maxY = paper.pxH;
  for (const [x, y] of [
    [0, 0],
    [canvas.width, 0],
    [0, canvas.height],
    [canvas.width, canvas.height],
  ]) {
    const p = viewToPaper(paperView, x, y);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  return { x, y, width: Math.ceil(maxX) - x, height: Math.ceil(maxY) - y };
}

// The cached canvas client rect, so components can position pointer-following
// UI (e.g. the eraser cursor) without their own per-move getBoundingClientRect.
export function getCanvasRect(): CanvasRect {
  return canvasRect;
}

// --- Resize and rotation ----------------------------------------------------

// Adopt vs lock (ADR-0050): an empty canvas — or a same-angle resize (desktop
// window drag, mobile URL bar) — re-adopts the paper as the live viewport,
// exactly the pre-lock semantics. Only a rotation with ink on the canvas keeps
// the paper (and its angle) so the drawing can be presented instead of
// remapped. Returns whether the paper is locked.
function adoptPaperUnlessLocked(rect: DOMRect): boolean {
  const angle = currentScreenAngle();
  const lockPaper = !canvasEmpty && rotationDelta(paperAngle, angle) !== 0;
  if (!lockPaper) {
    paper = {
      pxW: Math.round(rect.width * renderScale),
      pxH: Math.round(rect.height * renderScale),
      cssW: rect.width,
      cssH: rect.height,
    };
    paperAngle = angle;
  }
  return lockPaper;
}

// Present the locked paper through the view: the visible ctx keeps painting in
// paper coordinates (live ops, replay, and the sheet pattern all map through
// the transform untouched), persisting until the next backing-store reset. The
// paper is presented UPRIGHT (view rotation 0): the picture rotates with the
// device and contain-fits — scaled down when it must — rather than
// counter-rotating to stay fixed on the glass (rejected in ADR-0050). A 180°
// flip on an unchanged viewport therefore computes an identity view.
//
// The margins around the fitted paper stay DRAWABLE (no clip): a child mid-
// scribble shouldn't hit dead zones. Margin ink records at out-of-paper
// coordinates — it renders and replays normally while its command is retained,
// is cropped by design when rotating back (and from exports), and may drop
// from rebuilds once folded/keyframed past the paper-square rasters. Rasters
// covering the mapped margins would cost tens of MB at 2× DPR (the fit maps a
// phone viewport to ~2× the paper's long side), so that corner is accepted —
// see ADR-0050.
function applyPaperView(lockPaper: boolean) {
  paperView = lockPaper
    ? computePaperView(
        { width: paper.pxW, height: paper.pxH },
        { width: canvas.width, height: canvas.height },
        0
      )
    : IDENTITY_PAPER_VIEW;
  if (!isIdentityView(paperView)) {
    ctx.setTransform(...viewMatrix(paperView));
  }
}

function resizeCanvas() {
  if (PERF_MARKS) performance.mark('engine.resize:start');
  const rect = canvas.getBoundingClientRect();
  const lockPaper = adoptPaperUnlessLocked(rect);
  resizedAngle = currentScreenAngle();

  // The undo baseline is a max(w,h) square of the paper so it covers both
  // orientations and rotation never loses pixels; anything larger (e.g. a
  // resized desktop window) goes through the grow path.
  ensureBaselineCovers(Math.ceil(Math.max(paper.pxW, paper.pxH)));

  // Resizing the backing store wipes the visible canvas and resets its context
  // state, so re-arm the round caps and repaint from the baseline + command log.
  canvas.width = Math.round(rect.width * renderScale);
  canvas.height = Math.round(rect.height * renderScale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applyPaperView(lockPaper);

  // The magic sheet is sized to the paper, so re-rasterize before replaying any
  // magic ops against it.
  rasterizeSheet();
  replayAll(ctx);

  refreshCanvasRect();
  notifyViewChange();

  if (PERF_MARKS) performance.measure('engine.resize', 'engine.resize:start');
}

// A desktop window-edge drag fires resize continuously, and every backing-store
// reassignment in resizeCanvas() wipes the canvas and forces a full replay. The
// resize listener refreshes the cached rect immediately (so pointer mapping
// tracks the moving layout) but defers the wipe + rebuild until the size
// settles. Native skips the debounce: rotation is a single resize event, and
// delaying its rebuild would only prolong the stretched frame. Exported so the
// dev harness's resizeTo() can wait out the settle window.
export const RESIZE_SETTLE_MS = 150;
let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;

function handleResize() {
  refreshCanvasRect();
  if (__IS_CAPACITOR__) {
    resizeCanvas();
    return;
  }
  if (resizeSettleTimer !== null) clearTimeout(resizeSettleTimer);
  resizeSettleTimer = setTimeout(() => {
    resizeSettleTimer = null;
    resizeCanvas();
  }, RESIZE_SETTLE_MS);
}

// A hidden document gets no resize/orientationchange, so rotating the device
// while the app is backgrounded leaves the backing store, the cached rect, and
// the paper view stale until some later event happens to fire. On re-entry
// (visibilitychange → visible; the native WebViews hide the document while the
// app is backgrounded, so this covers Capacitor resume too) rebuild
// synchronously — but only when the geometry actually moved while away, so a
// plain tab switch doesn't pay the backing-store wipe + full replay.
function resyncOnReentry() {
  if (document.visibilityState !== 'visible') return;
  const rect = canvas.getBoundingClientRect();
  const stale =
    canvas.width !== Math.round(rect.width * renderScale) ||
    canvas.height !== Math.round(rect.height * renderScale) ||
    resizedAngle !== currentScreenAngle();
  if (stale) resizeCanvas();
  else refreshCanvasRect();
}

// --- Stroke rendering -------------------------------------------------------

// One undo command + one empty-state flip per stroke group (all fingers down
// together). Opened the first time the group paints a pixel — deferred so a
// buffered edge-swipe candidate that's later discarded never pollutes the undo
// stack or the empty flag. Reset when the last finger lifts.
let groupHasDrawn = false;

function beginStrokeGroup() {
  if (groupHasDrawn) return;
  beginCommand(canvasEmpty);
  setCanvasEmptyState(false);
  groupHasDrawn = true;
}

// Paint the round dot that anchors a stroke at its start point, and kick the
// drawing sound. Used both for a normal pointerdown and when a deferred
// edge-swipe candidate commits.
function renderStrokeStart(ps: PointerState) {
  beginStrokeGroup();

  if (ps.crayon) {
    ps.crayonGeometry = createCrayonStrokeGeometry({ x: ps.x, y: ps.y }, ps.lineWidth / 2);
    if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });
    return;
  }

  // Erasing clears pixels via destination-out; the stroke color is irrelevant
  // there, only its (opaque) alpha matters. A magic op ignores `color` too — it
  // reveals the sheet — but carries it so a mid-stroke tool flip keeps a stable
  // style key for simplification.
  const dot: StrokeOp = {
    kind: 'dot',
    x: ps.x,
    y: ps.y,
    radius: ps.lineWidth / 2,
    color: ps.color,
    erase: ps.erase,
    magic: ps.magic,
  };
  renderOp(ctx, dot);
  recordOp(dot);

  ctx.beginPath();
  ctx.moveTo(ps.x, ps.y);

  if (onDrawSoundCallback) onDrawSoundCallback({ speed: 0 });
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
    magic: ps.magic,
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

function renderCrayonPolygons(ps: PointerState, polygons: CrayonPolygon[]) {
  if (polygons.length === 0) return;
  const op: StrokeOp = { kind: 'crayon', color: ps.color, polygons };
  renderOp(ctx, op);
  recordOp(op);
}

function strokeCrayonSegments(ps: PointerState, points: { x: number; y: number }[]) {
  const geometry = ps.crayonGeometry;
  if (!geometry || points.length === 0) return;
  const curvePoints: { x: number; y: number }[] = [];
  for (const point of points) {
    const mid = { x: (ps.x + point.x) / 2, y: (ps.y + point.y) / 2 };
    curvePoints.push(
      ...sampleQuadratic(
        { x: ps.midX, y: ps.midY },
        { x: ps.x, y: ps.y },
        mid,
        geometry.spacing / 2
      )
    );
    ps.x = point.x;
    ps.y = point.y;
    ps.midX = mid.x;
    ps.midY = mid.y;
  }
  renderCrayonPolygons(ps, extendCrayonStrokeGeometry(geometry, curvePoints));
}

function renderStrokeSegments(ps: PointerState, points: { x: number; y: number }[]) {
  if (ps.crayon) strokeCrayonSegments(ps, points);
  else strokeSmoothSegments(ps, points);
}

function finishCrayonPointer(ps: PointerState) {
  const geometry = ps.crayonGeometry;
  if (!ps.crayon || !geometry) return;
  const tail = sampleQuadratic(
    { x: ps.midX, y: ps.midY },
    { x: ps.x, y: ps.y },
    { x: ps.x, y: ps.y },
    geometry.spacing / 2
  );
  renderCrayonPolygons(ps, extendCrayonStrokeGeometry(geometry, tail));
  renderCrayonPolygons(ps, finishCrayonStrokeGeometry(geometry));
  ps.crayonGeometry = null;
}

// Push the finished stroke group onto the undo log (once per group, when the
// last finger lifts) and tell reactive consumers. onStrokeEnd fires at stroke
// end, not start, so consumers (e.g. mounting the install banner) never do DOM
// work while a finger is mid-stroke.
function commitStrokeGroup() {
  if (PERF_MARKS) performance.mark('engine.commit:start');
  if (!commitActiveCommand()) return;
  setCanUndo(true);
  if (onStrokeEnd) onStrokeEnd();
  if (PERF_MARKS) performance.measure('engine.commit', 'engine.commit:start');
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
  isDrawing: boolean;
  color: string;
  lineWidth: number;
  erase: boolean;
  magic: boolean;
  crayon: boolean;
  crayonGeometry: CrayonStrokeGeometry | null;
  lastTime: number;
  speedSamples: { t: number; distance: number }[];
  // Non-null while a touch that began in a guarded edge's gesture band hasn't
  // decided its direction yet: render nothing and buffer its points until it
  // either commits (any non-inward movement, or a stationary tap on lift) or is
  // discarded as an OS edge-swipe (an inward flick). See the edge-swipe notes
  // at startDrawing().
  edgeSwipeGuard: GuardEdge | null;
  pendingPoints: { x: number; y: number }[];
}

const activePointerIds = new Set<number>();
const activePointers = new Map<number, PointerState>();

// Pointer speed (which drives the drawing sound) is averaged over the most
// recent slice of the stroke so the audio cue tracks gesture speed without
// reacting to every per-frame jitter.
const SPEED_WINDOW_MS = 100;

// After a color/tool change, ignore touch/mouse pointerdowns for a short window
// so the tap that picked the color doesn't immediately start a stray stroke.
// Pen input is precise enough to skip the debounce.
const COLOR_CHANGE_DEBOUNCE_MS = 100;

// OS safe-area insets in CSS px, pushed from the canvas's owner component. Used
// only to additionally guard a tablet's long bottom edge in landscape (see the
// edge-swipe notes at startDrawing).
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

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
function startDrawing(e: PointerEvent, adopted = false) {
  if (!adopted) {
    const timeSinceColorChange = Date.now() - lastColorChangeTime;
    const requiredDelay = e.pointerType === 'pen' ? 0 : COLOR_CHANGE_DEBOUNCE_MS;
    if (timeSinceColorChange < requiredDelay) return;
  }

  const screen = pointerToScreen(e);
  const { x, y } = screenToPaper(screen);

  // The eraser runs a bit larger than the pen at the same stroke level. Stroke
  // widths are authored in CSS pixels, so they scale to backing-store pixels.
  const lineWidth =
    (eraserActive ? currentLineWidth * ERASER_SIZE_MULTIPLIER : currentLineWidth) * renderScale;

  // An adopted stream is never an edge-swipe candidate: it began on a UI
  // control inside the app, not at the screen bezel where OS gestures start —
  // and in landscape a swatch drag enters the canvas right through the guarded
  // side band the palette sits against, moving inward, so guarding it would
  // misread the whole drag as the OS gesture and silently discard it.
  const edgeSwipeGuard =
    !adopted && e.pointerType === 'touch'
      ? guardedEdgeAt(screen.x, screen.y, {
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
    startX: screen.x,
    startY: screen.y,
    isDrawing: true,
    color: currentColor,
    lineWidth,
    erase: eraserActive,
    magic: magicActive,
    crayon: crayonActive,
    crayonGeometry: null,
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

// A buffered edge-swipe candidate turned out to be a real stroke: render its
// start dot and flush every point withheld while the direction was undecided,
// then let it draw normally from here on.
function commitEdgeSwipe(ps: PointerState) {
  ps.edgeSwipeGuard = null;
  renderStrokeStart(ps);
  if (ps.pendingPoints.length > 0) {
    renderStrokeSegments(ps, ps.pendingPoints.map(screenToPaper));
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

// Edge-gesture candidate: withhold rendering until the direction is decided.
// The buffered points and the direction test stay in screen space (physical
// edges); commitEdgeSwipe maps them to paper coordinates when they turn out
// to be a real stroke.
function advanceEdgeSwipeCandidate(
  ps: PointerState,
  screenPoints: { x: number; y: number }[],
  e: PointerEvent
) {
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
function restartStrokeIfResumed(ps: PointerState, resume: { x: number; y: number }, now: number) {
  const deltaX = resume.x - ps.x;
  const deltaY = resume.y - ps.y;
  const jump = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  if (!pointerWasResumed(now - ps.lastTime, jump, Math.min(paper.pxW, paper.pxH))) return;
  finishCrayonPointer(ps);
  ps.x = resume.x;
  ps.y = resume.y;
  ps.midX = resume.x;
  ps.midY = resume.y;
  ps.speedSamples = [{ t: now, distance: 0 }];
  if (ps.crayon) ps.crayonGeometry = createCrayonStrokeGeometry(resume, ps.lineWidth / 2);
  ctx.beginPath();
}

// Speed is sampled from the final event only: one chord per pointermove,
// matching the cadence the sliding window was tuned for.
function strokeSpeed(ps: PointerState, last: { x: number; y: number }, now: number): number {
  const deltaX = last.x - ps.x;
  const deltaY = last.y - ps.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  return calculateStrokeSpeed(ps.speedSamples, { t: now, distance }, SPEED_WINDOW_MS);
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
  const screenPoints = events.map(pointerToScreen);

  const now = Date.now();

  if (pointerState.edgeSwipeGuard) {
    advanceEdgeSwipeCandidate(pointerState, screenPoints, e);
    return;
  }

  const points = screenPoints.map(screenToPaper);
  restartStrokeIfResumed(pointerState, points[0], now);
  const speed = strokeSpeed(pointerState, points[points.length - 1], now);

  renderStrokeSegments(pointerState, points);

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

  if (pointerState && !pointerState.edgeSwipeGuard) finishCrayonPointer(pointerState);

  activePointers.delete(e.pointerId);
  activePointerIds.delete(e.pointerId);

  ctx.beginPath();

  if (pointerState && !pointerState.edgeSwipeGuard && pointerState.erase) {
    setCanvasEmptyState(scanCanvasIsEmpty(canvas, renderScale));
  }

  if (activePointers.size === 0) {
    groupHasDrawn = false;
    commitStrokeGroup();
    if (onDrawStopCallback) onDrawStopCallback();
  }

  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
}

export function releaseAllPointers() {
  if (!ctx) return;
  ctx.beginPath();

  for (const pointerState of activePointers.values()) finishCrayonPointer(pointerState);

  activePointers.clear();
  groupHasDrawn = false;
  commitStrokeGroup();
  if (onDrawStopCallback) onDrawStopCallback();

  activePointerIds.forEach((pointerId) => {
    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {}
  });

  activePointerIds.clear();
}

// Adopt a live pointer mid-gesture as a stroke start — the drag-a-color-onto-
// the-canvas handoff (the palette's dragColorToCanvas action). The press began
// on a swatch, so the canvas never saw a pointerdown; the caller selects the
// color, then hands the stream here the moment it crosses onto exposed canvas,
// and startDrawing's capture retargets the rest of the stream to the canvas.
// This stream IS the intended stroke, so the tap-fallout defenses that would
// swallow it are skipped (`adopted`): the color-change debounce, and the
// edge-swipe guard — in landscape the drag enters the canvas through the
// guarded side band the palette sits against, moving inward, exactly the
// signature the guard discards as an OS gesture.
export function adoptPointerStroke(e: PointerEvent) {
  if (!ctx || activePointers.has(e.pointerId)) return;
  startDrawing(e, true);
}

// --- WebKit merged-stream pen quirks ---------------------------------------

// Every pointerdown actually delivered anywhere in the document, until its
// up/cancel arrives. A pen contact stream whose id is missing here never got a
// pointerdown at all — the WebKit merged-stream signature — which is what
// licenses adoption below without stealing pointers that legitimately began on
// a UI control (drag-to-clear's uncaptured drag, the color picker's captured
// drag, a slide off a swatch).
const liveDownIds = new Set<number>();
const trackPointerDown = (e: PointerEvent) => liveDownIds.add(e.pointerId);
const trackPointerLift = (e: PointerEvent) => liveDownIds.delete(e.pointerId);

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

const cancelTouch = (e: TouchEvent) => e.preventDefault();

// --- Undo, clear, and canvas-empty API --------------------------------------

export function undo() {
  if (!canUndo || !canvas || !ctx) return;

  if (PERF_MARKS) performance.mark('engine.undo:start');

  const undone = popCommand();
  if (!undone) return;
  const strokeStillLive = rebaseActiveCommand(undone.wasEmpty);
  replayAll(ctx);
  setCanvasEmptyState(undone.wasEmpty && !strokeStillLive);

  setCanUndo(commandCount() > 0);

  if (PERF_MARKS) performance.measure('engine.undo', 'engine.undo:start');
}

export function clearCanvas() {
  // The clear is its own undo command: replaying it wipes the surface, and
  // undoing it replays the strokes that preceded it back from the baseline.
  pushCommand({ ops: [{ kind: 'clear' }], wasEmpty: canvasEmpty });
  setCanUndo(true);
  clearAllOf(ctx);
  // A stroke can straddle the clear (e.g. a second finger drawing while
  // drag-to-clear completes) — see resetActiveCommandForClear. The continuing
  // stroke counts as content (same as beginStrokeGroup), so the empty flag only
  // flips when no stroke is live.
  const strokeStillLive = resetActiveCommandForClear();
  setCanvasEmptyState(!strokeStillLive);
  // A cleared canvas releases the held rainbow so the next magic use picks a fresh
  // one; if the brush is still selected, lock the new one in right away.
  clearMagicGradient();
  if (magicActive) ensureMagicSheet();
}

export function isCanvasEmpty(): boolean {
  return canvasEmpty;
}

// Test/profiling seam: how the undo history is currently stored (see
// undoHistory.getHistoryDebug) plus the lifetime simplification counters.
export function getUndoDebug(): {
  commands: number;
  keyframes: number;
  maxOps: number;
  maxSegments: number;
  totalSegments: number;
  rawPoints: number;
  keptPoints: number;
} {
  return { ...getHistoryDebug(), ...getSimplifyCounters() };
}

// Dev profiling seam (ADR-0036 tuning): override the simplification tolerances
// and the keyframe safety-net bound so a single build can sweep every setting.
// Wired onto window.__engine only on the /dev/engine page
// (PUBLIC_ENABLE_DEV_HARNESS); production never calls it.
export function setSimplifyParams(params: SimplifyOptions & { keyframeThreshold?: number }) {
  if (params.keyframeThreshold !== undefined) setKeyframeSegmentThreshold(params.keyframeThreshold);
  setSimplifyOptions(params);
}

// --- Mount / unmount ---------------------------------------------------------

export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  canvas = canvasElement;
  // NB: no `desynchronized: true` here. It was tried for lower Android ink
  // latency and rejected — a desynchronized 2D canvas is promoted to a hardware
  // overlay that does not alpha-composite with content below it, so this
  // deliberately transparent canvas (the paper sheet + coloring overlay render
  // beneath it, ADR-0050) rendered as opaque black on the Android WebView. See
  // ADR-0051.
  ctx = canvas.getContext('2d')!;

  // The magic brush's color sheet lives in paper coordinates (like every op) and
  // repaints recorded magic ops once an async fill finishes decoding (ADR-0043).
  initMagicBrush({
    paperSize: () =>
      paper.pxW > 0 && paper.pxH > 0 ? { width: paper.pxW, height: paper.pxH } : null,
    sheetBounds: () => (paper.pxW > 0 && paper.pxH > 0 ? sheetBoundsPaper() : null),
    repaint: () => {
      if (ctx) replayAll(ctx);
    },
  });

  onDrawSoundCallback = options.onDrawSound || null;
  onDrawStopCallback = options.onDrawStop || null;
  onUndoStateChange = options.onUndoStateChange || null;
  onCanvasEmptyChange = options.onCanvasEmptyChange || null;
  onStrokeEnd = options.onStrokeEnd || null;
  onViewChange = options.onViewChange || null;
  currentColor = options.initialColor || '#AB71E1';

  renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);

  resizeCanvas();

  // Every listener registered through here is removed symmetrically in
  // teardown(), so the add/remove lists can't drift apart.
  const removers: (() => void)[] = [];
  function listen<K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K | string,
    handler: (e: never) => void,
    options?: AddEventListenerOptions | boolean
  ) {
    target.addEventListener(type, handler as EventListener, options);
    removers.push(() => target.removeEventListener(type, handler as EventListener, options));
  }

  listen(window, 'resize', handleResize);
  // Scroll/orientation move the canvas in the viewport without resizing it, so
  // refresh the cached rect (left/top) without the full backing-store rebuild.
  listen(window, 'scroll', refreshCanvasRect, true);
  listen(window, 'orientationchange', refreshCanvasRect);
  // The paper view keys off the Screen Orientation angle (resizeCanvas). The
  // resize event usually lands after the angle updates, but ordering isn't
  // guaranteed everywhere — also funnel the orientation change itself through
  // the debounced resize so a late angle still recomputes the view. Guarded:
  // older WebViews can expose screen.orientation without the listener API.
  const screenOrientation = window.screen?.orientation;
  if (typeof screenOrientation?.addEventListener === 'function')
    listen(screenOrientation, 'change', handleResize);
  // Rotation while backgrounded fires none of the listeners above (the document
  // is hidden) — catch up on re-entry instead (issue #305).
  listen(document, 'visibilitychange', resyncOnReentry);

  listen(canvas, 'pointerdown', startDrawing);
  listen(canvas, 'pointermove', draw);
  listen(canvas, 'pointerup', stopDrawing);
  listen(canvas, 'pointerout', stopDrawing);
  listen(canvas, 'pointercancel', stopDrawing);
  // iPadOS Scribble claims an Apple Pencil stroke that starts within ~450ms of
  // a pen tap: pointer events still arrive and the engine paints, but the
  // system never presents those frames — the ink is invisible and never shows.
  // Cancelling the parallel TOUCH stream is the only thing that makes Scribble
  // let go; preventDefault on the pointer events (draw() already does it) is
  // documented and confirmed on-device NOT to help. Non-passive on purpose.
  // The palette needs the same guard for the tap that precedes a stroke — see
  // the scribbleGuard action.
  listen(canvas, 'touchstart', cancelTouch, { passive: false });
  listen(canvas, 'touchmove', cancelTouch, { passive: false });
  listen(window, 'pointerdown', trackPointerDown, true);
  listen(window, 'pointerup', trackPointerLift, true);
  listen(window, 'pointercancel', trackPointerLift, true);
  listen(window, 'pointermove', adoptStrayPenStream, true);

  // Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
  // first export.
  warmPaperTextureWhenIdle();

  return {
    teardown() {
      for (const remove of removers) remove();
      if (resizeSettleTimer !== null) {
        clearTimeout(resizeSettleTimer);
        resizeSettleTimer = null;
      }
      // Pointer-input state must not outlive the mount, unlike the drawing
      // state (see the persistence note in undoHistory.ts): a stale
      // activePointers entry still marked isDrawing would let hover moves paint
      // after a remount reuses its pointerId, and liveDownIds loses its
      // self-healing window trackers above. releaseAllPointers also commits any
      // mid-flight stroke into the log, so navigating away mid-stroke keeps
      // the ink.
      releaseAllPointers();
      liveDownIds.clear();
    },
  };
}

// --- Tool state pushed in by components --------------------------------------

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

// Magic brush on/off (ADR-0043). Mutually exclusive with the eraser at the UI
// level; the engine just tracks the flag and stamps it onto each op. Selecting the
// brush over a blank canvas locks in a random rainbow to reveal (a no-op when a
// coloring page is applied, or when a rainbow is already held from before).
export function setMagicMode(active: boolean) {
  magicActive = active;
  if (active) ensureMagicSheet();
}

export function setCrayonMode(active: boolean) {
  crayonActive = active;
  if (!active) return;
  warmCrayonColor(currentColor);
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

export async function exportCanvasBlob(
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  if (!canvas) return null;
  return exportDrawing(
    { paperPxWidth: paper.pxW, paperPxHeight: paper.pxH, renderScale },
    overlayImage,
    options
  );
}

export function getActiveCanvas(): HTMLCanvasElement {
  return canvas;
}
