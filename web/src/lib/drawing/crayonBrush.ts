// The crayon brush's paint source.
//
// A crayon is wax dragged across a toothed sheet of paper: the wax sits densely
// on the raised fibres (the "tooth" peaks) and skips the valleys, so a single
// pass reads as a dense-but-broken waxy body with the paper grain showing
// through — not a flat marker fill. Pressing a second stroke over the first
// pushes wax into more of the valleys: the coverage grows and the grain fills
// in, but the colour never darkens (it's the same opaque wax landing in gaps,
// not translucent layers stacking).
//
// This module reproduces that with a single, deterministic, replay-safe seam
// that slots into strokeOps' `paint` argument exactly like the magic brush's
// sheet pattern:
//
//   1. A fixed procedural "tooth" field U(x,y) — mulberry32-seeded value noise
//      (fBm), histogram-equalised to a uniform [0,1] so the coverage fraction is
//      a directly tunable knob (θ = 1 − coverage). Baked once at the app's paper
//      resolution and tiled in PAPER space, so the same paper coordinate always
//      samples the same tooth — the grain stays pinned to the page the way real
//      paper tooth does, and it lines up across every surface that replays ops
//      (visible canvas, undo baseline, keyframes, export).
//
//   2. Opaque colour laid down only where U + Jₖ > θ. Because every deposited
//      texel is FULLY opaque with the stroke's own colour, overlapping deposits
//      are idempotent (opaque-over-opaque = the same colour) — so a stroke never
//      darkens or muddies existing crayon of the same colour, self-overlap
//      within one stroke can't bead, and the commit-time simplified rebuild
//      (ADR-0036) lands the same pixels as the live stroke. Valleys stay
//      transparent, so the warm paper shows through as fine tooth.
//
//   3. Buildup: Jₖ is one of a small pool of COHERENT per-stroke jitter fields.
//      θ is constant (every stroke covers the same ~fraction, so single strokes
//      look consistent), but each stroke's Jₖ nudges which near-threshold valleys
//      fall inside the mask. Tooth peaks (high U) are always covered → the colour
//      is stable pass to pass; deep valleys (low U) stay open; the mid-band
//      valleys toggle per stroke, so successive passes UNION into progressively
//      more coverage — wax filling the grain — live and gradual as the second
//      stroke is drawn, converging toward solid without ever shifting hue.
//
// Determinism (criterion: same drawing → same pixels): the fields are seeded
// once, never Math.random/time at render. The only per-stroke variation is the
// grain index, which is stored on the op (engine stamps it at stroke start) and
// read back verbatim on replay — no destination sampling, so undo/resize/export
// reproduce a crayon stroke exactly.

// --- Tunables (dev-selectable variant knobs) -------------------------------
//
// Mutable so the /dev/engine harness can A/B variants at runtime
// (setCrayonParams, exposed only behind PUBLIC_ENABLE_DEV_HARNESS); production
// keeps the tuned defaults below. Changing any of them rebuilds the fields and
// drops the tile/pattern caches (resetCrayonCaches).
export interface CrayonParams {
  /** PRNG seed for the tooth + jitter fields. */
  seed: number;
  /** Tile edge in paper px. Larger = less visible repetition, more memory. */
  tile: number;
  /** Base tooth cell size in paper px (lower = finer/higher-frequency grain). */
  toothCell: number;
  /** fBm octaves and falloff for the tooth field. */
  octaves: number;
  persistence: number;
  /** Fraction of a single pass that lands wax (0..1). θ = 1 − coverage. */
  coverage: number;
  /** Smoothstep half-width around θ (in coverage units): the softness of each
   *  grain island's edge. Small = crisp/near-binary tooth; large = softer. */
  edge: number;
  /** How many coherent jitter fields feed buildup (more = finer progression). */
  jitterFields: number;
  /** Jitter cell size in paper px (coarser than the tooth so buildup stays
   *  coherent — fills regions of valleys, not speckle). */
  jitterCell: number;
  /** Jitter amplitude in coverage units: how much of the valley band each pass
   *  can newly reach. Larger = faster buildup, but more grain "swim". */
  jitterAmp: number;
  /** Subtle per-texel luminance variation baked into the opaque colour (waxy
   *  sheen). Kept small so it never reads as a hue shift. 0 disables it. */
  sheen: number;
}

// Tuned against generated real-crayon references through the render/judge loop
// (see docs/adrs and the PR notes): a fine-but-coherent tooth (2-octave value
// noise, ~3.5px base cell) reads as paper grain rather than digital speckle;
// coverage 0.70 with soft island edges (0.19) gives a dense, waxy single pass;
// and a strong coherent jitter (amp 0.6 across 6 fields) makes a second same-
// colour pass visibly fill the grain toward solid without shifting hue.
export const CRAYON_DEFAULTS: CrayonParams = {
  seed: 0x5f1074,
  tile: 256,
  toothCell: 3,
  octaves: 2,
  persistence: 0.5,
  coverage: 0.7,
  edge: 0.16,
  jitterFields: 6,
  jitterCell: 16,
  jitterAmp: 0.6,
  sheen: 0.08,
};

