// Magic brush color source (ADR-0043).
//
// The magic brush reveals a hidden "color sheet" wherever the child strokes.
// Two sources can feed that sheet, and this module owns both:
//
//   1. A coloring page's flat-colored twin (`{page}.light.webp`), when a page is
//      applied — a revealed pixel lands under the line art it belongs to. The
//      shipped twin is fills-only: its own outline pixels are already punched to
//      transparency at build time (asset-gen's `tools/asset-gen/lib/punch-twin.mjs`,
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
// wiring. The offscreen sheet is a canvas the exact size of the engine's PAPER —
// the space ops are recorded in, which tracks the main canvas until a rotation
// locks it (ADR-0050); a no-repeat CanvasPattern of it is the brush's paint
// (chosen over a per-op mask composite and a flat colour-sample after measuring
// all three — see ADR-0043).

export const MAGIC_GRADIENT_COUNT = 10;

interface GradientStop {
  offset: number;
  color: string;
}

export interface RainbowGradient {
  // Direction of the gradient line, in radians, measured from the +x axis.
  angle: number;
  stops: GradientStop[];
}

// The engine hands the module a live view of its paper — the coordinate space
// ops (and therefore the sheet) live in, which a rotation may lock while the
// viewport changes (ADR-0050) — and a repaint hook so an async twin load can
// refresh already-recorded magic ops.
interface MagicBrushHost {
  paperSize: () => { width: number; height: number } | null;
  // The paper-coordinate rectangle the whole visible canvas maps to. Equal to the
  // paper in normal use; under a rotation lock it's the larger mapped-viewport rect
  // (its origin can be negative), so the sheet also covers the letterbox margins
  // around the fitted paper and the brush can paint them (ADR-0043/0050).
  sheetBounds: () => { x: number; y: number; width: number; height: number } | null;
  repaint: () => void;
}

let host: MagicBrushHost | null = null;

// Source 1: the coloring page's colored twin — shipped fills-only (its outlines are
// already transparent, punched at build time), so it's drawn into the sheet directly.
let twinImage: HTMLImageElement | null = null;
let twinUrl: string | null = null;

// Source 2: the generated rainbow. The pool is built lazily and reused; the active
// gradient is the one currently revealed, held until the canvas is cleared.
let gradientPool: RainbowGradient[] | null = null;
let activeGradient: RainbowGradient | null = null;

// The offscreen sheet the pattern samples, plus a per-target-context pattern cache.
// Reset (new map) on every rasterize so a resized sheet can't hand back a stale
// pattern; a WeakMap can't be cleared.
let sheetCanvas: HTMLCanvasElement | null = null;
let sheetCtx: CanvasRenderingContext2D | null = null;
let sheetReady = false;
// The sheet's origin in paper coordinates (non-zero only when a rotation lock makes
// the sheet cover margins around the fitted paper). The pattern is offset by it so
// sheet pixel (0,0) maps to this paper coordinate.
let sheetOriginX = 0;
let sheetOriginY = 0;
let patternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

export function initMagicBrush(h: MagicBrushHost) {
  host = h;
}

// Build one random rainbow: a hue sweep across a randomly angled line, with a
// random span, saturation, and lightness so the ten pooled gradients read as
// distinct rainbows rather than the same ramp rotated. `rand` is injectable so the
// pure generation stays unit-testable.
export function createRainbowGradient(rand: () => number = Math.random): RainbowGradient {
  const angle = rand() * Math.PI * 2;
  const stopCount = 5 + Math.floor(rand() * 4); // 5..8 hue stops
  const hueStart = rand() * 360;
  const direction = rand() < 0.5 ? 1 : -1;
  const hueSweep = 240 + rand() * 200; // total hue span in degrees
  const saturation = 70 + rand() * 25;
  const lightness = 55 + rand() * 15;
  const stops: GradientStop[] = [];
  for (let s = 0; s < stopCount; s++) {
    const t = s / (stopCount - 1);
    const hue = (((hueStart + direction * hueSweep * t) % 360) + 360) % 360;
    stops.push({ offset: t, color: `hsl(${hue}, ${saturation}%, ${lightness}%)` });
  }
  return { angle, stops };
}

function buildGradientPool(): RainbowGradient[] {
  return Array.from({ length: MAGIC_GRADIENT_COUNT }, () => createRainbowGradient());
}

