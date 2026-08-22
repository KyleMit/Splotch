// Crayon brush paint source.
//
// A wax crayon on paper is a DENSE body of pigment that only sits on the paper's
// tooth — the raised grain — while the tiny pits between the bumps stay bare. So
// a crayon stroke is not a flat fill: it's the stroke's solid colour punched
// through by a fine field of paper-tooth holes, densest down the middle of the
// stroke where the crayon presses hardest and breaking up into scattered flecks
// at the rim. This module owns that field and hands the engine a paint (a
// repeating CanvasPattern of the colour at the tooth's alpha) for every crayon
// op, one per density pass.
//
// Three properties make it read as crayon and behave like wax (see ADR-0065):
//
//   1. Contained grain. The tooth is the op's fill ALPHA, so it only ever exists
//      inside the stroke the finger drew — nothing sprays past the path.
//   2. Deterministic. The tooth field is generated once from a fixed seed (no
//      Math.random / time at render), so the commit fold and export repaint
//      identical pixels to the live stroke. Per-stroke variation is a stored
//      integer `seed` that only PHASE-SHIFTS the same field.
//   3. Wax buildup at constant hue. The body is laid down OPAQUE, so a second
//      same-colour stroke over the first is opaque-over-opaque of the identical
//      colour — the hue cannot shift or darken (no multiply). What DOES change is
//      coverage: because each stroke phase-shifts the tooth by its own seed, the
//      second stroke's holes land in different spots and fill in tooth the first
//      left bare. Redrawing gets denser and fills the grain while staying the
//      same colour, exactly like pressing a crayon over its own mark.
//
// The wax body is not one flat rgb: each texel's colour is nudged a few percent
// lighter or darker by the same paper fields (shadeShift below), so the fill
// carries the gentle waxy mottling of real crayon. Crucially this variation
// lives in the tile's RGB ONLY — the alpha stays binary, and the shift is a
// function of the paper texel alone, identical across every pass and op of a
// stroke — so overdraw rewrites each pixel with its own exact colour
// (idempotent) and property 2's live-equals-fold reproduction is untouched.
//
// Patterns are paper-anchored like the magic sheet (ADR-0043): a
// per-(context,colour,pass) repeating pattern whose tile grid is offset in paper
// coordinates by the stroke's phase, so live drawing and every fold/export
// surface tile it identically. Within one deposition pass every op shares the seed, so
// the tooth is spatially consistent across the pass's segments and reads as one
// coherent piece of wax rather than beading per-segment.
//
// A single continuous gesture is NOT one pass forever: real wax doesn't care
// whether the crayon lifted before re-covering a spot. CrayonPassTracker
// (below) watches the live polyline for the tip re-covering its own laid strip
// — a sharp reversal, or re-entering within a stroke width of paper it already
// painted — and the engine starts a new pass there by bumping to a fresh seed
// for the ops that follow. The new phase punches its pits in different paper
// spots, so scribbling back and forth in one gesture builds up live exactly
// like separate strokes do. Seeds are stored per op, so the commit fold
// reproduces it by the same mechanism as everything else.

import { scheduleIdle } from '../idle';
import { PALETTE_COLORS } from '../palette';
import type { Point } from './strokeMath';

// A density pass: stroke the op at `widthScale` of its line width, filled with
// tooth at `coverage` (fraction opaque). Passes are drawn widest-first so the
// dense narrow core lands on top of the sparse full-width rim, giving the
// crayon's centre-dense / edge-broken falloff.
export interface CrayonPass {
  widthScale: number;
  coverage: number;
}

