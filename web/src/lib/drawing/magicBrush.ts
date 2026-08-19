// Magic brush color source (ADR-0043).
//
// The magic brush reveals a hidden "color sheet" wherever the child strokes.
// Two sources can feed that sheet, and this module owns both:
//
//   1. A coloring page's flat-colored fill (`{page}.light.webp`), when a page is
//      applied — a revealed pixel lands under the line art it belongs to. The
//      shipped fill is fills-only: its own outline pixels are already punched to
//      transparency at build time (asset-gen's `tools/asset-gen/lib/punch-fill.mjs`,
//      luma < 150 → transparent), so revealing it can't double the overlay <img>'s
//      line work — the overlay stays the single source of line work. This module
//      just loads and draws it; the punch used to happen here at runtime (see
//      ADR-0043's build-time follow-up).
//   2. A generated rainbow gradient, when no page is applied. The brush works
//      everywhere, so with a blank canvas it reveals one of MAGIC_GRADIENT_COUNT
//      pre-generated random rainbows. One is chosen the first time the brush is
//      used and held until the canvas is cleared; the next use after a clear picks
//      another at random.
//
// The engine drives this module: it rasterizes the sheet on resize, asks for the
// sheet pattern per magic op, and calls the source setters from its tool/overlay
// wiring. The offscreen sheet is a canvas the exact size of the engine's paper,
// the coordinate space shared by ops and live tiles through rotation (ADR-0089);
// a no-repeat CanvasPattern of it is the brush's paint
// (chosen over a per-op mask composite and a flat colour-sample after measuring
// all three — see ADR-0043).

import { magicSheetWorkerSupported, rasterizeMagicSheetInWorker } from './magicSheetRasterClient';
import {
  createRainbowGradient,
  MAGIC_GRADIENT_COUNT,
  paintRainbowGradient,
  type RainbowGradient,
} from './magicSheetGradient';
// Give the line art first use of the connection, then recover independently if
// its decode never settles and therefore never releases the deferred fill.
const DEFERRED_FILL_FALLBACK_MS = 15_000;

// Sample a hair inside the picture's border, not on it, so a coloring page's edge
// outline doesn't smear across the extended margin.
const EDGE_SAMPLE_INSET_FRACTION = 0.02;

// The engine hands the module a live view of its paper — the coordinate space
// ops (and therefore the sheet) live in, which a rotation may lock while the
// viewport changes (ADR-0050) — and a repaint hook so an async fill load can
// refresh already-recorded magic ops.
interface MagicBrushHost {
  paperSize: () => { width: number; height: number } | null;
  // The exact paper-coordinate rectangle the sheet must cover.
  sheetBounds: () => { x: number; y: number; width: number; height: number } | null;
  repaint: () => void;
}

// The state below is a deliberate module-scope singleton — one magic-brush
// engine per app, driven directly by the drawing engine (ADR-0004, the same
// rationale as tiledRenderer.ts's module-scope history) — not a createX()
// factory, so there is no per-instance seam for tests.
//
// The only in-module reset is partial: setColorSheet(null) drops the fill source
// and clearMagicGradient() drops the held gradient. Only the no-fill case comes
// back with a fresh patternCache — setColorSheet(null) rasterizes, which rebuilds
// it, and clearMagicGradient() rebuilds it only inside its `if (!fillUrl)` branch,
// so clearing the gradient while a page is applied leaves the cached patterns (and
// readiness) as they were. Either way host, sheetCanvas, and
// sheetOriginX/sheetOriginY keep whatever the last rasterize left them, and
// readiness stays false until some source is set *and* rasterized (a bare
// rasterizeSheet() with no active source returns early, still unready). So a test
// wanting real isolation gets fresh module state, not a reset call:
// vi.resetModules() in beforeEach plus `await import('./magicBrush')`, the pattern
// every stateful describe in magicBrush.test.ts uses.
let host: MagicBrushHost | null = null;

// Source 1: the coloring page's colored fill — shipped fills-only (its outlines are
// already transparent, punched at build time), so it's drawn into the sheet directly.
let fillImage: HTMLImageElement | null = null;
let fillUrl: string | null = null;
// The one in-flight fill decode. Its handlers are the only ones allowed to touch the
// sheet state; every other load is superseded, whatever URL it was for.
let pendingLoad: HTMLImageElement | null = null;
let pendingFillRaster: HTMLImageElement | null = null;
let pendingGradientRaster: { gradient: RainbowGradient } | null = null;
let deferredFillTimer: ReturnType<typeof setTimeout> | null = null;

