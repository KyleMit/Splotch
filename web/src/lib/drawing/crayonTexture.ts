// The crayon brush's "paper tooth" texture (ADR-0065).
//
// A crayon lays waxy pigment on the raised tooth of the paper and skips the
// valleys, so partial coverage reads as fine, even paper grain. We render that
// by STROKING the finger's path in the crayon colour through a tiling texture
// whose per-pixel ALPHA is the tooth: near-opaque on the peaks, near-zero in the
// valleys. Because the visible canvas is transparent over the paper sheet
// (ADR-0050/0051), the valleys reveal the real paper texture underneath — actual
// crayon-on-paper, live and in the exported PNG.
//
// Why this gives wax BUILD-UP at constant hue with NO multiply darkening:
// the texture composites source-over. Layering the same semi-transparent colour
// C at coverage a over itself gives 1-(1-a)^n coverage — the alpha climbs toward
// opaque while the hue never moves, and it never darkens PAST C (multiply would
// keep driving toward black). The tooth curve is high-contrast, so a peak pixel
// is already ~opaque after one pass ("redrawing barely changes the colour") while
// a valley pixel climbs slowly over many passes ("fills in the tooth"). The tooth
// is a fixed blue-noise field in paper space, so overlapping strokes align their
// grain like real paper, and — being derived only from stored op data + a shipped
// constant — every replay/resize/export reproduces it bit-for-bit (no RNG at
// render, criterion 7).
//
// The tooth itself is blue noise (void-and-cluster) rather than white noise, so
// the partial-coverage stipple is evenly spaced fine grain, not gritty clumps —
// see crayonNoise.ts and scripts/gen-crayon-noise.mjs.

import { crayonNoiseBytes, CRAYON_NOISE_SIZE } from './crayonNoise';

// Tunable shape of the crayon, swept live from the /dev/crayon harness for A/B
// (the engine's setCrayonParams seam). The defaults are the shipped variant.
//
// Two frequency bands make the tooth read as wax on paper rather than a
// mechanical stipple (the flaw the first even-blue-noise variant had): a HIGH
// band — the committed blue noise, softened to ~`grainPx` device px — is the fine
// paper grain, and a LOW band — a smooth tileable value-noise field — nudges the
// local tooth height up and down so the body has organic denser/lighter patches
// (uneven pressure + paper-tooth variation), not one flat density.
export interface CrayonParams {
  /** Per-layer deposit alpha in the tooth valleys (>0 so many passes still fill). */
  floor: number;
  /** Per-layer deposit alpha on the tooth peaks (the dense crayon body). */
  peak: number;
  /** Tooth-height where the deposit ramp starts (below → valley/floor). */
  edge0: number;
  /** Tooth-height where the deposit ramp reaches the peak. */
  edge1: number;
  /** Shapes tooth height before the ramp; >1 widens valleys, <1 widens body. */
  gamma: number;
  /** Fine-grain feature size in device px (how coarse the paper tooth reads). */
  grainPx: number;
  /** Low-frequency density variation amount (0 = flat, ~0.4 = organic patches). */
  varAmp: number;
  /** Low-frequency variation cycles across the tile (patch size; integer, tileable). */
  varFreq: number;
}

export const DEFAULT_CRAYON_PARAMS: CrayonParams = {
  floor: 0.08,
  peak: 0.95,
  edge0: 0.0,
  edge1: 0.32,
  gamma: 1,
  grainPx: 2,
  varAmp: 0.4,
  varFreq: 2,
};

// The generated tooth tile is larger than the 64px blue-noise source so the
// low-frequency density band has room to vary without an obvious repeat: at 256
// device px it's ~128 CSS px per tile at 2× DPR, so a normal stroke spans barely
// a repeat. Grain stays fixed in paper space (pattern anchored at origin).
const TILE = 256;

let params: CrayonParams = { ...DEFAULT_CRAYON_PARAMS };

// Bumped whenever params change so cached tiles/patterns invalidate without
// having to walk the (Weak)Map caches.
let generation = 0;

export function setCrayonParams(partial: Partial<CrayonParams>): void {
  params = { ...params, ...partial };
  alphaTile = null;
  tileByColor.clear();
  generation++;
}