// Tunable knobs, mutable so the dev/engine harness can A/B render variants at
// runtime (setCrayonOptions, exposed only behind PUBLIC_ENABLE_DEV_HARNESS).
// Production keeps these defaults.
export interface CrayonOptions {
  // Tile edge in paper px. The tooth field repeats every `tile` px; large enough
  // that the repeat is not legible as texture, small enough to stay cheap.
  tile: number;
  // Paper-tooth octaves: lattice cell size (px) and relative weight. Summed and
  // normalised into the height field, so a few scales together read as organic
  // paper grain instead of one-frequency digital noise.
  octaves: { cell: number; weight: number }[];
  // Half-width (in normalised height units) of the soft edge around each tooth
  // pit. The wax must be BINARY (alpha 0 or 1) for the tooth to survive undo
  // without shifting — see the idempotence note below — so this is not an alpha
  // ramp: it is the width of the deterministic ordered-dither band that turns a
  // would-be grey edge pixel into a 0/1 decision, keeping the pit rims from
  // reading as hard aliased dots while staying fold-stable.
  edge: number;
  // Subtle body-density variation: the tooth coverage swings by up to this much
  // across a slow low-frequency field, so the wax isn't a flat marker fill. This
  // biases which bumps take wax (a coverage wobble), NOT the body's alpha — the
  // body stays opaque so overlapping the same colour can't darken or shift.
  bodyVariation: number;
  // Lattice cell (px) of that body-variation field.
  bodyVariationCell: number;
  // Max fractional value shift of a wax texel's rgb toward black/white (0
  // disables, leaving a flat body colour). Driven by the paper fields via
  // shadeShift: thick deposit reads slightly darker, sparse patches slightly
  // lighter — the subtle waxy mottling of a real fill. RGB only; the alpha
  // stays binary so live-equals-fold stability is untouched.
  shadeVariation: number;
  // How strongly the ink UNDER a new deposition pass glazes through it. Each
  // pass is buffered at full opacity and stamped as a SUBTRACTIVE glaze —
  // out = crayon·(1-m + m·under) — because pigments mix by filtering light,
  // not by averaging rgb (an rgb lerp of blue over yellow goes grey; the
  // multiply glaze goes green). Virgin paper is untouched by the glaze (the
  // wax lands fully opaque and exact), and same-colour overdraw deepens only
  // a few percent, converging — never compounding into mud. Low, not zero:
  // real crayons barely mix. See crayonPassBuffer.ts.
  colorMix: number;
  // The density passes, widest first.
  passes: CrayonPass[];
}

// Tuned against photos of real wax crayon through the render+measure+judge loop
// (tools/asset-gen/.coloring-samples/crayon): a big tile with no coarse octave to
// kill visible repetition; fine multi-scale grain for organic paper tooth; a
// full-width sparse rim pass under a narrower dense core pass for the crayon's
// centre-dense / edge-broken falloff; and a slow body-density wobble for waxy
// pressure variation. `edge` is the ordered-dither band that keeps the binary
// pits from aliasing (see the binary-alpha invariant above) — narrow, so rims read as tooth flecks rather
// than a stippled haze. Single pass leaves tooth visible; a second same-colour
// pass fills the tooth it left bare (buildup) at a constant hue. Pass coverages
// deliberately start light: a first stroke reads as an airy single crayon pass
// with plenty of bare tooth, leaving headroom for redraws to visibly densify —
// the lighter the first pass, the more each same-colour overlap fills in.
// `shadeVariation` keeps the wax body from being one flat rgb — a very subtle
// per-texel value wobble (the swept-passes experiment's fill mottling, dialled
// way down because the splat pattern already varies the coverage).
export const CRAYON_DEFAULTS: CrayonOptions = {
  tile: 256,
  octaves: [
    { cell: 6, weight: 0.22 },
    { cell: 4, weight: 0.3 },
    { cell: 3, weight: 0.3 },
    { cell: 2, weight: 0.18 },
  ],
  edge: 0.045,
  bodyVariation: 0.2,
  bodyVariationCell: 110,
  shadeVariation: 0.08,
  // The mix must cross perceptual lines to register at all: blue over yellow
  // only reads GREEN once the blue channel drops BELOW the green channel
  // (0.2 and 0.35 both measured cleanly yet looked like nothing on a phone).
  // 0.55 lands blue-over-yellow at (98,162,146) and yellow-over-blue at
  // chartreuse (165,185,75). Strength is free here: the darken-mix stamp is
  // exact on same-colour overdraw (min(c,c)=c), so buildup never deepens.
  colorMix: 0.55,
  passes: [
    { widthScale: 1.0, coverage: 0.45 },
    { widthScale: 0.68, coverage: 0.63 },
  ],
};

let opts: CrayonOptions = clone(CRAYON_DEFAULTS);

function clone(o: CrayonOptions): CrayonOptions {
  return {
    ...o,
    octaves: o.octaves.map((x) => ({ ...x })),
    passes: o.passes.map((p) => ({ ...p })),
  };
}