let params: CrayonParams = { ...CRAYON_DEFAULTS };

// --- Seeded value noise -----------------------------------------------------

// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Deterministic per
// seed, so the whole texture is reproducible from `params.seed` alone.
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

function smootherstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// One octave of value noise: a random lattice at `cell` spacing, bilinearly
// interpolated with a smootherstep fade, sampled toroidally so the tile repeats
// seamlessly (sample x+size == sample x).
function valueNoiseOctave(size: number, cell: number, rand: () => number): Float32Array {
  const cells = Math.max(1, Math.round(size / cell));
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (cx: number, cy: number) => lattice[(cy % cells) * cells + (cx % cells)];
  const out = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const gy = y * scale;
    const y0 = Math.floor(gy);
    const fy = smootherstep(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = x * scale;
      const x0 = Math.floor(gx);
      const fx = smootherstep(gx - x0);
      const v00 = at(x0, y0);
      const v10 = at(x0 + 1, y0);
      const v01 = at(x0, y0 + 1);
      const v11 = at(x0 + 1, y0 + 1);
      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      out[y * size + x] = top + (bottom - top) * fy;
    }
  }
  return out;
}

// fBm: sum octaves at rising frequency and falling amplitude for fine tooth
// detail over a coarse structure.
function fbm(
  size: number,
  baseCell: number,
  octaves: number,
  persistence: number,
  rand: () => number
): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let cell = baseCell * Math.pow(2, Math.max(0, octaves - 1));
  for (let o = 0; o < octaves; o++) {
    const octave = valueNoiseOctave(size, Math.max(1, cell), rand);
    for (let i = 0; i < out.length; i++) out[i] += octave[i] * amp;
    amp *= persistence;
    cell /= 2;
  }
  return out;
}

// Histogram-equalise a field to a uniform [0,1]. Makes coverage exact: with a
// uniform field, P(U > θ) = 1 − θ, so `coverage` maps straight to θ. Uses a
// 256-bin CDF (O(n)) rather than a full rank sort (O(n log n)) so baking the
// fields never spikes a drawing frame — 256 levels is ample for tooth.
function uniformize(field: Float32Array): Float32Array {
  const n = field.length;
  const BINS = 256;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = field[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const hist = new Float64Array(BINS);
  for (let i = 0; i < n; i++) {
    const bin = Math.min(BINS - 1, Math.floor(((field[i] - min) / span) * BINS));
    hist[bin]++;
  }
  // CDF at each bin's centre, normalised to [0,1].
  const cdf = new Float64Array(BINS);
  let acc = 0;
  for (let b = 0; b < BINS; b++) {
    cdf[b] = (acc + hist[b] / 2) / n;
    acc += hist[b];
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const bin = Math.min(BINS - 1, Math.floor(((field[i] - min) / span) * BINS));
    out[i] = cdf[bin];
  }
  return out;
}

// --- Baked fields -----------------------------------------------------------

let tooth: Float32Array | null = null; // uniformised U(x,y), row-major `tile`²
let jitter: Float32Array[] = []; // coherent per-stroke offset fields, centred ~0
let fieldsSeed = -1;

function ensureFields() {
  if (tooth && fieldsSeed === params.seed && tooth.length === params.tile * params.tile) return;
  const size = params.tile;
  const rand = mulberry32(params.seed);
  tooth = uniformize(fbm(size, params.toothCell, params.octaves, params.persistence, rand));
  jitter = [];
  for (let k = 0; k < params.jitterFields; k++) {
    // A coherent field, uniformised then centred on 0 so it shifts the tooth
    // both ways. Each draws from the shared PRNG stream, so the k fields differ.
    const u = uniformize(valueNoiseOctave(size, params.jitterCell, rand));
    const centred = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++) centred[i] = u[i] - 0.5;
    jitter.push(centred);
  }
  fieldsSeed = params.seed;
}

// --- Colour tiles + per-context patterns ------------------------------------

// Cache the composited colour tiles (one per colour × jitter index) and, per
// target context, the CanvasPattern wrapping each — patterns are context-bound,
// so replay onto the baseline/keyframe/export surfaces builds its own.
const tileCache = new Map<string, HTMLCanvasElement>();
// Per target context: the patterns it has built, tagged with the cache epoch
// they were built in. A pattern captures the tile canvas it wrapped, so when the
// tiles are rebuilt (a param change) every pattern is stale — bumping the epoch
// invalidates all of them lazily, per target, on next use (a WeakMap can't be
// cleared, and the stale entry for an untouched target must not be reused).
const patternCache = new WeakMap<
  CanvasRenderingContext2D,
  { epoch: number; map: Map<string, CanvasPattern> }
