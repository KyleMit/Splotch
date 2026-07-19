// Crayon brush texture (companion to the magic brush, ADR-0043's pattern-fill model).
//
// A crayon lays wax on the raised *tooth* of the paper and skips the valleys. So a
// crayon op is an ordinary op in the command log (ADR-0033) whose paint is a
// `CanvasPattern` of the stroke colour punched by a fixed paper-tooth mask —
// opaque on the peaks, transparent in the valleys. `renderOp` strokes that pattern
// for a crayon op; everything else is unchanged, so undo / eraser / resize / export
// all fall out of the existing replay for free, exactly like the magic brush.
//
// Two properties this buys, both load-bearing:
//
//   * **Waxy, not flat.** The stroke body is dense colour broken by fine transparent
//     tooth valleys where the paper shows through — a broken-but-crisp edge, no blur,
//     no digital grit. The grain is *contained* to the stroke: the pattern only
//     paints inside the stroked shape.
//
//   * **Wax buildup at constant hue.** The colour is fully opaque, so a second stroke
//     over existing crayon of the same colour can only *fill valleys the first pass
//     left* — overlapping peaks are already that exact colour and stay it (source-over
//     of an opaque colour over itself is a no-op). To make the second pass land on the
//     first pass's valleys instead of its peaks, each stroke shifts the tooth by a
//     per-stroke *grain phase* (`gx`/`gy`, stored on the op). Different phase → the
//     passes interleave → coverage climbs toward solid while the hue never moves. This
//     is the "fills in the tooth, doesn't darken the colour" behaviour, and because the
//     phase is stored, it is deterministic and bit-identical on replay.
//
// Determinism: the tooth tile is generated once from a fixed seed (no Math.random /
// time at render), and the grain phase is derived from the stroke's start point and
// stored, so the same drawing always produces the same pixels.

// Dev-only render-variant seam (mirrors ADR-0036's `SimplifyMode`): one build can A/B
// every crayon variant through `window.__engine.setCrayonParams` on `/dev/engine`;
// production never calls the setter and ships the default. The winning tuning is the
// default here.
export type CrayonMode = 'tooth' | 'dense' | 'off';

export interface CrayonParams {
  // Which variant renders. 'tooth' is the shipping crayon; 'dense' is a higher-coverage
  // A/B alternative; 'off' bypasses the texture (renders as a plain solid stroke), the
  // A/B baseline.
  mode: CrayonMode;
  // Edge length of the square tooth tile, in paper units. Larger = the grain repeats
  // less often across a big fill; costs a one-off larger generation.
  tile: number;
  // Fraction of the stroke body the wax covers (peaks). The rest is transparent tooth
  // valleys (paper showing through). Higher = denser, more solid; lower = more toothy.
  coverage: number;
  // Feature sizes (paper units) blended into the tooth. Must divide `tile` so the tile
  // wraps seamlessly. Small values = fine grain; a couple of larger ones add the
  // coarser wax-skip structure real crayon has.
  cells: number[];
  // Relative weight of each `cells` octave (same length). Fine octaves weighted up keep
  // the grain reading as paper tooth rather than blotches.
  weights: number[];
  // Half-width of the smoothstep ramp across a valley edge, in normalized noise units.
  // Small = crisp veins; too small aliases, too large blurs into softness.
  band: number;
  // Opacity of the covered peaks. 1 = fully opaque (overlap can never darken — the
  // strict buildup guarantee). Slightly below 1 reads a touch more waxy at the cost of
  // a faint deepening on exact re-overlap.
  bodyAlpha: number;
}

// Tuned against real-crayon references through the /dev/engine render harness + an
// automated vision judge (see the ADR): a fine base tooth (cell 2/4/8) for the
// paper grain, plus a strong coarse octave (cell 64) that modulates wax density
// across the stroke so it reads as uneven hand pressure rather than a uniform
// speckle. coverage 0.86 keeps a single pass dense-and-waxy while leaving enough
// valley for an overlapping pass to visibly build up.
const DEFAULTS: CrayonParams = {
  mode: 'tooth',
  tile: 512,
  coverage: 0.86,
  cells: [2, 4, 8, 64],
  weights: [1, 0.5, 0.35, 0.5],
  band: 0.06,
  bodyAlpha: 1,
};