// Deterministic PRNG (mulberry32) — a fixed constant seed, so the tooth field is
// byte-identical every run. Never Math.random.
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

const smooth = (t: number) => t * t * (3 - 2 * t);

// One octave of tileable value noise: random lattice values on an n×n grid that
// wraps at the tile edge (so the field repeats seamlessly), bilinearly
// interpolated with a smoothstep fade.
function addOctave(
  out: Float32Array,
  size: number,
  cell: number,
  weight: number,
  rand: () => number
) {
  const n = Math.max(1, Math.round(size / cell));
  const lat = new Float32Array(n * n);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * n;
    const y0 = Math.floor(fy) % n;
    const y1 = (y0 + 1) % n;
    const ty = smooth(fy - Math.floor(fy));
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * n;
      const x0 = Math.floor(fx) % n;
      const x1 = (x0 + 1) % n;
      const tx = smooth(fx - Math.floor(fx));
      const top = lat[y0 * n + x0] * (1 - tx) + lat[y0 * n + x1] * tx;
      const bot = lat[y1 * n + x0] * (1 - tx) + lat[y1 * n + x1] * tx;
      out[y * size + x] += (top * (1 - ty) + bot * ty) * weight;
    }
  }
}

function normalizeInPlace(a: Float32Array) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span;
}

// The paper-tooth height field (0..1, higher = a raised bump that takes wax), a
// slow body-density field, and a per-texel dither field. Rebuilt whenever the
// options change; a colorized tile then thresholds the height field per pass.
// `dither` is a fixed per-texel value in [0,1) that jitters the pit threshold so
// a rim texel resolves to a stippled 0/1 instead of a grey ramp — the tooth stays
// BINARY (undo-stable, see the binary-alpha invariant above) while the rims read as grain, not hard dots.
interface CrayonFields {
  tile: number;
  height: Float32Array;
  body: Float32Array;
  dither: Float32Array;
}

function buildFields(): CrayonFields {
  const size = opts.tile;
  const rand = mulberry32(0x5c1a1); // fixed — deterministic tooth every run

  const h = new Float32Array(size * size);
  const wsum = opts.octaves.reduce((s, o) => s + o.weight, 0) || 1;
  for (const o of opts.octaves) addOctave(h, size, o.cell, o.weight / wsum, rand);
  normalizeInPlace(h);

  const b = new Float32Array(size * size);
  addOctave(b, size, opts.bodyVariationCell, 1, rand);
  normalizeInPlace(b);

  const d = new Float32Array(size * size);
  const drand = mulberry32(0x0d17e); // fixed, independent of the tooth stream
  for (let i = 0; i < d.length; i++) d[i] = drand();

  return { tile: size, height: h, body: b, dither: d };
}

// Built lazily so the per-texel field passes stay off the drawing route's boot
// path: the first reader builds them, and the idle prebuild below front-loads
// that cost for the common case where the crayon does get picked.
let fields: CrayonFields | null = null;

function crayonFields(): CrayonFields {
  if (!fields) fields = buildFields();
  return fields;
}

scheduleIdle(() => crayonFields());

export function setCrayonOptions(next: Partial<CrayonOptions>) {
  cancelCrayonWarmup();
  opts = clone({ ...opts, ...next });
  fields = buildFields();
  colorTileCache.clear();
  patternCache = new WeakMap();
}

export function getCrayonOptions(): CrayonOptions {
  return clone(opts);
}

export function getCrayonPasses(): CrayonPass[] {
  return opts.passes.map((p) => ({ ...p }));
}

// Glaze strength ceiling: past this the two-blit stamp reads as paint blending,
// not wax (see the colorMix note in CRAYON_DEFAULTS).
export const MAX_CRAYON_MIX = 0.9;

// The glaze strength for a deposition pass's stamp (see CrayonOptions).
export function getCrayonMix(): number {
  return Math.min(MAX_CRAYON_MIX, Math.max(0, opts.colorMix));
}

// Non-cloning read accessors for internal hot-path callers. getCrayonPasses /
// getCrayonOptions clone (the public/test API); paintCrayon runs up to 3× per op
// on the drawing hot path and only needs these scalar reads, so it goes through
// these instead of allocating a throwaway pass array every call.
export function crayonPassCount(): number {
  return opts.passes.length;
}

export function crayonPassWidthScale(i: number): number {
  return opts.passes[i].widthScale;
}

