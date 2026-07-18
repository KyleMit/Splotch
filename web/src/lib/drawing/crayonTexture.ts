// The crayon brush's paper-tooth texture and its per-op pattern paint.
//
// A crayon op is an ordinary op in the command log (like the magic brush,
// ADR-0043), flagged `crayon`, whose paint is a `CanvasPattern` of a fine
// paper-tooth alpha field tinted with the crayon colour. The pattern is painted
// OPAQUE where wax lands and TRANSPARENT in the tooth valleys — and because the
// drawing canvas is transparent over the real paper texture (exportDrawing.ts),
// the valleys reveal actual paper, so the white flecks are paper showing through.
//
// Why this shape (see .ruler notes / the ADR for the full rationale):
//   * Near-binary opaque coverage means a second stroke of the SAME colour can
//     never darken or muddy the hue (criterion: buildup at constant hue) — it can
//     only fill more tooth. No multiply, no alpha soup.
//   * Coverage is the tooth ∩ the stroke shape, independent of how many per-frame
//     ops the stroke is chopped into, so a slow stroke isn't denser than a fast
//     one and ADR-0036 simplification can thin the op log without shifting density
//     — replay stays bit-identical to within the pen's own ≤2px edge tolerance.
//   * The tooth is anchored in PAPER coordinates, so every target (visible ctx,
//     baseline fold, keyframe, export) samples the same tooth at the same paper
//     pixel and buildup registers across strokes and survives undo/resize/export.
//
// Buildup across separate strokes comes from a deterministic per-stroke-group
// PHASE offset derived from the op's stored `seed`: a later stroke's tooth peaks
// fall in the earlier stroke's valleys, so overlapping strokes fill each other's
// gaps and coverage climbs toward solid — live and gradual as the finger moves,
// and reproducible on replay because the seed is stored on the op, never rolled at
// render time.
//
// Determinism: the tooth tile is generated once from a fixed PRNG seed; nothing
// here reads Math.random or the clock at render time.

// Deterministic PRNG (mulberry32) — seeded once to build the tile.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Lattice {
  cells: number;
  g: Float32Array;
}

// A coarse random lattice, wrap-sampled so the generated tile edges match and it
// tiles seamlessly.
function makeLattice(cells: number, rng: () => number): Lattice {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return { cells, g };
}

function sampleLattice(lat: Lattice, u: number, v: number): number {
  const { cells, g } = lat;
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x) % cells;
  const y0 = Math.floor(y) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = g[y0 * cells + x0];
  const b = g[y0 * cells + x1];
  const c = g[y1 * cells + x0];
  const d = g[y1 * cells + x1];
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Tooth parameters, tuned against real-crayon reference photos (a dense waxy body
// with fine, irregular paper-tooth holes — not uniform digital speckle and not a
// flat fill). Three octaves give holes that vary from fine flecks to larger paper
// gaps; a low-frequency clump field creates denser/sparser zones like real paper.
const TILE = 256;
const COARSE_CELLS = 30; // the big irregular gaps
const COARSE_WEIGHT = 0.28;
const FINE_CELLS = 84; // the base grain
const OCTAVE2 = 2.1; // finest octave frequency multiple
const OCTAVE2_WEIGHT = 0.5;
const CLUMP_CELLS = 10;
const CLUMP_AMOUNT = 0.42;
const THRESHOLD = 0.35; // coverage: single pass ~68% waxy body with tooth holes
const SOFT = 0.1; // near-binary but anti-aliased fleck edge (no grit, no haze)
const TILE_SEED = 0x9e3779b9;

let toothTile: HTMLCanvasElement | null = null;

// Build the paper-tooth ALPHA tile once: RGB white, alpha = tooth. Deterministic.
function buildToothTile(): HTMLCanvasElement {
  const rng = mulberry32(TILE_SEED);
  const coarse = makeLattice(COARSE_CELLS, rng);
  const fine = makeLattice(FINE_CELLS, rng);
  const fine2 = makeLattice(Math.round(FINE_CELLS * OCTAVE2), rng);
  const clump = makeLattice(CLUMP_CELLS, rng);
  const cv = document.createElement('canvas');
  cv.width = TILE;
  cv.height = TILE;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  const norm = COARSE_WEIGHT + 1 + OCTAVE2_WEIGHT;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      const v = y / TILE;
      const n =
        (COARSE_WEIGHT * sampleLattice(coarse, u, v) +
          sampleLattice(fine, u, v) +
          OCTAVE2_WEIGHT * sampleLattice(fine2, u, v)) /
        norm;
      const cl = (sampleLattice(clump, u, v) - 0.5) * CLUMP_AMOUNT;
      const a = smoothstep(THRESHOLD + cl - SOFT, THRESHOLD + cl + SOFT, n);
      const i = (y * TILE + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function toothTileOnce(): HTMLCanvasElement {
  if (!toothTile) toothTile = buildToothTile();
  return toothTile;
}

// A crayon-colour tile: RGB = colour, alpha = tooth. Cached per colour string
// (the palette is small); the tooth alpha is colour-independent so this is one
// fillRect + one destination-in composite of the shared tooth tile.
const tintCache = new Map<string, HTMLCanvasElement>();

function tintedTile(color: string): HTMLCanvasElement {
  let tinted = tintCache.get(color);
  if (tinted) return tinted;
  const tooth = toothTileOnce();
  tinted = document.createElement('canvas');
  tinted.width = TILE;
  tinted.height = TILE;
  const ctx = tinted.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tooth, 0, 0);
  tintCache.set(color, tinted);
  return tinted;
}

// A tooth pattern per target context, cached per (target, colour). The tile is
// anchored in paper coordinates (the pattern tiles in the target's user space,
// which is paper space on every surface), so buildup registers and replay is
// bit-identical; the per-op PHASE for a stroke group is applied fresh on each call
// via setTransform, right before the caller strokes — so a cached pattern is safe
// to re-phase between ops (each op fully paints before the next).
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

// Deterministic per-group phase from the op's stored seed: a pseudo-random but
// fixed sub-tile shift so separate strokes' tooth peaks interleave and fill in.
function phaseFor(seed: number): { x: number; y: number } {
  const x = (Math.imul(seed | 0, 0x9e3779b9) >>> 0) % TILE;
  const y = (Math.imul((seed | 0) ^ 0x85ebca6b, 0xc2b2ae35) >>> 0) % TILE;
  return { x, y };
}

export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number
): CanvasPattern | null {
  let byColor = patternCache.get(target);
  if (!byColor) {
    byColor = new Map();
    patternCache.set(target, byColor);
  }
  let pattern = byColor.get(color);
  if (!pattern) {
    const created = target.createPattern(tintedTile(color), 'repeat');
    if (!created) return null;
    pattern = created;
    byColor.set(color, pattern);
  }
  if (typeof DOMMatrix !== 'undefined') {
    const ph = phaseFor(seed);
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, ph.x, ph.y]));
  }
  return pattern;
}
