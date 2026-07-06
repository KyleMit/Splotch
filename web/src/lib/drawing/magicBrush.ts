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
// wiring. The offscreen sheet is a canvas the exact size of the main canvas; a
// no-repeat CanvasPattern of it is the brush's paint (chosen over a per-op mask
// composite and a flat colour-sample after measuring all three — see ADR-0043).

export const MAGIC_GRADIENT_COUNT = 10;

// A source line-art pixel this dark (0–255 luma) is treated as outline and punched
// out of the twin so it can't double the overlay's line work. Above it the pixel
// is a fill and kept — including legitimately dark fills (a ladybug's black spots,
// a navy sky) that sit away from the outline.
const OUTLINE_LUMA_THRESHOLD = 150;

interface GradientStop {
  offset: number;
  color: string;
}

export interface RainbowGradient {
  // Direction of the gradient line, in radians, measured from the +x axis.
  angle: number;
  stops: GradientStop[];
}

// The engine hands the module a live view of its canvas (reassigned on resize) and
// a repaint hook so an async twin load can refresh already-recorded magic ops.
interface MagicBrushHost {
  canvas: () => HTMLCanvasElement | null;
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

// Rasterize the active source into a canvas-sized sheet and refresh the pattern
// cache. The twin is drawn contain-fit (matching where the overlay <img> paints);
// the gradient fills the whole sheet. Re-run on load and on every resize (the
// canvas backing store changed).
export function rasterizeSheet() {
  sheetReady = false;
  patternCache = new WeakMap();
  const canvas = host?.canvas();
  if (!canvas) return;
  const source = activeSource();
  if (!source) return;
  if (!sheetCanvas) {
    sheetCanvas = document.createElement('canvas');
    sheetCtx = sheetCanvas.getContext('2d');
  }
  if (!sheetCtx || !sheetCanvas) return;
  sheetCanvas.width = canvas.width;
  sheetCanvas.height = canvas.height;
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  if (source === 'twin') {
    // Prefer the fills-only twin (outlines masked out); fall back to the raw twin
    // until the mask is built, or when no line art was supplied to build it.
    const drawable: CanvasImageSource = fillsCanvas ?? twinImage!;
    const iw = fillsCanvas ? fillsCanvas.width : twinImage!.naturalWidth;
    const ih = fillsCanvas ? fillsCanvas.height : twinImage!.naturalHeight;
    const scale = Math.min(canvas.width / iw, canvas.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = (canvas.width - dw) / 2;
    const oy = (canvas.height - dh) / 2;
    sheetCtx.drawImage(drawable, ox, oy, dw, dh);
  } else {
    paintGradient(sheetCtx, sheetCanvas.width, sheetCanvas.height, activeGradient!);
  }
  sheetReady = true;
}

// A no-repeat pattern of the sheet, cached per target context (the visible ctx
// almost always; baseline/keyframe contexts on replay). Positioned from each
// target's origin (0,0) — the same origin op coordinates use — so it aligns on the
// visible canvas and the larger square baseline alike.
export function sheetPatternFor(target: CanvasRenderingContext2D): CanvasPattern | null {
  if (!sheetCanvas || !sheetReady) return null;
  const cached = patternCache.get(target);
  if (cached) return cached;
  const pattern = target.createPattern(sheetCanvas, 'no-repeat');
  if (pattern) patternCache.set(target, pattern);
  return pattern;
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
  // fill/background pixels transparent — scaled to the twin's resolution.
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;
  mctx.drawImage(lineArtImage, 0, 0, w, h);
  const px = mctx.getImageData(0, 0, w, h);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i + 3] = luma < OUTLINE_LUMA_THRESHOLD ? 255 : 0;
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