// The RAW, unclamped colour mix — for reading the stored option (e.g. the live
// overlay's top-plane opacity), NOT the glaze strength. getCrayonMix clamps to
// [0, MAX_CRAYON_MIX]; this returns opts.colorMix verbatim.
export function crayonColorMix(): number {
  return opts.colorMix;
}

// Parse a CSS hex/rgb colour to [r,g,b]. The engine hands crayon ops a palette
// hex (#rgb / #rrggbb) or an rgb() string; anything else falls back to mid-grey
// so a bad colour can't throw on the hot path.
function parseColor(color: string): [number, number, number] {
  if (color[0] === '#') {
    let h = color.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (h.length === 6 && !Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((s) => parseInt(s, 10));
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  }
  return [128, 128, 128];
}

// Texels that survive the pit threshold cluster around this height, so the fine
// shade term is centred near zero WITHIN the wax — the mean body colour stays
// the exact crayon colour instead of skewing dark.
const SHADE_HEIGHT_MID = 0.7;
// Fine grain dominates; the slow body term stays light because it does not
// average out over stroke-sized areas — it is what makes two passes' local mean
// colour differ slightly, and past ~0.3 that patchiness stops being subtle.
const SHADE_FINE_WEIGHT = 0.7;
const SHADE_BODY_WEIGHT = 0.3;

// Signed per-texel value shift in [-amplitude, +amplitude]; positive = lighter.
// Tall tooth bumps take a thick deposit and read slightly darker; the slow body
// field lightens exactly where the tooth threshold thins the coverage, so shade and density
// mottle together like uneven crayon pressure. Pure and deterministic — a
// function of the paper texel only, never the pass or op — which is what keeps
// overdraw idempotent (see the module header). Exported for unit tests.
export function shadeShift(heightValue: number, bodyValue: number, amplitude: number): number {
  const fine = Math.max(-1, Math.min(1, (SHADE_HEIGHT_MID - heightValue) * 2));
  const slow = bodyValue * 2 - 1;
  return amplitude * (SHADE_FINE_WEIGHT * fine + SHADE_BODY_WEIGHT * slow);
}

// A colorized wax tile per (colour, pass): rgb = the crayon colour shade-shifted
// per texel (identically for every pass), alpha = the pass's tooth field. Built
// once and reused by every context's pattern.
const colorTileCache = new Map<string, HTMLCanvasElement>();
// Physical-iPad trials need warm-up work to leave headroom inside a presentation frame; a deadline
// lets slower devices generate fewer eight-row chunks instead of turning one tuned row count into a
// stall.
const CRAYON_WARM_FRAME_BUDGET_MS = 2;
const CRAYON_WARM_ROW_GRANULARITY = 8;
// Bounds resident wax-tile canvases to this many recent (colour, pass) keys — each tile is
// tile*tile RGBA, so unbounded growth (issue #167, custom colours) would leak canvas memory.
// Derived, not a flat number, so an added swatch or pass can't silently drop the fixed palette
// below the cap and make every colour change evict, rebuild a tile, and wipe patternCache: covers
// every PALETTE_COLORS swatch, +1 for the dark-mode black/white swap, at CRAYON_DEFAULTS' pass
// count.
// Exported for crayonBrush.test.ts only — no production caller needs the raw cap.
export const MAX_COLOR_TILES = (PALETTE_COLORS.length + 1) * CRAYON_DEFAULTS.passes.length;

interface ColorTileBuild {
  key: string;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
  fields: CrayonFields;
  color: [number, number, number];
  shadeVariation: number;
  coverageThreshold: number;
  bodyVariation: number;
  ditherScale: number;
}

function createColorTileBuild(color: string, passIdx: number): ColorTileBuild | null {
  const pass = opts.passes[passIdx];
  if (!pass) return null;
  const fields = crayonFields();
  const canvas = document.createElement('canvas');
  canvas.width = fields.tile;
  canvas.height = fields.tile;
  const context = canvas.getContext('2d');
  if (!context) return null;
  return {
    key: `${color}@${passIdx}`,
    canvas,
    context,
    image: context.createImageData(fields.tile, fields.tile),
    fields,
    color: parseColor(color),
    shadeVariation: Math.max(0, opts.shadeVariation),
    coverageThreshold: 1 - pass.coverage,
    bodyVariation: opts.bodyVariation,
    ditherScale: 2 * Math.max(0, opts.edge),
  };
}

function fillColorTilePixels(build: ColorTileBuild, start: number, end: number) {
  const { height, body, dither } = build.fields;
  const [r, gr, b] = build.color;
  const data = build.image.data;
  for (let i = start; i < end; i++) {
    const j = i * 4;
    const s = build.shadeVariation ? shadeShift(height[i], body[i], build.shadeVariation) : 0;
    if (s >= 0) {
      data[j] = Math.round(r + (255 - r) * s);
      data[j + 1] = Math.round(gr + (255 - gr) * s);
      data[j + 2] = Math.round(b + (255 - b) * s);
    } else {
      const k = 1 + s;
      data[j] = Math.round(r * k);
      data[j + 1] = Math.round(gr * k);
      data[j + 2] = Math.round(b * k);
    }
    const threshold = build.coverageThreshold + build.bodyVariation * (body[i] - 0.5);
    const jitter = (dither[i] - 0.5) * build.ditherScale;
    // Replaying overlapping ops with source-over is byte-idempotent only while every wax texel is
    // fully opaque or fully clear; fractional alpha would darken on every fold and undo repaint.
    data[j + 3] = height[i] + jitter >= threshold ? 255 : 0;
  }
}

function cacheColorTile(build: ColorTileBuild) {
  build.context.putImageData(build.image, 0, 0);
  colorTileCache.set(build.key, build.canvas);
  if (colorTileCache.size > MAX_COLOR_TILES) {
    const oldest = colorTileCache.keys().next().value;
    if (oldest !== undefined) colorTileCache.delete(oldest);
    // createPattern copies the source bitmap, so every context's patternCache entry for the
    // evicted key is an independent full-tile copy the WeakMap can't reach to purge — drop the
    // whole cache rather than leave it retaining every colour ever drawn (same reset
    // setCrayonOptions already does on a full option change).
    patternCache = new WeakMap();
  }
  return build.canvas;
}

function colorTile(color: string, passIdx: number): HTMLCanvasElement | null {
  const key = `${color}@${passIdx}`;
  const hit = colorTileCache.get(key);
  if (hit) {
    colorTileCache.delete(key);
    colorTileCache.set(key, hit);
    return hit;
  }
  const build = createColorTileBuild(color, passIdx);
  if (!build) return null;
  fillColorTilePixels(build, 0, build.fields.height.length);
  return cacheColorTile(build);
}

interface CrayonWarmJob {
  color: string;
  passIdx: number;
  build: ColorTileBuild | null;
  nextPixel: number;
  frameId: number | null;
}

let activeWarmJob: CrayonWarmJob | null = null;

export function cancelCrayonWarmup() {
  if (activeWarmJob?.frameId != null) {
    cancelAnimationFrame(activeWarmJob.frameId);
  }
  activeWarmJob = null;
}

function scheduleCrayonWarmFrame(job: CrayonWarmJob) {
  job.frameId = requestAnimationFrame(() => warmCrayonTileForFrame(job));
}

function warmNextCrayonPass(job: CrayonWarmJob) {
  job.passIdx++;
  job.build = null;
  job.nextPixel = 0;
  if (job.passIdx >= opts.passes.length) {
    if (activeWarmJob === job) activeWarmJob = null;
    return;
  }
  scheduleCrayonWarmFrame(job);
}

function warmCrayonTileForFrame(job: CrayonWarmJob) {
  if (activeWarmJob !== job) return;
  job.frameId = null;
  const key = `${job.color}@${job.passIdx}`;
  if (colorTileCache.has(key)) {
    warmNextCrayonPass(job);
    return;
  }
  job.build ??= createColorTileBuild(job.color, job.passIdx);
  if (!job.build) {
    activeWarmJob = null;
    return;
  }

  const deadline = performance.now() + CRAYON_WARM_FRAME_BUDGET_MS;
  do {
    const startPixel = job.nextPixel;
    job.nextPixel = Math.min(
      job.nextPixel + job.build.fields.tile * CRAYON_WARM_ROW_GRANULARITY,
      job.build.fields.height.length
    );
    fillColorTilePixels(job.build, startPixel, job.nextPixel);
  } while (job.nextPixel < job.build.fields.height.length && performance.now() < deadline);

  if (job.nextPixel < job.build.fields.height.length) {
    scheduleCrayonWarmFrame(job);
    return;
  }
  cacheColorTile(job.build);
  warmNextCrayonPass(job);
}

// Build a colour's wax tiles off the pointer hot path when the crayon is
// selected or its colour changes, so the first stroke of a new colour doesn't
// pay the per-pass tile build inside a draw. Warming starts on the next frame
// and generates each density pass in deadline-bounded row chunks because one full detached tile can
// consume the MobileSafari frame budget. A new color supersedes unfinished work for the old color;
// if a stroke lands before warming finishes, colorTile builds synchronously as the correctness path.
export function warmCrayonTiles(color: string) {
  if (activeWarmJob?.color === color) return;
  cancelCrayonWarmup();
  const job: CrayonWarmJob = {
    color,
    passIdx: 0,
    build: null,
    nextPixel: 0,
    frameId: null,
  };
  activeWarmJob = job;
  scheduleCrayonWarmFrame(job);
}

// Per-context, per-(colour,pass) repeating pattern. createPattern is bound to one
// context, so patterns are cached per target (WeakMap) then by colour+pass,
// exactly like the magic sheet's pattern cache.
// The applied phase rides with the pattern so a repeat fill can skip
// re-transforming one that has not moved.
interface PhasedPattern {
  pattern: CanvasPattern;
  px: number;
  py: number;
}
let patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, PhasedPattern>>();

// Spread a stroke's integer seed to a well-mixed sub-tile phase offset, so two
// strokes with different seeds punch their tooth pits in different paper spots
// (the source of wax buildup) while one stroke's ops all share a phase. Pure and
// deterministic (unit-tested): same seed → same phase, always.
export function seedPhase(seed: number, tileSize: number): [number, number] {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const px = h % tileSize;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  const py = h % tileSize;
  return [px, py];
}

// A live pointer-move frame calls crayonPatternFor up to passes × 3 times with
// the same (seed, tile) pair (renderCrayonOp fans one op out to buf.ctx, its
// mirror, and the paper-space buffer). seedPhase is pure, so a 1-entry cache
// keyed on both inputs skips the re-hash for every call after the first.
let lastSeedPhase: { seed: number; tileSize: number; px: number; py: number } | null = null;

function cachedSeedPhase(seed: number, tileSize: number): [number, number] {
  if (lastSeedPhase && lastSeedPhase.seed === seed && lastSeedPhase.tileSize === tileSize) {
    return [lastSeedPhase.px, lastSeedPhase.py];
  }
  const [px, py] = seedPhase(seed, tileSize);
  lastSeedPhase = { seed, tileSize, px, py };
  return [px, py];
}

// The paint for one density pass of a crayon op: the colour's wax tile as a
// repeating pattern, phase-shifted (in paper coordinates) by the stroke's seed.
// Returns null only if the tile can't be built (no DOM canvas) — caller skips.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number,
  passIdx: number
): CanvasPattern | null {
  const t = colorTile(color, passIdx);
  if (!t) return null;
  const key = `${color}@${passIdx}`;
  let byKey = patternCache.get(target);
  if (!byKey) {
    byKey = new Map();
    patternCache.set(target, byKey);
  }
  let entry = byKey.get(key) ?? null;
  if (!entry) {
    const created = target.createPattern(t, 'repeat');
    if (!created) return null;
    entry = { pattern: created, px: Number.NaN, py: Number.NaN };
    byKey.set(key, entry);
  }
  const [px, py] = cachedSeedPhase(seed, crayonFields().tile);
  // Only re-transform when the phase actually moved. The phase changes once per
  // deposition pass, while this runs on every density pass of every op of every
  // touched tile, and mutating a live CanvasPattern is not free in WebKit.
  if (entry.px !== px || entry.py !== py) {
    entry.pattern.setTransform({ e: px, f: py });
    entry.px = px;
    entry.py = py;
  }
  return entry.pattern;
}

