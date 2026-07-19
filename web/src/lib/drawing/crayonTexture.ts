// The crayon brush's paper-tooth texture (the wax-on-paper look + wax buildup).
//
// A crayon op is stroked/filled exactly like a pen op, but its paint is a
// CanvasPattern whose pixels are the op's COLOUR at a per-pixel ALPHA taken from
// a fixed paper-tooth field. Two consequences fall straight out of compositing
// the same opaque hue with `source-over`:
//
//   * Wax buildup (ADR-crayon criterion 4/5). Overlapping same-colour strokes
//     ACCUMULATE alpha — a valley that showed paper at 0.3 coverage on the first
//     pass reaches 1-(1-0.3)^2 = 0.51 on the second, then 0.66… — so the grain
//     fills in and the stroke gets denser while the colour is UNCHANGED
//     (compositing C over C is C at any alpha: no multiply-style darkening, the
//     hue never shifts or muddies). It is live and gradual because each per-frame
//     op composites as it is drawn, never as a post-commit snap.
//
//   * Containment (criterion 2). The tooth only ever lands where the stroke
//     geometry paints — nothing sprays past the path the finger drew.
//
// The field is a fixed, seamless, seeded value-noise tile (no Math.random / time
// at render — criterion 7), tiled in PAPER coordinates so a given paper pixel
// always samples the same tooth. That paper anchoring is what makes overlapping
// strokes catch the SAME tooth (real paper tooth is fixed, so buildup fills the
// same valleys) AND makes undo/resize/export replay bit-identical: every target
// context draws ops in paper-pixel space with the tile anchored at the paper
// origin, so live and rebuilt pixels match (criterion 6).

// A crayon rendering variant — the knobs the dev harness A/Bs. The tooth field
// has THREE populations, which is what makes it read as wax on paper AND build
// up correctly:
//   * deep PITS (alpha 0) — the bottoms of the paper tooth the wax never reaches.
//     `pit` is the noise fraction that maps to pits. They stay white through any
//     number of passes, so a dense scribble keeps its fine paper flecks and the
//     stroke edge stays broken (criteria 1 & 3), and they can't ever fill.
//   * mid VALLEYS (alpha `toothFloor`..`body`) — partly-waxed tooth. These FILL
//     as same-colour passes accumulate alpha, which is the visible buildup
//     (criterion 4/5): a valley at 0.35 on pass one is 0.58 on pass two, 0.73 on
//     pass three, while the hue never changes.
//   * dense BODY (alpha `body`) — the raised tooth the wax coats on the first
//     pass, so a single stroke already reads as a dense waxy body, not a wash.
// `bodyThresh` is where the ramp saturates to the body (higher = more tooth, less
// solid body). The tooth is an organic multi-octave height field (fBm) rather
// than flat noise, so it clumps into paper-tooth patches instead of uniform
// digital grit: `grain` is the mid-octave feature size in device px, and `warp`
// domain-warps the field (px) to break up the lattice into fibrous, hand-made
// paper grain — and to notch the stroke edge so it reads broken, not clean.

import { scheduleIdle } from '../idle';

export interface CrayonVariant {
  body: number;
  toothFloor: number;
  pit: number;
  bodyThresh: number;
  grain: number;
  warp: number;
}

// The shipping default is chosen by the A/B judge loop (scripts/crayon). Tuned
// for: a dense waxy body with a fine broken paper tooth on one pass, and a
// clearly visible fill-in (tooth filling, hue constant) on a second same-colour
// pass — while the deepest pits keep showing paper however dense it gets.
export const CRAYON_VARIANTS: Record<string, CrayonVariant> = {
  // v3 — organic fBm tooth, permanent fine pits, fill-able mids for buildup.
  waxy: { body: 0.95, toothFloor: 0.3, pit: 0.22, bodyThresh: 0.6, grain: 5, warp: 3.2 },
  // Denser, harder-pressed crayon: fewer pits, higher floor, less tooth.
  bold: { body: 0.97, toothFloor: 0.42, pit: 0.13, bodyThresh: 0.48, grain: 4.5, warp: 2.6 },
  // Lighter touch: more pits and mids, so the first pass is toothier and buildup
  // is the most dramatic.
  light: { body: 0.92, toothFloor: 0.24, pit: 0.28, bodyThresh: 0.72, grain: 5.5, warp: 3.6 },
};

