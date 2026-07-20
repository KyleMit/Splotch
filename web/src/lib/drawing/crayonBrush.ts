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
//      pixels. Per-span variation is a stored integer `seed` that only
//      PHASE-SHIFTS the same field — still fully replayable.
//   3. Wax buildup at constant hue. The body is laid down OPAQUE, so a second
//      same-colour stroke over the first is opaque-over-opaque of the identical
//      colour — the hue cannot shift or darken (no multiply). What DOES change is
//      coverage: because each stroke phase-shifts the tooth by its own seed, the
//      second stroke's holes land in different spots and fill in tooth the first
//      left bare. Redrawing gets denser and fills the grain while staying the
//      same colour, exactly like pressing a crayon over its own mark. And a real
//      crayon doesn't care whether the pen lifted before re-covering: when one
//      continuous gesture doubles back over wax it already laid (a sharp
//      reversal, or the tip re-entering its own strip — CrayonPassTracker), the
//      engine advances the seed mid-stroke, so scribbling in place deepens live
//      exactly like lifting and redrawing would.
//
// The opaque body is not one flat RGB: each texel's colour is shaded a touch
// darker or lighter by a tone field derived from the same paper-tooth height
// field that decides where wax lands (thick wax on the high grain, a thin
// scrape in the shallows), so the fill has the waxy tonal life of real crayon
// instead of a stencilled cutout. Crucially the tone lives in the RGB only and
// is shared by every density pass: a texel is painted the SAME colour by
// whichever pass or overlapping op reaches it, so opaque-over-opaque stays
// idempotent and the undo/replay invariants of the binary tooth are untouched
// (see waxAlpha and waxTone).
//
// Patterns are paper-anchored like the magic sheet (ADR-0043): a
// per-(context,colour,pass) repeating pattern whose tile grid is offset in paper
// coordinates by the stroke's phase, so live drawing and every replay surface
// tile it identically. Within one stroke every op shares the seed, so the tooth
// is spatially consistent across the stroke's segments and reads as one coherent
// piece of wax rather than beading per-segment.

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
  // Subtle per-texel tone shading of the opaque wax body: each texel's RGB is
  // pulled toward black (thick wax) or white (thin wax) by up to this fraction
  // of the available range, driven by the shared tone field. RGB only — the
  // alpha stays binary, and the tone is identical across passes, so replay
  // idempotence is unaffected. 0 disables (flat body colour).
  toneVariation: number;
  // The density passes, widest first.
  passes: CrayonPass[];
}

// Tuned against photos of real wax crayon through the render+measure+judge loop
// (tools/asset-gen/.coloring-samples/crayon): a big tile with no coarse octave to
// kill visible repetition; fine multi-scale grain for organic paper tooth; a
// full-width sparse rim pass under a narrower dense core pass for the crayon's
// centre-dense / edge-broken falloff; a slow body-density wobble for waxy
// pressure variation; and a whisper of per-texel tone shading (`toneVariation`)
// so the opaque body reads as thick-and-thin wax rather than one flat RGB —
// kept deliberately subtle because the binary tooth already varies coverage.
// `edge` is the ordered-dither band that keeps the binary
// pits from aliasing (see waxAlpha) — narrow, so rims read as tooth flecks rather
// than a stippled haze. Single pass leaves tooth visible; a second same-colour
// pass fills the tooth it left bare (buildup) at a constant hue. Pass coverages
// deliberately start light: a first stroke reads as an airy single crayon pass
// with plenty of bare tooth, leaving headroom for redraws to visibly densify —
// the lighter the first pass, the more each same-colour overlap fills in.
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
  toneVariation: 0.12,
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

// Tone shade in [-1, 1] for a texel with paper-tooth height `h` (0..1):
// positive = a raised bump that grabs wax thick, shade the colour darker;
// negative = a shallow spot the crayon barely kisses, shade lighter. A mild
// contrast stretch keeps the mid-heavy noise producing legible tonal life.
// Deliberately driven by the FINE height field only, never the slow body
// field: fine grain averages out over any region, so a same-colour redraw
// (which phase-shifts the tone with its seed) cannot move a region's mean
// colour — buildup stays at constant hue. Slow tonal drift already exists
// visually through the body field's pit-density wobble. Pure and
// deterministic; exported for unit tests.
export function waxTone(h: number): number {
  const s = (h - 0.5) * 2.4;
  return s < -1 ? -1 : s > 1 ? 1 : s;
}

