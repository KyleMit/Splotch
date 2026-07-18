// Crayon brush — waxy wax-on-paper texture for the pen (see the crayon design
// note in docs/adrs). The pen renders crayon by default; `flat` (the old solid
// stroke) stays available through the dev seam for A/B.
//
// How it stays inside the single-renderer / bit-identical model (ADR-0033):
//
//  * The grain is a set of precomputed grayscale "paper tooth" ALPHA tiles built
//    once from a fixed seed (mulberry32 value noise) — deterministic, no
//    Math.random / time at render. A crayon op paints its colour through a tooth
//    tile used as a repeating CanvasPattern, anchored to the user-space (paper)
//    origin exactly like a plain stroke, so live drawing and undo/resize/export
//    replay tile identically.
//  * The tooth alpha is a hard 0/1 step, so depositing the same tile at the same
//    paper position any number of times is idempotent: the many per-frame ops of
//    a live stroke and the few simplified ops it rebuilds into (ADR-0036)
//    composite to the same pixels, and overlapping the SAME colour never darkens
//    (source-over of an opaque colour over itself is that colour).
//
// Wax build-up: each stroke stamps a DIFFERENT tooth tile, chosen by a per-stroke
// `seed` stored on the op. A new same-colour stroke over an old one fills tooth
// valleys the first pass missed — coverage grows toward solid while the hue holds
// constant. A single continuous stroke shares one tile, so it never builds up on
// itself (one pass is one pass).
//
// Each op is painted in two passes: a wider SPARSE edge halo (feathers the
// boundary into ragged wax flecks) then the dense BODY, so the stroke edge reads
// broken-but-crisp instead of a clean geometric rim.

// All sizes are in paper/backing pixels (the space ops are recorded in), which
// run at renderScale (~2 on device). Tuned against real-crayon reference photos.
const TILE = 256;
const TILE_COUNT = 6;
const SEED_BASE = 1337;
const FINE_CELLS = 128; // ~2px micro tooth
const CLUMP_CELLS = 52; // ~5px wax clumping
const DENS_CELLS = 12; // ~21px density variation (waxy zones + ragged edges)
const FINE_WEIGHT = 0.5;
const CLUMP_WEIGHT = 0.5;
const DENS_AMP = 0.16;
const BODY_THRESHOLD = 0.4;
const EDGE_THRESHOLD = 0.56; // sparser than the body => broken halo flecks
export const CRAYON_HALO_SCALE = 1.18; // edge pass width / body width

import { scheduleIdle } from '../idle';

export type BrushVariant = 'crayon' | 'flat';

// Mulberry32 — tiny deterministic PRNG, seeded per tile.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a wrapping grid (so tiles seam-tile), smoothstep-interpolated.
function valueNoise(rand: () => number, size: number, cells: number): Float32Array {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(size * size);
  const s = cells / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x * s;
      const fy = y * s;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const ix0 = x0 % cells;
      const iy0 = y0 % cells;
      const ix1 = (x0 + 1) % cells;
      const iy1 = (y0 + 1) % cells;
      const a = g[iy0 * cells + ix0];
      const b = g[iy0 * cells + ix1];
      const c = g[iy1 * cells + ix0];
      const d = g[iy1 * cells + ix1];
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const top = a + (b - a) * sx;
      const bot = c + (d - c) * sx;
      out[y * size + x] = top + (bot - top) * sy;
    }
  }
  return out;
}

// Build one grayscale tooth tile (white RGB, alpha = hard 0/1 coverage) as a
// canvas. `threshold` sets density; the low-frequency `dens` octave modulates it
// locally so the wax has denser and sparser zones (and ragged edges).
function buildToothTile(seed: number, threshold: number): HTMLCanvasElement {
  const rand = mulberry32(seed);
  const fine = valueNoise(rand, TILE, FINE_CELLS);
  const clump = valueNoise(rand, TILE, CLUMP_CELLS);
  const dens = valueNoise(rand, TILE, DENS_CELLS);
  const img = new ImageData(TILE, TILE);
  const px = img.data;
  for (let i = 0; i < TILE * TILE; i++) {
    const v = FINE_WEIGHT * fine[i] + CLUMP_WEIGHT * clump[i];
    const t = threshold + DENS_AMP * (0.5 - dens[i]);
    const o = i * 4;
    px[o] = 255;
    px[o + 1] = 255;
    px[o + 2] = 255;
    px[o + 3] = v > t ? 255 : 0;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas;
}

export type CrayonLayer = 'body' | 'edge';

interface ToothTiles {
  body: HTMLCanvasElement[];
  edge: HTMLCanvasElement[];
}

let toothTiles: ToothTiles | null = null;

// Build the tooth tile sets once (both layers × TILE_COUNT phases). Idempotent.
export function ensureCrayonTiles(): ToothTiles {
  if (toothTiles) return toothTiles;
  const mk = (threshold: number) =>
    Array.from({ length: TILE_COUNT }, (_, k) =>
      // Decorrelate phases with a large odd stride so overlapping strokes fill
      // different tooth valleys (build-up), not the same ones.
      buildToothTile((SEED_BASE + k * 0x9e3779b1) >>> 0, threshold)
    );
  toothTiles = { body: mk(BODY_THRESHOLD), edge: mk(EDGE_THRESHOLD) };
  return toothTiles;
}

// Build the tooth tiles off the critical path so the first crayon stroke doesn't
// pay the one-time value-noise cost mid-gesture.
export function warmCrayonTilesWhenIdle(): void {
  scheduleIdle(() => void ensureCrayonTiles());
}

// Which tile phase a stroke's seed maps to. Consecutive strokes (seed++) always
// differ, guaranteeing build-up when a new stroke overlaps an old one.
export function crayonTileIndex(seed: number): number {
  return ((seed % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;
}

// Colour-independent tiles times the finite palette, so a Map is bounded.
const coloredTileCache = new Map<string, HTMLCanvasElement>();

function coloredTile(layer: CrayonLayer, color: string, index: number): HTMLCanvasElement {
  const key = `${layer}|${color}|${index}`;
  const cached = coloredTileCache.get(key);
  if (cached) return cached;
  const tiles = ensureCrayonTiles();
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, TILE, TILE);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(tiles[layer][index], 0, 0);
  coloredTileCache.set(key, canvas);
  return canvas;
}

// Patterns are cached per target context (like the magic sheet) — the visible
// ctx almost always, plus the baseline/keyframe/export contexts on replay.
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

// A repeating CanvasPattern of the coloured tooth tile for (layer, colour,
// index), anchored to the user-space (paper) origin — no setTransform, so it
// tiles identically on every surface and needs no modern-API guard.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  layer: CrayonLayer,
  color: string,
  index: number
): CanvasPattern | null {
  let perTarget = patternCache.get(target);
  if (!perTarget) {
    perTarget = new Map();
    patternCache.set(target, perTarget);
  }
  const key = `${layer}|${color}|${index}`;
  const cached = perTarget.get(key);
  if (cached) return cached;
  const pattern = target.createPattern(coloredTile(layer, color, index), 'repeat');
  if (!pattern) return null;
  perTarget.set(key, pattern);
  return pattern;
}
