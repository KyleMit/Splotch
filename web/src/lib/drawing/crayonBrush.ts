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
//      Math.random / time at render), so undo/resize/export replay identical
//      pixels. Per-stroke variation is a stored integer `seed` that only
//      PHASE-SHIFTS the same field — still fully replayable.
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
// (idempotent) and property 2's op-count-independent replay is untouched.
//
// Patterns are paper-anchored like the magic sheet (ADR-0043): a
// per-(context,colour,pass) repeating pattern whose tile grid is offset in paper
// coordinates by the stroke's phase, so live drawing and every replay surface
// tile it identically. Within one deposition pass every op shares the seed, so
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
// like separate strokes do. Seeds are stored per op, so this is replay-safe by
// the same mechanism as everything else.

import { scheduleIdle } from '../idle';

// A density pass: stroke the op at `widthScale` of its line width, filled with
// tooth at `coverage` (fraction opaque). Passes are drawn widest-first so the
// dense narrow core lands on top of the sparse full-width rim, giving the
// crayon's centre-dense / edge-broken falloff.
export interface CrayonPass {
  widthScale: number;
  coverage: number;
}

// Tunable knobs, mutable so the dev/engine harness can A/B render variants at
// runtime (setCrayonOptions, exposed only behind PUBLIC_ENABLE_DEV_HARNESS —
// mirrors commandSimplify's setSimplifyOptions). Production keeps these defaults.
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
  // reading as hard aliased dots while staying replay-stable.
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
  // stays binary so undo/replay stability is untouched.
  shadeVariation: number;
  // How strongly the ink UNDER a new deposition pass glazes through it. Each
  // pass is buffered at full opacity and stamped as a SUBTRACTIVE glaze —
  // out = crayon·(1-m + m·under) — because pigments mix by filtering light,
  // not by averaging rgb (an rgb lerp of blue over yellow goes grey; the
  // multiply glaze goes green). Virgin paper is untouched by the glaze (the
  // wax lands fully opaque and exact), and same-colour overdraw deepens only
  // a few percent, converging — never compounding into mud. Low, not zero:
  // real crayons barely mix. See strokeOps' pass buffer.
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
// pits from aliasing (see waxAlpha) — narrow, so rims read as tooth flecks rather
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
  colorMix: 0.2,
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
// BINARY (undo-stable, see waxAlpha) while the rims read as grain, not hard dots.
let tile = 0;
let height: Float32Array | null = null;
let body: Float32Array | null = null;
let dither: Float32Array | null = null;

function buildFields() {
  tile = opts.tile;
  const size = tile;
  const rand = mulberry32(0x5c1a1); // fixed — deterministic tooth every run

  const h = new Float32Array(size * size);
  const wsum = opts.octaves.reduce((s, o) => s + o.weight, 0) || 1;
  for (const o of opts.octaves) addOctave(h, size, o.cell, o.weight / wsum, rand);
  normalizeInPlace(h);
  height = h;

  const b = new Float32Array(size * size);
  addOctave(b, size, opts.bodyVariationCell, 1, rand);
  normalizeInPlace(b);
  body = b;

  const d = new Float32Array(size * size);
  const drand = mulberry32(0x0d17e); // fixed, independent of the tooth stream
  for (let i = 0; i < d.length; i++) d[i] = drand();
  dither = d;
}

buildFields();

export function setCrayonOptions(next: Partial<CrayonOptions>) {
  opts = clone({ ...opts, ...next } as CrayonOptions);
  buildFields();
  colorTileCache.clear();
  patternCache = new WeakMap();
}

export function getCrayonOptions(): CrayonOptions {
  return clone(opts);
}

export function getCrayonPasses(): CrayonPass[] {
  return opts.passes.map((p) => ({ ...p }));
}

// The glaze strength for a deposition pass's stamp (see CrayonOptions).
export function getCrayonMix(): number {
  return Math.min(0.9, Math.max(0, opts.colorMix));
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

// Binary wax opacity (0 or 1) at texel i for a pass covering `coverage` of the
// area. The tooth MUST be binary: a crayon op is stroked live as dozens of
// overlapping per-frame ops but replayed (undo/resize/export) as a few simplified
// ones, and source-over only reproduces the same pixels under a different op
// count when every alpha is 0 or 1 (fractional alpha accumulates on overlap, so a
// soft tooth shifts the moment the drawing is rebuilt). So: bias the pit
// threshold slowly by the body field (a coverage wobble, not an alpha dip, so the
// body stays opaque and same-colour overlap can't darken), jitter it per-texel by
// the dither field within an `edge`-wide band so rims stipple instead of aliasing,
// then hard-decide bump (1) vs pit (0).
function waxAlpha(i: number, coverage: number): number {
  const h = height![i];
  const t = 1 - coverage + opts.bodyVariation * (body![i] - 0.5);
  const jitter = (dither![i] - 0.5) * 2 * Math.max(0, opts.edge);
  return h + jitter >= t ? 1 : 0;
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
// field lightens exactly where waxAlpha thins the coverage, so shade and density
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

function colorTile(color: string, passIdx: number): HTMLCanvasElement | null {
  const key = `${color}@${passIdx}`;
  const hit = colorTileCache.get(key);
  if (hit) return hit;
  if (!height) return null;
  const pass = opts.passes[passIdx];
  if (!pass) return null;
  const c = document.createElement('canvas');
  c.width = tile;
  c.height = tile;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(tile, tile);
  const [r, gr, b] = parseColor(color);
  const data = img.data;
  const amp = Math.max(0, opts.shadeVariation);
  for (let i = 0; i < height.length; i++) {
    const j = i * 4;
    const s = amp ? shadeShift(height[i], body![i], amp) : 0;
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
    data[j + 3] = Math.round(waxAlpha(i, pass.coverage) * 255);
  }
  g.putImageData(img, 0, 0);
  colorTileCache.set(key, c);
  return c;
}

// Build a colour's wax tiles off the pointer hot path — scheduled when the
// crayon is selected or its colour changes, so the first stroke of a new colour
// doesn't pay the per-pass tile build (a few ms under CPU throttle) inside a
// draw. If a stroke lands before idle fires, colorTile builds synchronously —
// a one-time cost, never repeated.
export function warmCrayonTiles(color: string) {
  scheduleIdle(() => {
    for (let i = 0; i < opts.passes.length; i++) colorTile(color, i);
  });
}

// Per-context, per-(colour,pass) repeating pattern. createPattern is bound to one
// context, so patterns are cached per target (WeakMap) then by colour+pass,
// exactly like the magic sheet's pattern cache.
let patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

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
  let pattern = byKey.get(key) ?? null;
  if (!pattern) {
    pattern = target.createPattern(t, 'repeat');
    if (!pattern) return null;
    byKey.set(key, pattern);
  }
  if (typeof DOMMatrix !== 'undefined') {
    const [px, py] = seedPhase(seed, tile);
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, px, py]));
  }
  return pattern;
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

export interface CrayonPoint {
  x: number;
  y: number;
}

// Decides where a crayon gesture's polyline must start a new deposition pass
// (here: a fresh seed phase, so the new pass fills tooth the current one left
// bare). Pure geometry — one instance per pass, fed points in order; on
// 'split' the caller bumps the seed and re-seeds a tracker at the previous
// point. Anchor state resets per pass, so the re-entry scan stays bounded on
// the pointer hot path.
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
