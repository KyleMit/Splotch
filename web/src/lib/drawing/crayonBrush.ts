// Crayon brush render source (the free-draw default).
//
// A wax crayon reads as dense pigment that catches on the high points of the
// paper's tooth and skips the valleys, so a single pass is broken and textured,
// and a second pass of the SAME colour fills the valleys the first one missed —
// it gets denser and more solid without changing hue. Both behaviours fall out
// of one primitive: each crayon op is stroked with a paper-anchored,
// colour-tinted tooth PATTERN whose per-pixel ALPHA is the wax deposit (high on
// tooth peaks, low but non-zero in the valleys).
//
//   * Look — a single stroke is opaque on the peaks and faint in the valleys, so
//     it reads waxy and broken rather than a flat fill, and the grain is
//     contained to the stroke shape (only the shape is painted; the tooth just
//     modulates its alpha).
//   * Buildup — because the deposit is semi-transparent and the tooth is
//     POSITIONAL (a property of the paper, not the stroke), painting the same
//     colour again composites source-over onto the earlier pass IN REGISTER: the
//     shared pixels climb toward the solid crayon colour (1-(1-a)^n), so the
//     valleys fill in and the body densifies while the hue is invariant. That is
//     wax buildup, and it is the opposite of `multiply`, which would darken the
//     overlap past the colour toward black. It is also live and gradual — every
//     per-frame op composites as the finger moves, so the fill-in happens during
//     the second stroke, never as a post-stroke snap.
//
// The pattern tiles a small tooth tile from paper (0,0), so every surface that
// renders ops in paper-pixel space — the visible canvas, the undo baseline,
// keyframes, and the export snapshot — samples the identical tooth phase, and
// replay stays bit-identical (ADR-0033) the same way the magic sheet does. The
// tooth field is generated once from a fixed seed with no Math.random or time on
// the render path, so the only thing that varies a drawing's pixels is its
// stored stroke geometry and colour (ADR-0007 determinism).

// A crayon look: the tooth-tile geometry plus the wax-deposit curve. Exposed as
// named variants so the render can be A/B'd against alternatives (and a flat
// baseline) from the dev harness without shipping a build — `setCrayonVariant`.
export interface CrayonVariant {
  name: string;
  // Repeat-tile side in paper px. The grain wraps at this period; large enough
  // that the tiling never reads as a pattern at drawing scale.
  tile: number;
  // Base tooth feature size in px (the finest octave's cell). Smaller = finer
  // tooth. Kept a few px so the grain is organic, not single-pixel grit.
  grain: number;
  // fbm octaves layered for a natural, non-repetitive tooth.
  octaves: number;
  // Amplitude multiplier between octaves (default 0.5). Higher keeps the fine
  // octaves strong, so the tooth is a crisp high-frequency speckle (reads as
  // crayon grain at normal scale) rather than a smooth low-frequency cloud.
  persistence?: number;
  // Contrast applied to the normalised tooth around its midpoint (default 1 =
  // none). >1 sharpens peaks/valleys so individual grains stay distinct when the
  // stroke is viewed small; too high reads as harsh digital grit.
  contrast?: number;
  // Wax-deposit alpha mapped from tooth height t in [0,1]:
  //   deposit = floor + (ceil - floor) * t^gamma
  // `floor` is the valley deposit (must be > 0 so valleys keep filling on later
  // passes), `ceil` the peak deposit (near 1 so a firm pass reaches the colour),
  // `gamma` > 1 pushes more area into the valleys → more visible tooth.
  floor: number;
  ceil: number;
  gamma: number;
  // Skip the tooth entirely and lay down solid colour — the A/B baseline that
  // reproduces the pre-crayon flat marker.
  flat?: boolean;
}

