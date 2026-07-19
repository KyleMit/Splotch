// Crayon brush grain + wax-buildup (area:crayon).
//
// A crayon stroke is drawn exactly like a normal stroke — the engine strokes the
// op's polyline (or fills its start dot) — but its paint is a *grain pattern*
// instead of a flat colour. The pattern is a small, tileable canvas: waxy
// tooth-peak pixels carry the crayon colour (fully opaque), tooth-valley pixels
// are transparent. Stroking with it therefore lays waxy colour that shows the
// paper tooth through the gaps, and the grain is contained to the stroke by
// construction (it's only painted where the stroke geometry is).
//
// Why this shape survives the engine's invariants:
//   * Deterministic (ADR-0033/ criterion): the tooth field is generated once at
//     module load from a fixed integer seed — no Math.random or time at render.
//     Per-(colour, layer) tinted tiles derive purely from that field, so replay,
//     resize, undo, and PNG export reproduce identical pixels.
//   * Bit-identical replay: the pattern repeats from the context origin, and ops
//     always render in PAPER coordinates (identity transform in normal use, and
//     the export/keyframe/baseline surfaces render ops at the paper origin too).
//     So the same paper region always samples the same tile pixels — live draw,
//     rebuild, and export line up cell-for-cell.
//
// Wax buildup (the behaviour that makes it read as crayon, not marker): the
// paper tooth is FIXED in space, so a second same-colour pass can't just repaint
// the same peaks — it must fill the *valleys*. Each op carries a `layer` ordinal
// (0 over virgin paper, 1 for a second overlapping same-colour pass, …), and a
// higher layer lowers the tooth threshold. Because every layer thresholds the
// *same* field, layer N's covered cells are a strict SUPERSET of layer N-1's:
// the overlap is already the identical opaque colour (so it can't darken or shift
// hue — no multiply), and only the newly-exposed valley cells fill in. Coverage
// climbs toward solid while the hue stays put. The engine computes the ordinal
// live from committed history as each segment is drawn, so the fill-in appears
// gradually under the moving finger, never as a post-commit snap.
//
// Floor note (docs/COMPATIBILITY.md): uses only createPattern + ImageData, both
// well within the Chrome 111 / Safari 16.4 floor. It deliberately avoids
// `ctx.filter` (unsupported at the Safari 16.4 floor — see exportDrawing.ts).

// --- Tunable parameters (the dev A/B seam) ---------------------------------

export interface CrayonParams {
  // Tile edge in backing-store px. Sets the grain's spatial scale — smaller =
  // finer tooth. Must stay modest so the repeating tile is cheap to build.
  tile: number;
  // Octaves of value noise summed into the tooth field: [cells, weight]. `cells`
  // is the lattice resolution across the tile (must divide `tile` for seamless
  // tiling); higher = finer features. Weights are normalised.
  octaves: [number, number][];
  // Fraction of tile pixels that carry wax at each buildup layer, index = layer.
  // Monotonically increasing so each layer is a superset of the last. The final
  // entry is typically 1 (solid) — the most a colour can build to.
  coverage: number[];
  // Lightness mottle within the wax, as a fraction (±). A little same-hue value
  // variation reads as waxy sheen without darkening on overlap (a given tile
  // pixel always resolves to the same tone, so repainting it is idempotent).
  mottle: number;
  // Integer seed for the deterministic field. Changing it reshuffles the tooth.
  seed: number;
}

export const CRAYON_PARAMS: Record<string, CrayonParams> = {
  // The shipped default — tuned against real-crayon references (see the judge
  // loop in scripts/crayon/). Fine tooth, dense-but-toothy first pass, building
  // to solid by the fourth overlapping pass.
  waxy: {
    tile: 192,
    octaves: [
      [64, 1],
      [48, 0.55],
      [96, 0.4],
      [32, 0.28],
    ],
    coverage: [0.7, 0.83, 0.93, 1],
    mottle: 0.12,
    seed: 0x5c1a7c0,
  },
  // A/B alternatives kept for the dev sweep (setCrayonParams).
  fine: {
    tile: 64,
    octaves: [
      [16, 1],
      [32, 0.55],
      [64, 0.28],
    ],
    coverage: [0.55, 0.72, 0.86, 1],
    mottle: 0.05,
    seed: 0x5c1a7c0,
  },
  coarse: {
    tile: 128,
    octaves: [
      [8, 1],
      [16, 0.5],
      [24, 0.28],
    ],
    coverage: [0.64, 0.8, 0.92, 1],
    mottle: 0.1,
    seed: 0x5c1a7c0,
  },
};