// --- Mid-stroke pass splitting -----------------------------------------------
//
// Ported from the swept-passes experiment (PR 429), where these thresholds were
// tuned so toddler scribbles split where the crayon really re-covers its paper
// while ordinary corners and hand jitter never do. Split triggers, all relative
// to the stroke width so thick and thin crayons feel the same:
//  • direction is measured between anchors at least DIR_STEP apart, so pixel
//    jitter while holding still can neither split nor rotate the direction;
//  • a turn sharper than SPLIT_TURN_COS is a reversal — the tip is heading
//    back over wax it just laid, so the pass splits immediately;
//  • re-entry: the tip landing within PROXIMITY_FRACTION of the width of a
//    point laid at least EXCLUDE_ARC_FRACTION widths of arc ago means the path
//    looped or hairpinned back onto its own strip without a sharp corner.
//    The trailing arc is excluded because the tip is always near the strip it
//    just painted.
const SPLIT_TURN_COS = Math.cos((100 * Math.PI) / 180);
const DIR_STEP_FRACTION = 0.35;
const PROXIMITY_FRACTION = 0.45;
const EXCLUDE_ARC_FRACTION = 2.5;
const ANCHOR_SPACING_FRACTION = 0.25;

export type CrayonPoint = Point;

// Decides where a crayon gesture's polyline must start a new deposition pass
// (here: a fresh seed phase, so the new pass fills tooth the current one left
// bare). Pure geometry — one instance per pass, fed points in order; on
// 'split' the caller bumps the seed and re-seeds a tracker at the previous
// point. Anchor state resets per pass (a fresh tracker is constructed on
// split), so the re-entry scan is bounded by pass length, not stroke length —
// it grows unboundedly within one very long never-splitting pass (O(n^2)
// over that pass), which is cheap at today's anchor spacing and stroke
// lengths.
export class CrayonPassTracker {
  private readonly dirStep: number;
  private readonly proximity: number;
  private readonly excludeArc: number;
  private readonly anchorSpacing: number;

