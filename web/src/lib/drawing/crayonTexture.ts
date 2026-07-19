// Crayon brush texture (ADR: crayon brush).
//
// A crayon lays waxy pigment onto the raised "tooth" of the paper: the peaks
// take pigment, the pits stay bare, so a stroke reads as a dense body broken by
// fine paper grain rather than a flat fill. This module produces the paint the
// single renderer (strokeOps.renderOp) strokes a crayon op with: a CanvasPattern
// of the stroke colour punched through with a fixed paper-tooth mask.
//
// Two properties are load-bearing and shape the whole approach:
//
//  * Determinism (ADR-0033). The tooth mask is generated ONCE from a fixed
//    internal seed — never Math.random at render time — so live drawing and every
//    replay (undo/resize/export/keyframe fold) paint byte-identical pixels. The
//    only per-stroke variation is a phase OFFSET into that fixed mask, carried on
//    the op as a stored integer `seed`, so it too replays identically.
//
//  * Overlap-idempotence. The mask is binary (a texel is fully opaque wax or
//    fully bare paper — no partial alpha), and a single stroke's ops all share one
//    seed, hence one paper-locked pattern phase. Overlapping ops of the same
//    stroke therefore deposit the exact same opaque texels (source-over of an
//    opaque colour onto itself is a no-op), so the round-cap joints between a
//    stroke's per-frame ops never bead, and commit-time simplification (ADR-0036)
//    re-strokes the same region to the same pixels — no visible "snap". This is
//    the same reason a solid pen stroke survives replay; the crayon only swaps the
//    solid paint for a masked one.
//
// Wax buildup falls out of this for free. Two strokes of the SAME colour get
// DIFFERENT seeds, so their tooth phases differ and each fills paper pits the
// other missed. Because both deposit the identical opaque colour, the overlap
// never shifts hue or darkens (it is not a multiply) — it just covers more of the
// grain and reads denser. Redrawing builds coverage toward solid while holding the
// colour constant, live and gradually as the second stroke is drawn.

// The mask tiles at this size in PAPER pixels (the space ops are recorded in — see
// engine.ts). 512 keeps the repeat period (~256 CSS px at 2x DPR) well past a
// typical scribble while the grain stays fine enough that the repeat is invisible.
const TILE = 512;

// Tunables for the look. Kept together so the texture can be tuned against real
// crayon references without hunting through the code.
const CFG = {
  // The tooth is a sum of octaves so pit SIZE varies (organic paper grain) rather
  // than a single uniform speckle frequency (which reads as digital sand). Cells
  // are lattice points across the 512 px tile; fewer cells = larger features.
  // fine ~6 px pits, medium ~15 px clumps.
  fineCells: 94,
  fineWeight: 1,
  medCells: 40,
  medWeight: 0.35,
  // Coarse density variation (pressure-like blotchiness): a low-frequency bias
  // added before thresholding so the stroke has denser and thinner patches, the
  // way a dragged crayon lays down more wax in some places than others.
  coarseCells: 7,
  coarseAmt: 0.45,
  // Fraction of the tile a single pass covers with wax (the rest shows paper).
  // Below 1 so a lone stroke reads as waxy-with-tooth and leaves headroom for a
  // second pass to fill in. Coverage is hit exactly via a quantile threshold.
  coverage: 0.8,
} as const;

let maskCanvas: HTMLCanvasElement | null = null;

// A small, seeded PRNG (mulberry32) used ONCE with a fixed seed to build the
// tooth lattice. Fixed seed ⇒ the mask is identical on every device and every
// replay; this is init-time generation, not render-time randomness.
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

// One octave of tileable value noise: a `cells`×`cells` lattice of random values
// (wrapped so opposite edges meet) sampled with smoothstep interpolation.
function makeLattice(cells: number, rand: () => number): Float32Array {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return grid;
}

