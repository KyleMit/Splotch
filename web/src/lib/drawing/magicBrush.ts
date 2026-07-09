// Magic brush color source (ADR-0043).
//
// The magic brush reveals a hidden "color sheet" wherever the child strokes.
// Two sources can feed that sheet, and this module owns both:
//
//   1. A coloring page's flat-colored twin (`{page}.color.webp`), when a page is
//      applied — the original ADR-0043 behaviour: a revealed pixel lands under
//      the line art it belongs to. The twin keeps the page's own black outlines,
//      but the overlay <img> already draws those exact lines on top (multiply),
//      so revealing the twin's copy doubles them: any sub-pixel or per-twin
//      registration drift shows as ghosting / duplicate lines. So the twin's
//      outlines are masked out (using the line art as the mask) and the reveal
//      carries flat fills only — the overlay stays the single source of line work.
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

// A source line-art pixel this dark (0–255 luma) is treated as outline and punched
// out of the twin so it can't double the overlay's line work. Above it the pixel
// is a fill and kept — including legitimately dark fills (a ladybug's black spots,
// a navy sky) that sit away from the outline.
const OUTLINE_LUMA_THRESHOLD = 150;

// Grow the outline mask this many pixels before punching. The twin is a lossy
// image whose own black lines bloom a pixel or two FATTER than this clean line-art
// mask, so a mask at the exact line width leaves a thin dark rim of the twin's line
// sitting just outside the crisp overlay line — the "ghosting" (a faint doubled
// line) this whole fills-only reveal exists to kill. The `.color.webp` twins vary:
// the tall crops register tightly, but several wide crops (ant, ladybug, spider,
// duck) carry a rim the exact-width punch leaves behind. Dilating the mask a couple
// of pixels swallows that rim. The overlay redraws the line on top anyway, so
// widening the punch only eats fill that lives under the overlay's own line work.
const OUTLINE_MASK_DILATION = 2;

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