  private anchors: { x: number; y: number; arc: number }[] = [];
  private arc = 0;
  private lastX: number;
  private lastY: number;
  private dirX = 0;
  private dirY = 0;
  private hasDir = false;
  private dirOriginX: number;
  private dirOriginY: number;

  constructor(startX: number, startY: number, lineWidth: number) {
    this.dirStep = Math.max(3, lineWidth * DIR_STEP_FRACTION);
    this.proximity = Math.max(2, lineWidth * PROXIMITY_FRACTION);
    this.excludeArc = Math.max(this.dirStep * 3, lineWidth * EXCLUDE_ARC_FRACTION);
    this.anchorSpacing = Math.max(2, lineWidth * ANCHOR_SPACING_FRACTION);
    this.lastX = startX;
    this.lastY = startY;
    this.dirOriginX = startX;
    this.dirOriginY = startY;
    this.anchors.push({ x: startX, y: startY, arc: 0 });
  }

  // Advance the tip to p. Returns 'split' when a new pass must start at the
  // PREVIOUS point (the caller re-seeds a tracker there for the new pass);
  // 'extend' otherwise, with p consumed.
  advance(p: CrayonPoint): 'extend' | 'split' {
    if (this.reversalAt(p) || this.reentryAt(p)) return 'split';
    this.consume(p);
    return 'extend';
  }