export const DEFAULT_CRAYON_VARIANT = 'waxy';

let variant: CrayonVariant = { ...CRAYON_VARIANTS[DEFAULT_CRAYON_VARIANT] };

// The tile is a power-of-two square so the periodic lattice wraps seamlessly.
// 512 keeps the paper-tooth repeat from reading as a visible motif even across a
// big fill; it's built once per variant, off the draw hot path.
const TILE = 512;

// --- deterministic seamless value noise ------------------------------------

// A tiny seeded PRNG (mulberry32). Constant seed → the tooth field is identical
// on every device and every render.
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

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// A `cells`×`cells` lattice of random values, wrapping mod `cells` so any noise
// built on it tiles seamlessly across the TILE.
function makeLattice(cells: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  return lattice;
}

// Sample a periodic value-noise lattice at continuous tile coordinates (px),
// smooth-interpolated. `cells` lattice cells span the whole TILE, so the field
// has period TILE and wraps seamlessly.
function sampleLattice(lattice: Float32Array, cells: number, x: number, y: number): number {
  const scale = cells / TILE;
  const fx = x * scale;
  const fy = y * scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smoothstep(fx - ix);
  const ty = smoothstep(fy - iy);
  const at = (gx: number, gy: number) =>
    lattice[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)];
  const v00 = at(ix, iy);
  const v10 = at(ix + 1, iy);
  const v01 = at(ix, iy + 1);
  const v11 = at(ix + 1, iy + 1);
  const top = v00 + (v10 - v00) * tx;
  const bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