export const MAX_CRAYON_LAYER = 3;

let params: CrayonParams = CRAYON_PARAMS.waxy;
// Bumped whenever params change so cached patterns/masks are invalidated without
// having to walk the per-context caches.
let paramsVersion = 0;

// --- Deterministic tooth field ---------------------------------------------

// mulberry32 — a tiny deterministic PRNG. Exact integer math, so it yields the
// same sequence on every engine (no Math.sin hashing that could vary).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// One octave of tileable value noise: a `cells`×`cells` lattice of random values
// (wrapping at the edges so the tile is seamless), bilinearly interpolated with a
// smoothstep fade to `tile`×`tile`.
function octave(tile: number, cells: number, rand: () => number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(tile * tile);
  const step = cells / tile;
  for (let y = 0; y < tile; y++) {
    const gy = y * step;
    const y0 = Math.floor(gy) % cells;
    const y1 = (y0 + 1) % cells;
    const fy = smoothstep(gy - Math.floor(gy));
    for (let x = 0; x < tile; x++) {
      const gx = x * step;
      const x0 = Math.floor(gx) % cells;
      const x1 = (x0 + 1) % cells;
      const fx = smoothstep(gx - Math.floor(gx));
      const v00 = lattice[y0 * cells + x0];
      const v10 = lattice[y0 * cells + x1];
      const v01 = lattice[y1 * cells + x0];
      const v11 = lattice[y1 * cells + x1];
      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      out[y * tile + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

interface ToothField {
  tile: number;
  // Height in [0,1] per tile pixel (paper tooth: high = peak).
  height: Float32Array;
  // Independent [0,1] field driving the same-hue lightness mottle.
  sheen: Float32Array;
  // Tooth threshold per layer, derived so exactly coverage[layer] of pixels pass.
  thresholds: number[];
  version: number;
}

let field: ToothField | null = null;

function buildField(): ToothField {
  const { tile, octaves, coverage, seed } = params;
  const rand = mulberry32(seed);
  const height = new Float32Array(tile * tile);
  let weightSum = 0;
  for (const [cells, weight] of octaves) {
    const oct = octave(tile, Math.min(cells, tile), rand);
    for (let i = 0; i < height.length; i++) height[i] += oct[i] * weight;
    weightSum += weight;
  }
  // Normalise to [0,1] so percentile thresholds are stable across octave configs.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < height.length; i++) {
    height[i] /= weightSum;
    if (height[i] < min) min = height[i];
    if (height[i] > max) max = height[i];
  }
  const span = max - min || 1;
  for (let i = 0; i < height.length; i++) height[i] = (height[i] - min) / span;

  // Percentile thresholds: sort a copy, then pick the cut that leaves the target
  // fraction of pixels at or above it. Decouples "coverage %" from the field's
  // distribution, and guarantees monotonic supersets since coverage is monotonic.
  const sorted = Float32Array.from(height).sort();
  const thresholds = coverage.map((c) => {
    const frac = Math.min(Math.max(c, 0), 1);
    if (frac >= 1) return -Infinity; // solid: every pixel passes
    const idx = Math.min(sorted.length - 1, Math.floor((1 - frac) * sorted.length));
    return sorted[idx];
  });

  const sheen = octave(tile, Math.min(24, tile), mulberry32(seed ^ 0x9e3779b9));

  return { tile, height, sheen, thresholds, version: paramsVersion };
}

function toothField(): ToothField {
  if (!field || field.version !== paramsVersion) field = buildField();
  return field;
}

// --- Per-(colour, layer) tinted tiles + pattern cache ----------------------

function parseColor(color: string): [number, number, number] {
  // Palette colours are hex; fall back to a canvas parse for anything else.
  const hex = color.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const short = /^#?([0-9a-f]{3})$/i.exec(hex);
  if (short) {
    const r = parseInt(short[1][0], 16);
    const g = parseInt(short[1][1], 16);
    const b = parseInt(short[1][2], 16);
    return [r * 17, g * 17, b * 17];
  }
  return colorViaCanvas(color);
}

let parseCanvas: CanvasRenderingContext2D | null = null;
function colorViaCanvas(color: string): [number, number, number] {
  if (!parseCanvas) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    parseCanvas = c.getContext('2d');
  }
  if (!parseCanvas) return [0, 0, 0];
  parseCanvas.clearRect(0, 0, 1, 1);
  parseCanvas.fillStyle = color;
  parseCanvas.fillRect(0, 0, 1, 1);
  const d = parseCanvas.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// Build the tile canvas for one (colour, layer): opaque crayon colour where the
// tooth passes this layer's threshold, transparent elsewhere. Wax pixels carry a
// subtle same-hue lightness mottle so the body reads as waxy, not a flat cutout —
// but a given pixel always resolves to the same tone, so an overlapping pass that
// repaints it is a no-op (no darkening).
function buildTile(color: string, layer: number): HTMLCanvasElement {
  const f = toothField();
  const tile = f.tile;
  const threshold = f.thresholds[Math.min(layer, f.thresholds.length - 1)];
  const [r, g, b] = parseColor(color);
  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(tile, tile);
  const data = img.data;
  const mottle = params.mottle;
  for (let i = 0; i < f.height.length; i++) {
    const o = i * 4;
    if (f.height[i] >= threshold) {
      // sheen in [0,1] → lightness factor in [1-mottle, 1+mottle].
      const k = 1 + (f.sheen[i] * 2 - 1) * mottle;
      data[o] = clamp255(r * k);
      data[o + 1] = clamp255(g * k);
      data[o + 2] = clamp255(b * k);
      data[o + 3] = 255;
    } else {
      data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Per-target-context pattern cache (mirrors magicBrush's approach): a pattern is
// created from the target ctx, keyed by colour|layer|paramsVersion. The visible
// ctx, the baseline, keyframes, and the export snapshot each get their own.
interface CtxCache {
  version: number;
  patterns: Map<string, CanvasPattern>;
  tiles: Map<string, HTMLCanvasElement>;
}
const ctxCaches = new WeakMap<CanvasRenderingContext2D, CtxCache>();

function cacheFor(target: CanvasRenderingContext2D): CtxCache {
  let c = ctxCaches.get(target);
  if (!c || c.version !== paramsVersion) {
    c = { version: paramsVersion, patterns: new Map(), tiles: new Map() };
    ctxCaches.set(target, c);
  }
  return c;
}

// The repeating grain pattern for a (colour, layer) on a target context. Anchored
// to the context origin (paper origin), so the tooth grid is fixed in paper space
// and aligns across live draw / replay / export.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string,
  layer: number
): CanvasPattern | null {
  const lvl = Math.min(Math.max(layer | 0, 0), MAX_CRAYON_LAYER);
  const key = `${color}|${lvl}`;
  const cache = cacheFor(target);
  const cached = cache.patterns.get(key);
  if (cached) return cached;
  let tile = cache.tiles.get(key);
  if (!tile) {
    tile = buildTile(color, lvl);
    cache.tiles.set(key, tile);
  }
  const pattern = target.createPattern(tile, 'repeat');
  if (!pattern) return null;
  cache.patterns.set(key, pattern);
  return pattern;
}

// --- Dev A/B seam -----------------------------------------------------------

// Swap the active crayon parameters (a named variant or an explicit override) and
// invalidate every cache. Wired onto window.__engine only on /dev/engine; the
// judge loop drives it to A/B tile/coverage settings. Production ships `waxy`.
export function setCrayonParams(next: string | Partial<CrayonParams>): void {
  if (typeof next === 'string') {
    const preset = CRAYON_PARAMS[next];
    if (preset) params = preset;
  } else {
    params = { ...params, ...next };
  }
  paramsVersion++;
  field = null;
}

export function getCrayonParams(): CrayonParams {
  return { ...params };
}

// Prime the tile+pattern cache for a colour across every buildup layer, so the
// one-time ImageData tile build never lands on the draw hot path (it's ~1 frame
// under a 4× CPU throttle). Called off the hot path (idle) when the crayon is
// selected or its colour changes. Cheap and idempotent once cached.
export function warmCrayonTiles(target: CanvasRenderingContext2D, color: string): void {
  for (let layer = 0; layer <= MAX_CRAYON_LAYER; layer++) {
    crayonPatternFor(target, color, layer);
  }
}