// Which source rasterizeSheet should draw. A pending twin (URL set but not yet
// decoded) yields null so the brush reveals nothing until it loads, matching the
// original behaviour — it never falls back to the gradient mid-load.
function activeSource(): 'twin' | 'gradient' | null {
  if (twinUrl) return twinImage && twinImage.naturalWidth ? 'twin' : null;
  if (activeGradient) return 'gradient';
  return null;
}

// Fill the sheet with a gradient whose line spans the whole canvas at spec.angle,
// so every stroke position on the canvas samples a colour along the rainbow.
function paintGradient(g: CanvasRenderingContext2D, w: number, h: number, spec: RainbowGradient) {
  const cx = w / 2;
  const cy = h / 2;
  const half = (Math.abs(Math.cos(spec.angle)) * w + Math.abs(Math.sin(spec.angle)) * h) / 2;
  const dx = Math.cos(spec.angle) * half;
  const dy = Math.sin(spec.angle) * half;
  const grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const s of spec.stops) grad.addColorStop(s.offset, s.color);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

// The picture (twin) is drawn at box (ox,oy,bw,bh) inside a W×H sheet and can leave
// transparent letterbox margins on any side — top/bottom or left/right where the
// twin is contain-fit in the paper, AND (under a rotation lock) the other axis where
// the paper itself is contain-fit in the larger sheet, so all four sides plus corners
// can be empty. `edgeMargins` returns the ordered blits that extend the picture's edge
// colours outward to fill them, as pure geometry so the math is unit-testable without
// a real canvas.
//
// Two ordered passes so corners fall out for free:
//   1. Vertical — stretch the box's top/bottom rows across the box width into the
//      top/bottom bands. Now the box's full column span is coloured top-to-bottom.
//   2. Horizontal — stretch a FULL-HEIGHT column just inside each side edge into the
//      side bands; because it's full height it also paints the corners the vertical
//      pass filled. (Pass 2 samples what pass 1 drew, so the order matters.)
//
// Each source is taken a hair INSIDE the picture (`inset`), not on the literal border:
// a coloring page can carry an outline right at its edge, and sampling the 1px border
// would smear that black line across the margin. One row/column in lands on the flat
// fill behind the outline, so the margin extends the picture's colour (sky stays blue)
// with no line streak. Stretching a row/column (not a flat per-edge average) preserves
// along-edge variation — a landscape scene keeps sky-at-top / grass-at-bottom.
export interface EdgeFill {
  /** Source rect in the sheet to sample (a 1px-thin edge strip). */
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
  bh: number
): EdgeFill[] {
  const top = Math.round(oy);
  const left = Math.round(ox);
  const bottom = Math.round(oy + bh);
  const right = Math.round(ox + bw);
  const bottomMargin = H - bottom;
  const rightMargin = W - right;
  const inset = Math.max(1, Math.round(Math.min(bw, bh) * 0.02));
  const fills: EdgeFill[] = [];
  // Pass 1 — vertical: box top/bottom rows stretched across the box width.
  if (top > 0)
    fills.push({ sx: ox, sy: oy + inset, sw: bw, sh: 1, dx: ox, dy: 0, dw: bw, dh: top });
  if (bottomMargin > 0)
    fills.push({
      sx: ox,
      sy: bottom - 1 - inset,
      sw: bw,
      sh: 1,
      dx: ox,
      dy: bottom,
      dw: bw,
      dh: bottomMargin,
    });
  // Pass 2 — horizontal: full-height columns just inside each side edge, stretched
  // outward (also covers the corners pass 1 filled).
  if (left > 0) fills.push({ sx: ox + inset, sy: 0, sw: 1, sh: H, dx: 0, dy: 0, dw: left, dh: H });
  if (rightMargin > 0)
    fills.push({
      sx: right - 1 - inset,
      sy: 0,
      sw: 1,
      sh: H,
      dx: right,
      dy: 0,
      dw: rightMargin,
      dh: H,
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
  W: number,
  H: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number
) {
  if (!sheetCanvas) return;
  for (const f of edgeMargins(W, H, ox, oy, bw, bh)) {
    g.drawImage(sheetCanvas, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  }
}

// Rasterize the active source into the sheet and refresh the pattern cache. The
// sheet covers the whole visible canvas in paper coordinates (host `sheetBounds`):
// the paper itself normally, or the larger mapped-viewport rect under a rotation
// lock, whose origin can be negative — `sheetOrigin{X,Y}` offsets everything so the
// pattern still aligns. The twin is drawn contain-fit within the PAPER (matching
// where the overlay <img> paints), then its edge colours are extended outward to
// fill every letterbox margin (the twin's own, and the rotation-lock margins around
// the paper); the gradient fills the whole sheet. Re-run on load and every resize.
export function rasterizeSheet() {
  sheetReady = false;
  patternCache = new WeakMap();
  const paper = host?.paperSize();
  const bounds = host?.sheetBounds();
  if (!paper || !bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const source = activeSource();
  if (!source) return;
  if (!sheetCanvas) {
    sheetCanvas = document.createElement('canvas');
    sheetCtx = sheetCanvas.getContext('2d');
  }
  if (!sheetCtx || !sheetCanvas) return;
  sheetCanvas.width = bounds.width;
  sheetCanvas.height = bounds.height;
  sheetOriginX = bounds.x;
  sheetOriginY = bounds.y;
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  if (source === 'twin') {
    const iw = twinImage!.naturalWidth;
    const ih = twinImage!.naturalHeight;
    const scale = Math.min(paper.width / iw, paper.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    // Contain-fit box in paper coords, shifted into the (possibly offset) sheet.
    const ox = (paper.width - dw) / 2 - sheetOriginX;
    const oy = (paper.height - dh) / 2 - sheetOriginY;
    sheetCtx.drawImage(twinImage!, ox, oy, dw, dh);
    extendSheetEdges(sheetCtx, sheetCanvas.width, sheetCanvas.height, ox, oy, dw, dh);
  } else {
    paintGradient(sheetCtx, sheetCanvas.width, sheetCanvas.height, activeGradient!);
  }
  sheetReady = true;
}

// A no-repeat pattern of the sheet, cached per target context (the visible ctx
// almost always; baseline/keyframe contexts on replay). The pattern is offset by the
// sheet's paper-coordinate origin so sheet pixel (0,0) lands at that paper coord —
// identity in normal use, a translation under a rotation lock — keeping it aligned on
// the visible canvas and the larger square baseline alike, all of which draw ops in
// paper coordinates.
export function sheetPatternFor(target: CanvasRenderingContext2D): CanvasPattern | null {
  if (!sheetCanvas || !sheetReady) return null;
  const cached = patternCache.get(target);
  if (cached) return cached;
  const pattern = target.createPattern(sheetCanvas, 'no-repeat');
  if (!pattern) return null;
  if ((sheetOriginX !== 0 || sheetOriginY !== 0) && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, sheetOriginX, sheetOriginY]));
  }
  patternCache.set(target, pattern);
  return pattern;
}

// Load the twin image, guarding against a page change that happened while it
// decoded. On success stash it, then re-rasterize and repaint so already-recorded
// magic ops pick up the colours.
function loadSheetImage(url: string) {
  const forTwinUrl = twinUrl;
  const img = new Image();
  img.onload = () => {
    // A newer page may have been requested while this one decoded — drop stale.
    if (twinUrl !== forTwinUrl) return;
    twinImage = img;
    rasterizeSheet();
    host?.repaint();
  };
  img.onerror = () => {};
  img.src = url;
}

// Point the magic brush at a coloring page's colored twin (or null to detach and
// fall back to the gradient source). The shipped twin is fills-only, so it's drawn
// straight into the sheet; it decodes async, and magic ops recorded before it's
// ready reveal nothing until the load handler repaints.
export function setColorSheet(colorUrl: string | null) {
  if (colorUrl === twinUrl) return;
  twinUrl = colorUrl;
  twinImage = null;
  if (!colorUrl) {
    // Page removed — the sheet reverts to the gradient source if one exists.
    rasterizeSheet();
    host?.repaint();
    return;
  }
  sheetReady = false;
  patternCache = new WeakMap();
  loadSheetImage(colorUrl);
}

// Ensure the brush has something to reveal when it's selected. A coloring page's
// twin takes priority and needs nothing here; otherwise pick a random rainbow from
// the pool and hold it. A no-op once a gradient is already active, so re-selecting
// the brush (or toggling pen↔magic) keeps the same rainbow until the next clear.
export function ensureMagicSheet() {
  if (twinUrl) return;
  if (activeGradient) return;
  if (!gradientPool) gradientPool = buildGradientPool();
  activeGradient = gradientPool[Math.floor(Math.random() * gradientPool.length)];
  rasterizeSheet();
}

// Drop the held gradient so the next brush use picks a fresh one. Called when the
// canvas is cleared. The twin (if a page is applied) is untouched.
export function clearMagicGradient() {
  activeGradient = null;
  if (!twinUrl) {
    sheetReady = false;
    patternCache = new WeakMap();
  }
}
