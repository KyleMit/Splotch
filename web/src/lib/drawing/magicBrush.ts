// Magic brush color source (ADR-0043).
//
// The magic brush reveals a hidden "color sheet" wherever the child strokes.
// Two sources can feed that sheet, and this module owns both:
//
//   1. A coloring page's flat-colored twin (`{page}.color.webp`), when a page is
//      applied — the original ADR-0043 behaviour: a revealed pixel lands under
//      the line art it belongs to.
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

// Source 1: the coloring page's colored twin.
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
    const img = twinImage!;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(canvas.width / iw, canvas.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = (canvas.width - dw) / 2;
    const oy = (canvas.height - dh) / 2;
    sheetCtx.drawImage(img, ox, oy, dw, dh);
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

// Point the magic brush at a coloring page's colored twin (or null to detach and
// fall back to the gradient source). The image decodes async; magic ops recorded
// before it's ready reveal nothing until the load handler rasterizes and repaints.
export function setColorSheet(url: string | null) {
  if (url === twinUrl) return;
  twinUrl = url;
  twinImage = null;
  if (!url) {
    // Page removed — the sheet reverts to the gradient source if one exists.
    rasterizeSheet();
    host?.repaint();
    return;
  }
  sheetReady = false;
  patternCache = new WeakMap();
  const img = new Image();
  img.onload = () => {
    // A newer sheet may have been requested while this one decoded — drop stale.
    if (twinUrl !== url) return;
    twinImage = img;
    rasterizeSheet();
    host?.repaint();
  };
  img.onerror = () => {};
  img.src = url;
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