// Source 1: the coloring page's colored twin, plus its line art. The line art is
// loaded only to mask the twin's own outlines out of the reveal (buildFillsSheet);
// `fillsCanvas` is the resulting fills-only twin, drawn into the sheet in place of
// the raw twin once both images have decoded.
let twinImage: HTMLImageElement | null = null;
let twinUrl: string | null = null;
let lineArtImage: HTMLImageElement | null = null;
let lineArtUrl: string | null = null;
let fillsCanvas: HTMLCanvasElement | null = null;

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
    // Prefer the fills-only twin (outlines masked out); fall back to the raw twin
    // until the mask is built, or when no line art was supplied to build it.
    const drawable: CanvasImageSource = fillsCanvas ?? twinImage!;
    const iw = fillsCanvas ? fillsCanvas.width : twinImage!.naturalWidth;
    const ih = fillsCanvas ? fillsCanvas.height : twinImage!.naturalHeight;
    const scale = Math.min(paper.width / iw, paper.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    // Contain-fit box in paper coords, shifted into the (possibly offset) sheet.
    const ox = (paper.width - dw) / 2 - sheetOriginX;
    const oy = (paper.height - dh) / 2 - sheetOriginY;
    sheetCtx.drawImage(drawable, ox, oy, dw, dh);
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

// Grow a binary mask (1 = set) outward by `r` pixels — a separable box dilation
// (a horizontal max pass then a vertical one), so an isolated pixel becomes a
// (2r+1)² block. Used to widen the outline punch past the lossy twin's line bloom
// (OUTLINE_MASK_DILATION). Pure and allocation-light; runs once per applied page,
// off the draw and resize paths. Exported for unit testing.
export function dilateMask(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      let v = 0;
      for (let nx = lo; nx <= hi; nx++) {
        if (src[row + nx]) {
          v = 1;
          break;
        }
      }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      let v = 0;
      for (let ny = lo; ny <= hi; ny++) {
        if (tmp[ny * w + x]) {
          v = 1;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// Build the fills-only twin: punch the twin's own outlines out using the source
// line art as a mask, so the magic reveal carries flat fills and the overlay <img>
// stays the single source of line work (no doubled/ghosted lines). One readback of
// the line art at the twin's resolution — done once per applied page, never on the
// draw or resize path — so ADR-0043's hot-path and resize costs are untouched.
// A no-op (leaving fillsCanvas null → the raw twin is revealed) until both images
// have decoded, or when no line art was supplied to mask with.
function buildFillsSheet() {
  fillsCanvas = null;
  if (!twinImage || !twinImage.naturalWidth) return;
  if (!lineArtUrl || !lineArtImage || !lineArtImage.naturalWidth) return;
  const w = twinImage.naturalWidth;
  const h = twinImage.naturalHeight;
  const fc = document.createElement('canvas');
  fc.width = w;
  fc.height = h;
  const fctx = fc.getContext('2d');
  if (!fctx) return;
  fctx.drawImage(twinImage, 0, 0, w, h);

  // Turn the line art's dark (outline) pixels into an opaque alpha mask — light
  // fill/background pixels transparent — scaled to the twin's resolution, then
  // dilated so the punch clears the twin's fatter line bloom (OUTLINE_MASK_DILATION).
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;
  mctx.drawImage(lineArtImage, 0, 0, w, h);
  const px = mctx.getImageData(0, 0, w, h);
  const d = px.data;
  const outline = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    outline[p] = luma < OUTLINE_LUMA_THRESHOLD ? 1 : 0;
  }
  const punch = dilateMask(outline, w, h, OUTLINE_MASK_DILATION);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    d[i + 3] = punch[p] ? 255 : 0;
  }
  mctx.putImageData(px, 0, 0);

  // Erase the masked outline pixels from the twin, leaving fills only.
  fctx.globalCompositeOperation = 'destination-out';
  fctx.drawImage(mask, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fillsCanvas = fc;
}

// Load one of the twin/line-art source images, guarding against a page change that
// happened while it decoded. On success stash it, rebuild the fills-only sheet (a
// no-op until both are present), then re-rasterize and repaint so already-recorded
// magic ops pick up the colours.
function loadSheetImage(url: string, assign: (img: HTMLImageElement) => void) {
  const forTwinUrl = twinUrl;
  const forLineArtUrl = lineArtUrl;
  const img = new Image();
  img.onload = () => {
    // A newer page may have been requested while this one decoded — drop stale.
    if (twinUrl !== forTwinUrl || lineArtUrl !== forLineArtUrl) return;
    assign(img);
    buildFillsSheet();
    rasterizeSheet();
    host?.repaint();
  };
  img.onerror = () => {};
  img.src = url;
}

// Point the magic brush at a coloring page's colored twin, with its line art (or
// null to detach and fall back to the gradient source). The twin supplies the fill
// colours; the line art is used only to mask the twin's redundant outlines out of
// the reveal (buildFillsSheet). Both decode async and in parallel; magic ops
// recorded before they're ready reveal nothing until a load handler repaints.
export function setColorSheet(colorUrl: string | null, lineArtSrc: string | null = null) {
  if (colorUrl === twinUrl && lineArtSrc === lineArtUrl) return;
  twinUrl = colorUrl;
  lineArtUrl = lineArtSrc;
  twinImage = null;
  lineArtImage = null;
  fillsCanvas = null;
  if (!colorUrl) {
    // Page removed — the sheet reverts to the gradient source if one exists.
    rasterizeSheet();
    host?.repaint();
    return;
  }
  sheetReady = false;
  patternCache = new WeakMap();
  loadSheetImage(colorUrl, (img) => {
    twinImage = img;
  });
  if (lineArtSrc) {
    loadSheetImage(lineArtSrc, (img) => {
      lineArtImage = img;
    });
  }
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