// Shade one 0..255 colour channel by `tone` (see waxTone) at `amplitude`
// (CrayonOptions.toneVariation): darkening multiplies toward black, lightening
// blends toward white, so every colour keeps headroom in both directions. Pure
// and deterministic; exported for unit tests.
export function shadeWaxChannel(channel: number, toneShade: number, amplitude: number): number {
  const a = toneShade * amplitude;
  return Math.round(a >= 0 ? channel * (1 - a) : channel + (255 - channel) * -a);
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
// Per-texel tone, quantized to TONE_LEVELS indices at field-build time so
// colorTile shades a texel with one byte lookup into a tiny per-colour LUT
// instead of three rounded multiplies — the tile build runs synchronously on
// the pointer path the first time a colour is drawn, so it must stay as cheap
// as the un-toned build. 32 levels across a ±toneVariation swing step channels
// by well under 2/255 — invisible, and just as deterministic.
const TONE_LEVELS = 32;
let toneIdx: Uint8Array | null = null;

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

  const t = new Uint8Array(size * size);
  for (let i = 0; i < t.length; i++) {
    t[i] = Math.round(((waxTone(h[i]) + 1) / 2) * (TONE_LEVELS - 1));
  }
  toneIdx = t;
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

// A colorized wax tile per (colour, pass): rgb = the crayon colour shaded by
// the per-texel tone field, alpha = the pass's tooth field. The tone shading is
// a pure function of the texel (never the pass), so a texel painted by several
// passes or overlapping ops always receives the same RGB — the idempotence
// waxAlpha's binary tooth guarantees extends to the shaded colour. Built once
// and reused by every context's pattern.
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
  const lut = new Uint8ClampedArray(TONE_LEVELS * 3);
  for (let level = 0; level < TONE_LEVELS; level++) {
    const s = (level / (TONE_LEVELS - 1)) * 2 - 1;
    lut[level * 3] = shadeWaxChannel(r, s, opts.toneVariation);
    lut[level * 3 + 1] = shadeWaxChannel(gr, s, opts.toneVariation);
    lut[level * 3 + 2] = shadeWaxChannel(b, s, opts.toneVariation);
  }
  const idx = toneIdx!;
  for (let i = 0; i < height.length; i++) {
    const j = i * 4;
    const k = idx[i] * 3;
    data[j] = lut[k];
    data[j + 1] = lut[k + 1];
    data[j + 2] = lut[k + 2];
    data[j + 3] = Math.round(waxAlpha(i, pass.coverage) * 255);
  }
  g.putImageData(img, 0, 0);
  colorTileCache.set(key, c);
  return c;
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

// --- Mid-gesture pass tracking ----------------------------------------------
//
// Buildup comes from the seed phase-shift, and the seed used to change only per
// stroke — so backtracking WITHIN one continuous gesture was idempotent (the
// same phase re-deposits the same texels) while lifting and redrawing deepened.
// A real crayon doesn't care whether the pen lifted: re-covering wax is
// re-covering wax. CrayonPassTracker (ported from the swept-passes experiment,
// ADR-0065) detects the moment a gesture starts re-covering its own strip; the
// engine then advances the op seed and re-seeds a tracker, so each re-covering
// sweep deposits a freshly phase-shifted tooth and the mark deepens live under
// the finger. Pure geometry, no engine state — unit-tested in isolation.

export interface CrayonPoint {
  x: number;
  y: number;
}

// Split triggers, all relative to the stroke width so thick and thin crayons
// feel the same:
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

// Decides where a crayon gesture must advance to a new deposition pass. One
// instance per pass, fed points in order; on 'split' the caller re-seeds a new
// tracker at the PREVIOUS point (the split point is not consumed).
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
  // PREVIOUS point (the caller re-seeds a tracker there and feeds it p);
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