let params: CrayonParams = { ...DEFAULTS };

// Deterministic seed for the tooth noise. A constant, never Math.random: the same
// tile every load ⇒ the same pixels for a given drawing.
const TOOTH_SEED = 0x5f1074c4;

// --- Deterministic value-noise tooth ----------------------------------------

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// One octave of wrapping value noise sampled over a `size`×`size` grid at lattice
// spacing `cell`. The lattice is indexed modulo its own dimension so the tile is
// seamless (left edge continues into the right, top into bottom).
function valueNoiseOctave(size: number, cell: number, rand: () => number): Float32Array {
  const lat = Math.max(1, Math.round(size / cell));
  const grid = new Float32Array(lat * lat);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / cell) % lat;
    const y0 = Math.floor(gy) % lat;
    const y1 = (y0 + 1) % lat;
    const fy = smoothstep(0, 1, gy - Math.floor(gy));
    for (let x = 0; x < size; x++) {
      const gx = (x / cell) % lat;
      const x0 = Math.floor(gx) % lat;
      const x1 = (x0 + 1) % lat;
      const fx = smoothstep(0, 1, gx - Math.floor(gx));
      const v00 = grid[y0 * lat + x0];
      const v10 = grid[y0 * lat + x1];
      const v01 = grid[y1 * lat + x0];
      const v11 = grid[y1 * lat + x1];
      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      out[y * size + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

// Build the tooth mask as a fractal sum of the `cells` octaves, thresholded so exactly
// `coverage` of the tile is opaque wax and the rest is transparent valley, with a soft
// crisp ramp across each valley edge. Returns a canvas whose ALPHA channel is the mask
// (RGB is white; only alpha is sampled once it's punched into the colour).
let toothTile: HTMLCanvasElement | null = null;
let toothTileKey = '';

function toothParamsKey(p: CrayonParams): string {
  return `${p.tile}|${p.coverage}|${p.cells.join(',')}|${p.weights.join(',')}|${p.band}|${p.bodyAlpha}`;
}

function buildToothTile(p: CrayonParams): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = Math.max(8, Math.round(p.tile));
  const rand = mulberry32(TOOTH_SEED);
  const fbm = new Float32Array(size * size);
  let totalW = 0;
  for (let o = 0; o < p.cells.length; o++) {
    const w = p.weights[o] ?? 1;
    totalW += w;
    const oct = valueNoiseOctave(size, p.cells[o], rand);
    for (let i = 0; i < fbm.length; i++) fbm[i] += oct[i] * w;
  }
  if (totalW > 0) for (let i = 0; i < fbm.length; i++) fbm[i] /= totalW;

  // Threshold at the coverage quantile so the opaque fraction is exactly `coverage`,
  // independent of the noise's actual distribution.
  const sorted = Float32Array.from(fbm).sort();
  const t = sorted[Math.min(sorted.length - 1, Math.floor(p.coverage * sorted.length))];

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const a = Math.round(255 * Math.min(1, Math.max(0, p.bodyAlpha)));
  for (let i = 0; i < fbm.length; i++) {
    // Covered where fbm < t; smoothstep across the edge band gives crisp-but-AA veins.
    const cover = 1 - smoothstep(t - p.band, t + p.band, fbm[i]);
    const j = i * 4;
    data[j] = 255;
    data[j + 1] = 255;
    data[j + 2] = 255;
    data[j + 3] = Math.round(a * cover);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function getToothTile(): HTMLCanvasElement | null {
  const key = toothParamsKey(params);
  if (!toothTile || toothTileKey !== key) {
    toothTile = buildToothTile(params);
    toothTileKey = key;
  }
  return toothTile;
}

// --- Per-colour coloured-tile + pattern cache -------------------------------

// A crayon op paints its colour punched by the tooth. Building that coloured tile is
// the only non-trivial cost, so it's cached per (target context, colour): the first op
// of a stroke of a new colour builds it once (off the per-move hot path for repeated
// colours), every later op just re-strokes the cached pattern like a solid colour.
// Keyed per context because a pattern is bound to the context that created it (the
// visible ctx live; baseline/keyframe/export contexts on replay), and re-keyed when the
// params change so a retuned tooth can't hand back a stale pattern.
interface ColorEntry {
  canvas: HTMLCanvasElement;
  pattern: CanvasPattern;
}
let cache = new WeakMap<CanvasRenderingContext2D, Map<string, ColorEntry>>();
let cacheKey = toothParamsKey(DEFAULTS);

function colorEntry(target: CanvasRenderingContext2D, color: string): ColorEntry | null {
  if (cacheKey !== toothParamsKey(params)) {
    cache = new WeakMap();
    cacheKey = toothParamsKey(params);
  }
  let perColor = cache.get(target);
  if (!perColor) {
    perColor = new Map();
    cache.set(target, perColor);
  }
  const hit = perColor.get(color);
  if (hit) return hit;

  const tooth = getToothTile();
  if (!tooth) return null;
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = tooth.width;
  tile.height = tooth.height;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, tile.width, tile.height);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(tooth, 0, 0);
  const pattern = target.createPattern(tile, 'repeat');
  if (!pattern) return null;
  const entry: ColorEntry = { canvas: tile, pattern };
  perColor.set(color, entry);
  return entry;
}

// The tooth-punched colour pattern for a crayon op, phase-shifted by the stroke's grain
// offset so successive strokes fill different valleys (buildup). Returns null when the
// texture can't be built (SSR, a stub canvas, or `mode: 'off'`) — `renderOp` then falls
// back to a plain solid stroke, so the crayon degrades to the pen rather than vanishing.
export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string,
  gx: number,
  gy: number
): CanvasPattern | null {
  if (params.mode === 'off') return null;
  if (typeof target.createPattern !== 'function') return null;
  const entry = colorEntry(target, color);
  if (!entry) return null;
  if (typeof DOMMatrix !== 'undefined') {
    entry.pattern.setTransform(new DOMMatrix([1, 0, 0, 1, gx, gy]));
  }
  return entry.pattern;
}

// The per-stroke grain phase, derived deterministically from the stroke's start point
// (paper coordinates, which are stored) so it needs no randomness yet decorrelates
// between strokes: two strokes that start even a pixel apart shift the tooth to
// different valleys, which is what makes an overlapping second pass build up instead of
// re-covering the same peaks. Quantized to 1/16 px and hashed, then reduced into the
// tile so the offset is a meaningful fraction of a period.
export function crayonGrainPhase(startX: number, startY: number): { gx: number; gy: number } {
  const period = Math.max(8, Math.round(params.tile));
  const xi = Math.round(startX * 16);
  const yi = Math.round(startY * 16);
  let h = 0x811c9dc5 ^ Math.imul(xi | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h ^= Math.imul(yi | 0, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  const gx = ((h >>> 0) % period) + ((h >>> 8) & 0xff) / 256;
  const gy = ((h >>> 12) % period) + ((h >>> 20) & 0xff) / 256;
  return { gx, gy };
}

// --- Dev seam ---------------------------------------------------------------

export function setCrayonParams(next: Partial<CrayonParams>): void {
  params = { ...params, ...next };
}

export function getCrayonParams(): CrayonParams {
  return { ...params };
}

// Drop the tooth tile and colour caches. Used by tests and by a params change that
// needs the next render to rebuild from scratch.
export function resetCrayonCaches(): void {
  toothTile = null;
  toothTileKey = '';
  cache = new WeakMap();
  cacheKey = '';
}