export const CRAYON_VARIANTS: Record<string, CrayonVariant> = {
  // The shipped default (chosen by eye against real-crayon references, then
  // regression-checked by the vision judge). The tooth is a crisp
  // medium-frequency speckle — high persistence keeps the fine octaves strong and
  // a contrast curve keeps individual grains distinct at normal viewing scale, so
  // it reads as waxy crayon (not a smooth airbrush cloud, not sub-pixel grit).
  // Firm-but-broken peaks; valleys light enough to read as texture on pass one
  // yet dark enough to keep filling on later passes.
  wax: {
    name: 'wax',
    tile: 504,
    grain: 7,
    octaves: 4,
    persistence: 0.72,
    contrast: 2.0,
    floor: 0.08,
    ceil: 0.95,
    gamma: 1.6,
  },
  // Coarser, hungrier tooth — more paper shows through a single pass (a lighter,
  // scratchier crayon).
  coarse: {
    name: 'coarse',
    tile: 520,
    grain: 10,
    octaves: 4,
    persistence: 0.7,
    contrast: 1.9,
    floor: 0.05,
    ceil: 0.92,
    gamma: 1.9,
  },
  // Denser and finer — closer to a soft pencil / oil pastel.
  fine: {
    name: 'fine',
    tile: 480,
    grain: 5,
    octaves: 5,
    persistence: 0.68,
    contrast: 1.9,
    floor: 0.14,
    ceil: 1.0,
    gamma: 1.4,
  },
  // Flat solid colour — the marker Splotch shipped before, for side-by-side A/B.
  flat: { name: 'flat', tile: 1, grain: 1, octaves: 1, floor: 1, ceil: 1, gamma: 1, flat: true },
};

const DEFAULT_VARIANT = 'wax';
let activeVariant: CrayonVariant = CRAYON_VARIANTS[DEFAULT_VARIANT];

// Fixed seed so the tooth is identical across sessions, devices, and replays.
const TOOTH_SEED = 0x5c1a7c4;

// --- Deterministic periodic tooth field (pure, unit-tested) ------------------

// Integer hash → [0,1). Cheap, seed-mixed, good enough for a value-noise lattice.
function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