>();
const TILE_CACHE_MAX = 64;
let cacheEpoch = 0;

function resetCrayonCaches() {
  tileCache.clear();
  cacheEpoch++;
}

function parseColor(color: string): [number, number, number] {
  let hex = color.trim();
  if (hex[0] === '#') hex = hex.slice(1);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const int = parseInt(hex, 16);
  if (Number.isNaN(int) || hex.length !== 6) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// Build the opaque colour tile for (colour, jitter index): full-alpha colour
// where U + Jₖ clears θ (softened by `edge`), transparent below it.
function buildTile(color: string, jIndex: number): HTMLCanvasElement {
  ensureFields();
  const size = params.tile;
  const U = tooth!;
  const J = jitter[jIndex % jitter.length];
  const [r, g, b] = parseColor(color);
  const theta = 1 - params.coverage;
  const w = Math.max(1e-3, params.edge);
  const amp = params.jitterAmp;
  const sheen = params.sheen;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < U.length; i++) {
    const h = U[i] + J[i] * amp;
    // smoothstep(theta - w, theta + w, h) — coverage alpha.
    const a = smootherstep((h - (theta - w)) / (2 * w));
    const o = i * 4;
    if (a <= 0) {
      data[o + 3] = 0;
      continue;
    }
    // Subtle waxy sheen: lift/drop luminance a touch by local tooth height,
    // kept small so hue is untouched. Full alpha keeps overlap idempotent.
    const s = sheen > 0 ? 1 + (U[i] - 0.5) * 2 * sheen : 1;
    data[o] = Math.max(0, Math.min(255, Math.round(r * s)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(g * s)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(b * s)));
    data[o + 3] = a >= 1 ? 255 : Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function tileFor(color: string, jIndex: number): HTMLCanvasElement {
  const key = `${color}|${jIndex}`;
  let tile = tileCache.get(key);
  if (tile) return tile;
  tile = buildTile(color, jIndex);
  if (tileCache.size >= TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  tileCache.set(key, tile);
  return tile;
}

// Map a stored grain value (0..1, stamped on the op) to a jitter index.
function jitterIndexFor(grain: number): number {
  const n = Math.max(1, params.jitterFields);
  const idx = Math.floor(grain * n);
  return idx < 0 ? 0 : idx >= n ? n - 1 : idx;
}

// The crayon paint for one op on one target context: a `repeat` pattern of the
// (colour, grain) tile, tiled in paper coordinates. Deterministic — same op,
// same pixels, on every surface.
export function crayonPaintFor(
  target: CanvasRenderingContext2D,
  color: string,
  grain: number
): CanvasPattern | null {
  const jIndex = jitterIndexFor(grain);
  const key = `${color}|${jIndex}`;
  let entry = patternCache.get(target);
  if (!entry || entry.epoch !== cacheEpoch) {
    entry = { epoch: cacheEpoch, map: new Map() };
    patternCache.set(target, entry);
  }
  const cached = entry.map.get(key);
  if (cached) return cached;
  const pattern = target.createPattern(tileFor(color, jIndex), 'repeat');
  if (!pattern) return null;
  entry.map.set(key, pattern);
  return pattern;
}

// --- Per-stroke grain -------------------------------------------------------

// Each new crayon stroke gets the next grain bucket, so consecutive passes use
// different jitter fields and visibly build up where they overlap. Cycling
// through the buckets (rather than random) keeps a two-pass overlap guaranteed
// to differ — the behaviour the buildup test pins — while still deriving purely
// from stored op data at render time.
let strokeCounter = 0;

export function nextCrayonGrain(): number {
  const n = Math.max(1, params.jitterFields);
  const bucket = strokeCounter % n;
  strokeCounter = (strokeCounter + 1) % (n * 1024);
  return (bucket + 0.5) / n;
}

// Bake the tooth + jitter fields ahead of the first stroke. Called when the
// crayon is selected (a tap, not the draw hot path) so the one-time field build
// never lands on a drawing frame. Idempotent — a no-op once the fields exist.
export function warmCrayonFields(): void {
  ensureFields();
}

// --- Dev seam ---------------------------------------------------------------

export function setCrayonParams(partial: Partial<CrayonParams>): void {
  params = { ...params, ...partial };
  tooth = null;
  fieldsSeed = -1;
  resetCrayonCaches();
}

export function getCrayonParams(): CrayonParams {
  return { ...params };
}