// Source 2: the generated rainbow. The pool is built lazily and reused; the active
// gradient is the one currently revealed, held until the canvas is cleared.
let gradientPool: RainbowGradient[] | null = null;
let activeGradient: RainbowGradient | null = null;

// The offscreen sheet the pattern samples, plus a per-target-context pattern cache.
// Reset (new map) on every rasterize so a resized sheet can't hand back a stale
// pattern; a WeakMap can't be cleared.
type MagicSheetCanvas = HTMLCanvasElement | ImageBitmap;

let sheetCanvas: MagicSheetCanvas | null = null;
let sheetReady = false;
let sheetGeometryStale = false;
export interface MagicSheetSnapshot {
  canvas: MagicSheetCanvas;
  originX: number;
  originY: number;
  sourceUrl: string | null;
}
let sheetSnapshot: MagicSheetSnapshot | null = null;
// The sheet's origin in paper coordinates (non-zero only when a rotation lock makes
// the sheet cover margins around the fitted paper). The pattern is offset by it so
// sheet pixel (0,0) maps to this paper coordinate.
let sheetOriginX = 0;
let sheetOriginY = 0;
let patternCache = new WeakMap<
  CanvasRenderingContext2D,
  WeakMap<MagicSheetCanvas, CanvasPattern>
>();
const patternRegionByTarget = new WeakMap<
  CanvasRenderingContext2D,
  { x: number; y: number; width: number; height: number }
>();

function invalidateSheet() {
  sheetReady = false;
  sheetSnapshot = null;
  patternCache = new WeakMap();
}

function publishWorkerSheet(
  bitmap: ImageBitmap,
  bounds: { x: number; y: number; width: number; height: number },
  sourceUrl: string | null
) {
  sheetCanvas = bitmap;
  sheetOriginX = bounds.x;
  sheetOriginY = bounds.y;
  sheetReady = true;
  sheetGeometryStale = false;
  sheetSnapshot = {
    canvas: sheetCanvas,
    originX: sheetOriginX,
    originY: sheetOriginY,
    sourceUrl,
  };
  host?.repaint();
}