// Positive modulo so the lattice wraps cleanly for a seamless repeat tile.
function pmod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// One octave of periodic value noise: bilinear-interpolated lattice values,
// wrapped at `period` cells so the tile repeats without a seam.
function valueNoise(x: number, y: number, cell: number, period: number, seed: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const x0p = pmod(x0, period);
  const y0p = pmod(y0, period);
  const x1p = pmod(x0 + 1, period);
  const y1p = pmod(y0 + 1, period);
  const v00 = hash2(x0p, y0p, seed);
  const v10 = hash2(x1p, y0p, seed);
  const v01 = hash2(x0p, y1p, seed);
  const v11 = hash2(x1p, y1p, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

// Fractional Brownian motion: octaves of periodic value noise at doubling
// frequency and halving amplitude, normalised to [0,1]. Periodic because each
// octave doubles both its frequency and its wrap period. `tile` and `grain` come
// from the variant; the return is the raw tooth height at (x,y).
export function toothHeight(x: number, y: number, variant: CrayonVariant): number {
  // Derive the cell size from an INTEGER lattice period so cell * period is
  // exactly the tile every octave — otherwise the tile image and the noise
  // period disagree by a rounding remainder and the repeat shows a seam.
  let period = Math.max(1, Math.round(variant.tile / variant.grain));
  const persistence = variant.persistence ?? 0.5;
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < variant.octaves; o++) {
    const cell = variant.tile / period;
    sum += amp * valueNoise(x, y, cell, period, TOOTH_SEED + o);
    norm += amp;
    amp *= persistence;
    period *= 2;
  }
  const t = sum / norm;
  const contrast = variant.contrast ?? 1;
  if (contrast === 1) return t;
  return Math.min(1, Math.max(0, 0.5 + (t - 0.5) * contrast));
}

// Map a tooth height to a wax-deposit alpha in [0,1] via the variant's curve.
export function depositAlpha(toothT: number, variant: CrayonVariant): number {
  const shaped = Math.pow(Math.min(1, Math.max(0, toothT)), variant.gamma);
  return variant.floor + (variant.ceil - variant.floor) * shaped;
}

// --- Tooth tile + tinted-pattern cache (canvas) ------------------------------

// The tooth tile: an RGBA canvas whose ALPHA channel is the deposit and whose
// RGB is unused (a later destination-in composite keeps only the alpha). Built
// once per variant, lazily.
let toothTile: HTMLCanvasElement | null = null;
let toothTileVariant: string | null = null;

// Per-colour tinted tiles (solid colour masked by the tooth alpha) and, keyed by
// target context, the repeat pattern of each. Both are cleared when the variant
// changes; a WeakMap can't be enumerated to clear, so it's replaced.
const tintedTiles = new Map<string, HTMLCanvasElement>();
let patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();
const MAX_TINTED_COLORS = 16;

function buildToothTile(variant: CrayonVariant): HTMLCanvasElement {
  const side = variant.tile;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(side, side);
  const data = img.data;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const a = depositAlpha(toothHeight(x, y, variant), variant);
      const i = (y * side + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function ensureToothTile(): HTMLCanvasElement {
  if (!toothTile || toothTileVariant !== activeVariant.name) {
    toothTile = buildToothTile(activeVariant);
    toothTileVariant = activeVariant.name;
  }
  return toothTile;
}

// Build the active variant's tooth tile ahead of the first stroke so its
// one-time fbm cost (~a few ms) doesn't land on the first draw frame. Cheap to
// call (a no-op once built); the engine schedules it at idle on init.
export function warmCrayonTooth(): void {
  ensureToothTile();
}

// A tile of solid `color` carrying the tooth's alpha: fill opaque colour, then
// destination-in the tooth so only the tooth's alpha survives. Cached per colour.
function tintedTileFor(color: string): HTMLCanvasElement {
  const cached = tintedTiles.get(color);
  if (cached) return cached;
  const tooth = ensureToothTile();
  const tile = document.createElement('canvas');
  tile.width = tooth.width;
  tile.height = tooth.height;
  const ctx = tile.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, tile.width, tile.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tooth, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (tintedTiles.size >= MAX_TINTED_COLORS) {
    // Cheap bound: drop everything and let it rebuild lazily. The tooth is
    // identical, so any pattern still held by a context stays pixel-correct.
    tintedTiles.clear();
    patternCache = new WeakMap();
  }
  tintedTiles.set(color, tile);
  return tile;
}

// The repeat pattern of `color`'s tinted tooth, for a target context. Returns
// null when the active variant is flat, which tells the renderer to lay down
// solid colour instead (the A/B baseline). The pattern tiles from paper (0,0) in
// the target's user space; because every replay surface renders ops in the same
// paper-pixel space, the phase matches and replay is bit-identical.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  if (activeVariant.flat) return null;
  let perCtx = patternCache.get(target);
  if (!perCtx) {
    perCtx = new Map();
    patternCache.set(target, perCtx);
  }
  const cached = perCtx.get(color);
  if (cached) return cached;
  const pattern = target.createPattern(tintedTileFor(color), 'repeat');
  if (!pattern) return null;
  perCtx.set(color, pattern);
  return pattern;
}

// Switch the crayon look. Clears every cache so the next op rebuilds against the
// new tooth. Unknown names are ignored (keeps the current variant).
export function setCrayonVariant(name: string): void {
  const variant = CRAYON_VARIANTS[name];
  if (!variant || variant.name === activeVariant.name) return;
  activeVariant = variant;
  toothTile = null;
  toothTileVariant = null;
  tintedTiles.clear();
  patternCache = new WeakMap();
}

export function activeCrayonVariant(): CrayonVariant {
  return activeVariant;
}

// Dev tuning seam (mirrors setSimplifyParams): merge partial overrides onto the
// current variant and make the result active, so the tooth/curve can be swept
// live from the harness without a rebuild. Always resets the caches.
export function setCrayonParams(partial: Partial<CrayonVariant>): void {
  activeVariant = { ...activeVariant, ...partial, name: partial.name ?? 'custom' };
  toothTile = null;
  toothTileVariant = null;
  tintedTiles.clear();
  patternCache = new WeakMap();
}