// A fractal (fBm) paper-height field: three octaves of periodic value noise at
// halving feature size and amplitude, so the tooth clumps at several scales like
// real hand-made paper instead of one uniform grain. `grain` is the mid octave's
// feature size in device px. Returned normalised to ~[0,1] as a TILE×TILE field,
// with a light domain warp (`warp` px, driven by a coarse noise pair) that
// marbles the lattice into fibrous grain and breaks any straight edge it meets.
function paperHeightField(grain: number, warp: number): Float32Array {
  const octaves = [
    { cells: Math.max(2, Math.round(TILE / (grain * 2))), amp: 1, seed: 0x9e3779b9 },
    { cells: Math.max(2, Math.round(TILE / grain)), amp: 0.55, seed: 0x85ebca77 },
    { cells: Math.max(2, Math.round(TILE / (grain / 2))), amp: 0.3, seed: 0xc2b2ae35 },
  ];
  const warpX = makeLattice(Math.max(2, Math.round(TILE / (grain * 3))), 0x27d4eb2f);
  const warpY = makeLattice(Math.max(2, Math.round(TILE / (grain * 3))), 0x165667b1);
  const warpCells = Math.max(2, Math.round(TILE / (grain * 3)));
  const total = octaves.reduce((s, o) => s + o.amp, 0);
  const out = new Float32Array(TILE * TILE);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wx = x + warp * (sampleLattice(warpX, warpCells, x, y) * 2 - 1);
      const wy = y + warp * (sampleLattice(warpY, warpCells, x, y) * 2 - 1);
      let v = 0;
      for (const o of octaves) v += o.amp * sampleLattice(lattice(o), o.cells, wx, wy);
      v /= total;
      out[y * TILE + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

// Octave lattices are memoised so the three octaves aren't rebuilt per pixel.
const latticeCache = new Map<string, Float32Array>();
function lattice(o: { cells: number; seed: number }): Float32Array {
  const key = `${o.cells}:${o.seed}`;
  let l = latticeCache.get(key);
  if (!l) {
    l = makeLattice(o.cells, o.seed);
    latticeCache.set(key, l);
  }
  return l;
}

// --- the alpha tile ---------------------------------------------------------

// The grayscale/alpha tooth tile (one channel of alpha, TILE×TILE), rebuilt when
// the variant changes.
let alphaTile: HTMLCanvasElement | null = null;

// Colourised tiles (op colour at the tooth alpha) and the per-target pattern
// cache. Cleared whenever the variant changes so a swept variant can't hand back
// a stale pattern.
let colorTiles = new Map<string, HTMLCanvasElement>();
let patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function buildAlphaTile(): HTMLCanvasElement {
  const field = paperHeightField(variant.grain, variant.warp);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TILE, TILE);
  const { pit, bodyThresh, toothFloor, body } = variant;
  for (let i = 0; i < field.length; i++) {
    const n = field[i];
    // Three populations (see CrayonVariant): the deepest paper valleys carve
    // permanent pits (alpha 0), the raised tooth ramps to the dense body, and the
    // band between is fill-able mid valleys that a second same-colour pass drives
    // up — the visible buildup.
    let alpha: number;
    if (n < pit) alpha = 0;
    else if (n >= bodyThresh) alpha = body;
    else alpha = toothFloor + (body - toothFloor) * ((n - pit) / (bodyThresh - pit));
    img.data[i * 4] = 0;
    img.data[i * 4 + 1] = 0;
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function ensureAlphaTile(): HTMLCanvasElement {
  if (!alphaTile) alphaTile = buildAlphaTile();
  return alphaTile;
}

// Building the fBm tooth tile is a ~100ms one-off (512² × several octaves), so
// it must never land on a draw frame. The engine warms it at mount-idle (like
// the paper texture), so the tile is ready long before a child taps the crayon
// and starts a stroke. A stroke that somehow beats the warm still builds it lazily
// (correct, just that one hitch). Cheap once the tile exists.
export function warmCrayonTextureWhenIdle(): void {
  scheduleIdle(() => ensureAlphaTile());
}

// Warm a specific colour's tooth tile off the draw path. The per-colour tile is
// a ~10ms 512² fill+mask, so building it on a colour's first stroke could drop a
// frame; the engine warms the active colour when the crayon is picked and when a
// colour is chosen, so the tile is cached before the finger reaches the canvas.
export function warmCrayonColorWhenIdle(color: string): void {
  scheduleIdle(() => colorTileFor(color));
}

// A TILE×TILE canvas of `color` masked by the tooth alpha, built once per colour.
function colorTileFor(color: string): HTMLCanvasElement {
  const cached = colorTiles.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
  // Keep the colour only where the tooth alpha is — destination-in multiplies
  // the flat colour by the tile's alpha channel.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(ensureAlphaTile(), 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  colorTiles.set(color, canvas);
  return canvas;
}

// The crayon paint for an op colour on a given target context: a repeating
// pattern of the colourised tooth tile, anchored at the paper origin (no
// transform) so it tiles in paper coordinates on every surface. Cached per
// (target, colour); the WeakMap lets dead target contexts (old baselines) be
// collected.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  let byColor = patternCache.get(target);
  if (!byColor) {
    byColor = new Map();
    patternCache.set(target, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached;
  const pattern = target.createPattern(colorTileFor(color), 'repeat');
  if (!pattern) return null;
  byColor.set(color, pattern);
  return pattern;
}

// Dev/A-B seam (mirrors setSimplifyOptions): swap the active variant at runtime
// and drop every cached tile/pattern so the next op rebuilds against it. Wired
// onto window.__engine only on /dev/engine; production keeps the tuned default.
export function setCrayonVariant(name: string): boolean {
  const next = CRAYON_VARIANTS[name];
  if (!next) return false;
  setCrayonOptions(next);
  return true;
}

export function setCrayonOptions(opts: Partial<CrayonVariant>): void {
  variant = { ...variant, ...opts };
  alphaTile = null;
  colorTiles = new Map();
  patternCache = new WeakMap();
}

export function getCrayonVariant(): CrayonVariant {
  return { ...variant };
}