export function getCrayonParams(): CrayonParams {
  return { ...params };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// Tooth height h in [0,1] → the per-layer deposit alpha at that pixel. Pure, so
// the buildup model is unit-testable without a canvas.
export function depositAlpha(h: number, p: CrayonParams = params): number {
  const shaped = p.gamma === 1 ? h : Math.pow(clamp01(h), p.gamma);
  return p.floor + (p.peak - p.floor) * smoothstep(p.edge0, p.edge1, shaped);
}

// Coverage after n identical source-over passes of a pixel at per-layer alpha a.
// This is the whole "wax buildup" law: monotonic toward opaque, hue-invariant.
export function cumulativeCoverage(a: number, n: number): number {
  return 1 - Math.pow(1 - a, n);
}

// --- Tooth alpha tile (colour-independent) ---------------------------------

let alphaTile: Uint8ClampedArray | null = null;

// Bilinear sample of the committed 64px blue noise, wrapping toroidally, at a
// coordinate scaled so one grain feature spans `grainPx` device px. Bilinear (vs
// nearest) softens the 1px blue noise into organic blobby grain instead of hard
// square dots — the "mechanical stipple" tell.
function sampleGrain(noise: Uint8ClampedArray, px: number, py: number): number {
  const N = CRAYON_NOISE_SIZE;
  const gx = px / Math.max(1, params.grainPx);
  const gy = py / Math.max(1, params.grainPx);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const a = noise[(((y0 % N) + N) % N) * N + (((x0 % N) + N) % N)];
  const b = noise[(((y0 % N) + N) % N) * N + ((((x0 + 1) % N) + N) % N)];
  const c = noise[((((y0 + 1) % N) + N) % N) * N + (((x0 % N) + N) % N)];
  const d = noise[((((y0 + 1) % N) + N) % N) * N + ((((x0 + 1) % N) + N) % N)];
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return (top + (bot - top) * fy) / 255;
}

// A smooth, tileable low-frequency field in [-1,1]. A sum of many integer-cycle
// waves (so it wraps seamlessly across the TILE) across mixed directions and
// phases, giving organic patch-shaped density variation. Enough terms that no
// single wave's banding shows through — it reads as irregular paper/pressure
// variation, not a weave.
const LF_WAVES = [
  { fx: 1, fy: 0, ph: 0.0, w: 0.5 },
  { fx: 0, fy: 1, ph: 1.7, w: 0.45 },
  { fx: 1, fy: 1, ph: 3.1, w: 0.4 },
  { fx: 1, fy: -1, ph: 2.2, w: 0.36 },
  { fx: 2, fy: 1, ph: 0.9, w: 0.28 },
  { fx: 1, fy: 2, ph: 4.4, w: 0.26 },
  { fx: 2, fy: -1, ph: 5.5, w: 0.22 },
  { fx: 1, fy: -2, ph: 1.1, w: 0.2 },
  { fx: 3, fy: 1, ph: 2.7, w: 0.16 },
  { fx: 1, fy: 3, ph: 0.4, w: 0.14 },
];
const LF_NORM = LF_WAVES.reduce((s, w) => s + w.w, 0);
function lowFreq(px: number, py: number): number {
  const k = (2 * Math.PI * Math.max(1, Math.round(params.varFreq))) / TILE;
  let v = 0;
  for (const w of LF_WAVES) v += w.w * Math.sin(k * (w.fx * px + w.fy * py) + w.ph);
  return v / LF_NORM;
}

// The TILE×TILE deposit-alpha field: fine grain (high band) with its local tooth
// height nudged by the low-frequency band, then run through the coverage curve.
function toothAlphaTile(): Uint8ClampedArray {
  if (alphaTile) return alphaTile;
  const noise = crayonNoiseBytes();
  const out = new Uint8ClampedArray(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const grain = sampleGrain(noise, x, y);
      const h = clamp01(grain + params.varAmp * lowFreq(x, y));
      out[y * TILE + x] = Math.round(depositAlpha(h) * 255);
    }
  }
  alphaTile = out;
  return out;
}

// --- Per-colour colourised tiles + per-target patterns ----------------------

interface CachedPattern {
  pattern: CanvasPattern;
  generation: number;
}

const tileByColor = new Map<string, HTMLCanvasElement>();
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CachedPattern>>();

// Parse an '#rgb'/'#rrggbb' crayon colour to 0..255 channels. Non-hex colours
// (named/rgb()) fall back to a 1px canvas measure — deterministic for a given
// string, and colours in the palette are hex anyway.
function parseColor(color: string): [number, number, number] {
  const hex = color.trim();
  if (hex[0] === '#') {
    if (hex.length === 4) {
      const r = parseInt(hex[1] + hex[1], 16);
      const g = parseInt(hex[2] + hex[2], 16);
      const b = parseInt(hex[3] + hex[3], 16);
      return [r, g, b];
    }
    if (hex.length === 7) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
    }
  }
  const probe = document.createElement('canvas').getContext('2d');
  if (probe) {
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }
  return [0, 0, 0];
}

// A tooth tile painted in one crayon colour: rgb = the colour, alpha = the tooth
// deposit. Built once per colour via ImageData so it's exact and deterministic.
function colorizedTile(color: string): HTMLCanvasElement {
  const cached = tileByColor.get(color);
  if (cached) return cached;
  const [r, g, b] = parseColor(color);
  const alpha = toothAlphaTile();
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  tileByColor.set(color, canvas);
  return canvas;
}

// Build (and cache) the colourised tooth tile for a colour ahead of time, so the
// one-time ~256²-pixel tile build doesn't land on the first crayon draw op. The
// engine calls this off the hot path when the crayon is selected or its colour
// changes. A no-op once the tile is cached.
export function warmCrayonTile(color: string): void {
  colorizedTile(color);
}

// A repeating tooth pattern for `color`, ready to use as a strokeStyle/fillStyle
// on `target`. Cached per (target, colour); the caller sets the scale/anchor via
// the returned pattern's transform. The pattern samples in the target's user
// space, which is always PAPER coordinates, so the grain is fixed in paper space
// and identical across the visible canvas, replay, keyframes, and export.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  let perColor = patternCache.get(target);
  if (!perColor) {
    perColor = new Map();
    patternCache.set(target, perColor);
  }
  const hit = perColor.get(color);
  if (hit && hit.generation === generation) return hit.pattern;

  const tile = colorizedTile(color);
  // The tooth (grain + low-frequency band) is baked into the tile at 1:1 device
  // px, so the pattern needs no transform — anchored at paper (0,0), fixed in
  // paper space, identical across the visible canvas, replay, keyframes, export.
  const pattern = target.createPattern(tile, 'repeat');
  if (!pattern) return null;
  perColor.set(color, { pattern, generation });
  return pattern;
}