function rasterizeFillOffThread(
  image: HTMLImageElement,
  imageUrl: string,
  paper: { width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number }
) {
  const scale = Math.min(paper.width / image.naturalWidth, paper.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (paper.width - width) / 2 - bounds.x;
  const y = (paper.height - height) / 2 - bounds.y;
  return rasterizeMagicSheetInWorker({
    imageUrl,
    width: bounds.width,
    height: bounds.height,
    fit: { x, y, width, height },
    edgeFills: edgeMargins(
      bounds.width,
      bounds.height,
      x,
      y,
      width,
      height,
      image.naturalWidth,
      image.naturalHeight
    ),
  });
}

function beginFillRaster(image: HTMLImageElement, imageUrl: string) {
  if (!magicSheetWorkerSupported()) return false;
  const paper = host?.paperSize();
  const bounds = host?.sheetBounds();
  if (!paper || !bounds || bounds.width <= 0 || bounds.height <= 0) return false;
  pendingFillRaster = image;
  void rasterizeFillOffThread(image, imageUrl, paper, bounds)
    .then((bitmap) => {
      if (pendingFillRaster !== image || fillImage !== image) {
        bitmap.close();
        return;
      }
      pendingFillRaster = null;
      publishWorkerSheet(bitmap, bounds, imageUrl);
    })
    .catch(() => {
      if (pendingFillRaster !== image || fillImage !== image) return;
      pendingFillRaster = null;
      rasterizeSheet();
      host?.repaint();
    });
  return true;
}

function beginGradientRaster(gradient: RainbowGradient) {
  if (!magicSheetWorkerSupported()) return false;
  const bounds = host?.sheetBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
  const request = { gradient };
  pendingGradientRaster = request;
  invalidateSheet();
  void rasterizeMagicSheetInWorker({
    gradient,
    width: bounds.width,
    height: bounds.height,
  })
    .then((bitmap) => {
      if (pendingGradientRaster !== request || activeGradient !== gradient || fillUrl) {
        bitmap.close();
        return;
      }
      pendingGradientRaster = null;
      publishWorkerSheet(bitmap, bounds, null);
    })
    .catch(() => {
      if (pendingGradientRaster !== request || activeGradient !== gradient || fillUrl) return;
      pendingGradientRaster = null;
      rasterizeSheet();
      host?.repaint();
    });
  return true;
}

function rasterizeActiveSheet() {
  const source = activeSource();
  if (source?.kind === 'gradient' && beginGradientRaster(source.gradient)) return;
  rasterizeSheet();
}

export function initMagicBrush(h: MagicBrushHost) {
  host = h;
}

function buildGradientPool(): RainbowGradient[] {
  return Array.from({ length: MAGIC_GRADIENT_COUNT }, () => createRainbowGradient());
}

// Which source rasterizeSheet should draw. A pending fill (URL set but not yet
// decoded) yields null so the brush reveals nothing until it loads, matching the
// original behaviour — it never falls back to the gradient mid-load.
type SheetSource =
  | { kind: 'fill'; image: HTMLImageElement }
  | { kind: 'gradient'; gradient: RainbowGradient };

function activeSource(): SheetSource | null {
  if (fillUrl) {
    return fillImage && fillImage.naturalWidth ? { kind: 'fill', image: fillImage } : null;
  }
  if (activeGradient) return { kind: 'gradient', gradient: activeGradient };
  return null;
}

// The picture (fill) is drawn at box (ox,oy,bw,bh) inside a W×H sheet and can leave
// transparent letterbox margins on any side — top/bottom or left/right where the
// fill is contain-fit in the paper, AND (under a rotation lock) the other axis where
// the paper itself is contain-fit in the larger sheet, so all four sides plus corners
// can be empty. `edgeMargins` returns direct source-image blits for every band and
// corner, as pure geometry so the math is unit-testable without a real canvas.
//
// Each source is taken a hair INSIDE the picture (`inset`), not on the literal border:
// a coloring page can carry an outline right at its edge, and sampling the 1px border
// would smear that black line across the margin. One row/column in lands on the flat
// fill behind the outline, so the margin extends the picture's colour (sky stays blue)
// with no line streak. Stretching a row/column (not a flat per-edge average) preserves
// along-edge variation — a landscape scene keeps sky-at-top / grass-at-bottom.
export interface EdgeFill {
  /** Source rect in the fill image to sample. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rect in the sheet to stretch that strip across. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function edgeMargins(
  W: number,
  H: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number,
  sourceWidth = bw,
  sourceHeight = bh
): EdgeFill[] {
  const top = Math.round(oy);
  const left = Math.round(ox);
  const bottom = Math.round(oy + bh);
  const right = Math.round(ox + bw);
  const bottomMargin = H - bottom;
  const rightMargin = W - right;
  const scaleX = bw / sourceWidth;
  const scaleY = bh / sourceHeight;
  const sourcePixelX = 1 / scaleX;
  const sourcePixelY = 1 / scaleY;
  const destinationInset = Math.max(1, Math.round(Math.min(bw, bh) * EDGE_SAMPLE_INSET_FRACTION));
  const sourceInsetX = destinationInset / scaleX;
  const sourceInsetY = destinationInset / scaleY;
  const sourceRight = sourceWidth - sourcePixelX - sourceInsetX;
  const sourceBottom = sourceHeight - sourcePixelY - sourceInsetY;
  const fills: EdgeFill[] = [];
  if (top > 0)
    fills.push({
      sx: 0,
      sy: sourceInsetY,
      sw: sourceWidth,
      sh: sourcePixelY,
      dx: ox,
      dy: 0,
      dw: bw,
      dh: top,
    });
  if (bottomMargin > 0)
    fills.push({
      sx: 0,
      sy: sourceBottom,
      sw: sourceWidth,
      sh: sourcePixelY,
      dx: ox,
      dy: bottom,
      dw: bw,
      dh: bottomMargin,
    });
  if (left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: 0,
      sw: sourcePixelX,
      sh: sourceHeight,
      dx: 0,
      dy: oy,
      dw: left,
      dh: bh,
    });
  if (rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: 0,
      sw: sourcePixelX,
      sh: sourceHeight,
      dx: right,
      dy: oy,
      dw: rightMargin,
      dh: bh,
    });
  if (top > 0 && left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: sourceInsetY,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: 0,
      dy: 0,
      dw: left,
      dh: top,
    });
  if (top > 0 && rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: sourceInsetY,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: right,
      dy: 0,
      dw: rightMargin,
      dh: top,
    });
  if (bottomMargin > 0 && left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: sourceBottom,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: 0,
      dy: bottom,
      dw: left,
      dh: bottomMargin,
    });
  if (bottomMargin > 0 && rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: sourceBottom,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: right,
      dy: bottom,
      dw: rightMargin,
      dh: bottomMargin,
    });
  return fills;
}

// Fill the transparent letterbox margins of the drawn picture by extending its edge
// colours outward, so a stroke in the margin reveals the colour of the nearest
// picture edge instead of nothing — the child paints across the whole canvas with no
// hard seam (fixes ADR-0043's "painting in the letterbox reveals nothing" edge, and
// the rotation-lock margins around the fitted paper).
function extendSheetEdges(
  g: CanvasRenderingContext2D,
  image: HTMLImageElement,
  W: number,
  H: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number
) {
  for (const fill of edgeMargins(W, H, ox, oy, bw, bh, image.naturalWidth, image.naturalHeight)) {
    g.drawImage(image, fill.sx, fill.sy, fill.sw, fill.sh, fill.dx, fill.dy, fill.dw, fill.dh);
  }
}

// Rasterize the active source into the sheet and refresh the pattern cache. The
// sheet covers `sheetBounds` in paper coordinates. The fill is drawn contain-fit
// within the paper, matching the overlay image, then its edge colours extend
// through the fill's own letterbox margins; a gradient fills the whole sheet.
function rasterizeSheet() {
  invalidateSheet();
  const paper = host?.paperSize();
  const bounds = host?.sheetBounds();
  if (!paper || !bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const source = activeSource();
  if (!source) return;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  sheetCanvas = canvas;
  sheetOriginX = bounds.x;
  sheetOriginY = bounds.y;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (source.kind === 'fill') {
    const iw = source.image.naturalWidth;
    const ih = source.image.naturalHeight;
    const scale = Math.min(paper.width / iw, paper.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    // Contain-fit box in paper coords, shifted into the (possibly offset) sheet.
    const ox = (paper.width - dw) / 2 - sheetOriginX;
    const oy = (paper.height - dh) / 2 - sheetOriginY;
    context.drawImage(source.image, ox, oy, dw, dh);
    extendSheetEdges(context, source.image, canvas.width, canvas.height, ox, oy, dw, dh);
  } else {
    paintRainbowGradient(context, canvas.width, canvas.height, source.gradient);
  }
  sheetReady = true;
  sheetGeometryStale = false;
  sheetSnapshot = {
    canvas: sheetCanvas,
    originX: sheetOriginX,
    originY: sheetOriginY,
    sourceUrl: source.kind === 'fill' ? fillUrl : null,
  };
}

// Preserve captured sheets for history, but defer allocating replacement full-screen
// backing stores until Magic can actually paint with the new geometry.
export function resizeMagicSheet(eager: boolean) {
  pendingFillRaster = null;
  pendingGradientRaster = null;
  if (eager) rasterizeActiveSheet();
  else sheetGeometryStale = true;
}

// A no-repeat pattern of the sheet, cached per tile, history-base, or export
// context. The pattern is offset by the sheet's paper-coordinate origin so
// sheet pixel (0,0) lands at that paper coordinate on every surface.
export function captureMagicSheet(): MagicSheetSnapshot | null {
  return sheetReady ? sheetSnapshot : null;
}

export function sheetPatternFor(
  target: CanvasRenderingContext2D,
  snapshot: MagicSheetSnapshot | null = captureMagicSheet()
): CanvasPattern | null {
  if (!snapshot) return null;
  let patternsBySource = patternCache.get(target);
  if (!patternsBySource) {
    patternsBySource = new WeakMap();
    patternCache.set(target, patternsBySource);
  }
  const cached = patternsBySource.get(snapshot.canvas);
  if (cached) return cached;
  const region = patternRegionByTarget.get(target);
  let source = snapshot.canvas;
  if (region) {
    source = document.createElement('canvas');
    source.width = region.width;
    source.height = region.height;
    source
      .getContext('2d')
      ?.drawImage(
        snapshot.canvas,
        region.x - snapshot.originX,
        region.y - snapshot.originY,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height
      );
  }
  const pattern = target.createPattern(source, 'no-repeat');
  if (!pattern) return null;
  const originX = region?.x ?? snapshot.originX;
  const originY = region?.y ?? snapshot.originY;
  if ((originX !== 0 || originY !== 0) && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, originX, originY]));
  }
  patternsBySource.set(snapshot.canvas, pattern);
  return pattern;
}

export function setMagicPatternRegion(
  target: CanvasRenderingContext2D,
  region: { x: number; y: number; width: number; height: number }
) {
  patternRegionByTarget.set(target, region);
  patternCache.delete(target);
}

// Load the fill image, guarding against a page change that happened while it
// decoded. On success stash it, then re-rasterize and repaint so already-recorded
// magic ops pick up the colours.
//
// A failed load detaches the page entirely (as if it had been removed) and takes
// over the gradient source, so the brush keeps painting instead of staying unready
// for the rest of the session — a page session holds no gradient of its own, so
// merely clearing fillUrl would leave rasterizeSheet with no source at all.
// Clearing fillUrl also re-arms setColorSheet's same-url guard, making a re-applied
// page a real retry.
//
// Both handlers key on the image instance, not on the URL: a theme switch can cycle
// the sheet A → B → A, and a URL comparison would let the first A load's late error
// pass while the third load owns fillUrl — detaching the page and stranding that
// load's own success behind the same guard.
function loadSheetImage(url: string) {
  const img = new Image();
  pendingLoad = img;
  img.onload = () => {
    if (pendingLoad !== img) return;
    pendingLoad = null;
    fillImage = img;
    if (beginFillRaster(img, url)) return;
    rasterizeSheet();
    host?.repaint();
  };
  img.onerror = () => {
    if (pendingLoad !== img) return;
    pendingLoad = null;
    fillUrl = null;
    fillImage = null;
    holdRandomGradient();
    rasterizeActiveSheet();
    host?.repaint();
  };
  img.src = url;
}

function cancelDeferredFill() {
  if (deferredFillTimer === null) return;
  clearTimeout(deferredFillTimer);
  deferredFillTimer = null;
}

// Point the magic brush at a coloring page's colored fill (or null to detach and
// fall back to the gradient source). The shipped fill is fills-only, so it's drawn
// straight into the sheet; it decodes async, and magic ops recorded before it's
// ready reveal nothing until the load handler repaints.
export function setColorSheet(colorUrl: string | null) {
  cancelDeferredFill();
  if (colorUrl === fillUrl && (colorUrl === null || fillImage || pendingLoad)) return;
  // Whatever is still decoding is for the outgoing source — disown it.
  pendingLoad = null;
  pendingFillRaster = null;
  pendingGradientRaster = null;
  fillUrl = colorUrl;
  fillImage = null;
  if (!colorUrl) {
    // Page removed — the sheet reverts to the gradient source if one exists.
    rasterizeActiveSheet();
    host?.repaint();
    return;
  }
  invalidateSheet();
  loadSheetImage(colorUrl);
}

// Reserve an incoming page without immediately starting its fill transfer. The
// overlay line art owns network priority, but new strokes must stop sampling the
// outgoing page as soon as the child selects its replacement. DrawingCanvas pays
// the reservation with setColorSheet after the overlay settles; the fallback keeps
// the brush self-healing if that decode never settles. Recorded ops retain their
// captured snapshot until the replacement sheet recodes them.
export function deferColorSheet(colorUrl: string) {
  cancelDeferredFill();
  pendingLoad = null;
  pendingFillRaster = null;
  pendingGradientRaster = null;
  fillUrl = colorUrl;
  fillImage = null;
  invalidateSheet();
  deferredFillTimer = setTimeout(() => setColorSheet(colorUrl), DEFERRED_FILL_FALLBACK_MS);
}

// Pick a random rainbow from the pool and hold it, unless one is already held (so
// re-selecting the brush keeps the same rainbow until the next clear). Rasterizing
// is the caller's, since the callers differ on whether an already-held gradient
// still needs to be drawn.
function holdRandomGradient() {
  if (activeGradient) return;
  if (!gradientPool) gradientPool = buildGradientPool();
  activeGradient = gradientPool[Math.floor(Math.random() * gradientPool.length)];
}

// Ensure the brush has something to reveal when it's selected. A coloring page's
// fill takes priority and needs nothing here; otherwise hold a rainbow. A no-op
// once a gradient is already active, so re-selecting the brush (or toggling
// pen↔magic) neither re-rolls the rainbow nor re-rasterizes.
export function ensureMagicSheet() {
  if (sheetReady && !sheetGeometryStale) return;
  if (pendingFillRaster || pendingGradientRaster) return;
  if (!fillUrl) holdRandomGradient();
  rasterizeActiveSheet();
}

// Drop the held gradient so the next brush use picks a fresh one. Called when the
// canvas is cleared. The fill (if a page is applied) is untouched.
export function clearMagicGradient() {
  activeGradient = null;
  pendingGradientRaster = null;
  if (!fillUrl) {
    invalidateSheet();
  }
}