  private reversalAt(p: CrayonPoint): boolean {
    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len < this.dirStep) return false;
    if (!this.hasDir) return false;
    const dot = (dx / len) * this.dirX + (dy / len) * this.dirY;
    return dot < SPLIT_TURN_COS;
  }

  private reentryAt(p: CrayonPoint): boolean {
    const stepArc = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    const tipArc = this.arc + stepArc;
    for (const a of this.anchors) {
      if (tipArc - a.arc <= this.excludeArc) break;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (dx * dx + dy * dy <= this.proximity * this.proximity) return true;
    }
    return false;
  }

  private consume(p: CrayonPoint) {
    this.arc += Math.hypot(p.x - this.lastX, p.y - this.lastY);
    this.lastX = p.x;
    this.lastY = p.y;

    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len >= this.dirStep) {
      this.dirX = dx / len;
      this.dirY = dy / len;
      this.hasDir = true;
      this.dirOriginX = p.x;
      this.dirOriginY = p.y;
    }

    const lastAnchor = this.anchors[this.anchors.length - 1];
    const ax = p.x - lastAnchor.x;
    const ay = p.y - lastAnchor.y;
    if (ax * ax + ay * ay >= this.anchorSpacing * this.anchorSpacing) {
      this.anchors.push({ x: p.x, y: p.y, arc: this.arc });
    }
  }
}