function sampleLattice(grid: Float32Array, cells: number, x: number, y: number): number {
  const gx = (x / TILE) * cells;
  const gy = (y / TILE) * cells;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smoothstep(gx - x0);
  const fy = smoothstep(gy - y0);
  const x0w = ((x0 % cells) + cells) % cells;
  const y0w = ((y0 % cells) + cells) % cells;
  const x1w = (x0w + 1) % cells;
  const y1w = (y0w + 1) % cells;
  const v00 = grid[y0w * cells + x0w];
  const v10 = grid[y0w * cells + x1w];
  const v01 = grid[y1w * cells + x0w];
  const v11 = grid[y1w * cells + x1w];
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

// Build the binary tooth mask once: fine tooth + coarse density, thresholded at
// the quantile that yields exactly CFG.coverage covered area. Opaque white where
// wax lands, transparent where paper shows; colouring is a later destination-in.
function buildMask(): HTMLCanvasElement {
  const rand = mulberry32(0x5c1a7c11);
  const fine = makeLattice(CFG.fineCells, rand);
  const med = makeLattice(CFG.medCells, rand);
  const coarse = makeLattice(CFG.coarseCells, rand);

  const field = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const f = sampleLattice(fine, CFG.fineCells, x, y);
      const m = sampleLattice(med, CFG.medCells, x, y);
      const c = sampleLattice(coarse, CFG.coarseCells, x, y);
      field[y * TILE + x] = CFG.fineWeight * f + CFG.medWeight * m + CFG.coarseAmt * (c - 0.5);
    }
  }

  // Threshold at the (1 - coverage) quantile so covered area is exactly coverage,
  // independent of the noise's value distribution. Sampled sort keeps it cheap.
  const sample = new Float32Array(4096);
  for (let i = 0; i < sample.length; i++) {
    sample[i] = field[Math.floor((i / sample.length) * field.length)];
  }
  sample.sort();
  const threshold = sample[Math.floor((1 - CFG.coverage) * (sample.length - 1))];

  const cv = document.createElement('canvas');
  cv.width = TILE;
  cv.height = TILE;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(TILE, TILE);
  for (let i = 0; i < field.length; i++) {
    const covered = field[i] >= threshold;
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = covered ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function mask(): HTMLCanvasElement {
  if (!maskCanvas) maskCanvas = buildMask();
  return maskCanvas;
}

// Build the tooth mask ahead of the first stroke. Generating it (a 512² field of
// multi-octave noise) is a one-time ~tens-of-ms cost; warming it at idle keeps
// that off the frame the child's first crayon stroke lands on.
export function warmCrayonTexture() {
  mask();
}

// Per-colour tile cache: the tooth mask tinted to a stroke colour (opaque colour
// where wax lands, transparent in the pits). Bounded so a session that cycles
// many colours can't grow it without limit; toddlers use few colours at a time.
const MAX_TINTED = 16;
const tinted = new Map<string, HTMLCanvasElement>();

function tintedTile(color: string): HTMLCanvasElement {
  const hit = tinted.get(color);
  if (hit) {
    // refresh LRU position
    tinted.delete(color);
    tinted.set(color, hit);
    return hit;
  }
  const cv = document.createElement('canvas');
  cv.width = TILE;
  cv.height = TILE;
  const g = cv.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, TILE, TILE);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask(), 0, 0);
  tinted.set(color, cv);
  if (tinted.size > MAX_TINTED) {
    const oldest = tinted.keys().next().value;
    if (oldest !== undefined) tinted.delete(oldest);
  }
  return cv;
}

// Deterministic integer phase offset into the tile for a stroke seed. Two 32-bit
// hashes of the seed give x and y; the fine grain (~4 px) means even nearby seeds
// decorrelate, so different strokes fill complementary pits (the buildup).
function phaseFor(seed: number): { x: number; y: number } {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const x = h % TILE;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  const y = h % TILE;
  return { x, y };
}

// Reuse the last pattern within a stroke's op run: consecutive replayed ops share
// (target, colour, seed), so this memo turns the hot replay path into one
// createPattern per stroke instead of per op.
let lastKey = '';
let lastTarget: CanvasRenderingContext2D | null = null;
let lastPattern: CanvasPattern | null = null;

// The paint for a crayon op: a repeating pattern of the colour-tinted tooth,
// translated by the stroke's phase so same-colour passes fill different pits.
// Anchored in paper coordinates (like the magic sheet, magicBrush.ts) so it lands
// identically on the visible canvas, the square baseline, keyframes and exports.
export function crayonPaintFor(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number
): CanvasPattern | null {
  const key = `${color}|${seed}`;
  if (lastTarget === target && lastKey === key && lastPattern) return lastPattern;
  const pattern = target.createPattern(tintedTile(color), 'repeat');
  if (!pattern) return null;
  const p = phaseFor(seed);
  if (typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, p.x, p.y]));
  }
  lastTarget = target;
  lastKey = key;
  lastPattern = pattern;
  return pattern;
}
