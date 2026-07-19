// Crayon brush — waxy wax-on-paper buildup (ADR: crayon brush).
//
// A crayon op paints its ordinary solid colour, but every deposited pixel is
// gated by a "tooth" field: dense on the paper's tooth peaks, thinning to faint
// paper in the valleys. That is what makes a stroke read as wax sitting on
// textured paper instead of a flat marker fill — a dense body shot through with
// fine paper-tooth speckle, and a broken (but crisp) edge.
//
// Buildup is same-hue and needs no per-pixel bookkeeping. Every op composites
// source-over with the SAME opaque colour, so a second pass can never darken or
// shift the hue (that would take a multiply/darken blend, which we never use).
// The key to filling grain "in new places" is that each STROKE gets its own tooth
// PHASE (a stored per-stroke offset): a later same-colour pass lands its peaks in
// the earlier pass's valleys, coating the bare-paper specks so the body fills in
// and gets denser while the already-solid peaks barely change — i.e. redrawing
// does little to the colour and much to the tooth. Because it's ordinary
// per-frame op rendering, it happens live and gradually while the second stroke
// is drawn, never as a post-commit snap. Within one stroke the phase is constant,
// so its own overlapping frames stay idempotent (no beading).
//
// Everything here is a pure function of the op's stored fields (colour, deposit
// level, tooth phase) plus the deterministic tooth tile (seeded once, no RNG/clock
// at render), so undo, resize, remount and PNG export all replay bit-identically
// through renderOp (ADR-0033) — the per-stroke phase is chosen once at stroke
// start (like the magic gradient) and stored on every op. Grain only ever samples
// inside the stroke path, so nothing sprays or speckles past the finger's mark.
//
// Only floor-safe canvas APIs are used: createPattern + pattern.setTransform and
// source-over — the same primitives the magic brush already ships (no
// OffscreenCanvas, no ctx.filter, no exotic blend modes; see docs/COMPATIBILITY.md).

import type { StrokeOp } from './strokeOps';

// Tunable crayon parameters. Mutable so the dev/engine profiling harness can
// sweep the look at runtime (setCrayonParams), exactly like the simplification
// seam; production keeps these tuned defaults.
export interface CrayonParams {
  // Tooth tile resolution in paper px. The tile repeats across the paper.
  tile: number;
  // Fractal (1/f) value noise: `octaves` layers starting at `baseCells` lattice
  // cells, each octave `lacunarity`× finer and `persistence`× fainter. The low
  // octaves are the soft wax clumps, the high octaves the fine paper pinpoints —
  // the multi-scale mix is what reads as organic tooth instead of a flat stipple.
  baseCells: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  // Deposit curve: tooth heights below `lo` are bare paper, at/above `hi` are
  // solid wax (alpha 1), a `gamma`-shaped ramp between (gamma>1 biases toward a
  // denser body). Lower `lo`/`hi` ⇒ denser body. `floor` is the minimum alpha in
  // the valleys so bare paper reads as faint translucent wax, not stark white —
  // the whole stroke gets at least this much, which keeps the body continuous.
  lo: number;
  hi: number;
  gamma: number;
  floor: number;
  // Grain scale: paper px per tooth-tile px when painted (1 = tile authored 1:1
  // in paper space). >1 coarsens the grain, <1 makes it finer.
  grain: number;
  // Per-pass deposit strength baked onto each op (globalAlpha at paint time).
  // <1 leaves buildup headroom so repeated passes keep densifying.
  deposit: number;
  // PRNG seed for the tooth field.
  seed: number;
}

// Tuned against real-crayon reference photos over several render/judge rounds
// (see the crayon-brush ADR): a dense waxy body with fine, high-frequency paper
// tooth, a broken edge, and strong same-hue buildup. The tile is large enough
// (256 × grain) that its repeat period exceeds a fill, so no tiling shows.
export const CRAYON: CrayonParams = {
  tile: 256,
  baseCells: 44,
  octaves: 4,
  persistence: 0.52,
  lacunarity: 2,
  lo: 0.3,
  hi: 0.46,
  gamma: 1.15,
  floor: 0.14,
  grain: 0.85,
  deposit: 0.93,
  seed: 0x5c1a7c11,
};

// Default deposit level stamped onto an op when the engine doesn't specify one.
export function defaultDepositLevel(): number {
  return CRAYON.deposit;
}

// --- Deterministic tooth field ------------------------------------------------

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
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// One octave of tileable value noise sampled into `out` (added in).
function addOctave(out: Float32Array, size: number, cells: number, weight: number, seed: number) {
  const rng = mulberry32(seed);
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const at = (ix: number, iy: number) =>
    lattice[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)];
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const iy = Math.floor(fy);
    const sy = smootherstep(fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const ix = Math.floor(fx);
      const sx = smootherstep(fx - ix);
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      out[y * size + x] += (top + (bot - top) * sy) * weight;
    }
  }
}

// Build the grayscale tooth tile as an alpha field (white RGB, alpha = the
// per-pass deposit for that tooth height). Cached; rebuilt when params change.
let toothTile: HTMLCanvasElement | null = null;

function buildToothTile(): HTMLCanvasElement {
  const { tile, baseCells, octaves, persistence, lacunarity, lo, hi, gamma, floor, seed } = CRAYON;
  const field = new Float32Array(tile * tile);
  let amp = 1;
  let cells = baseCells;
  let ampSum = 0;
  for (let o = 0; o < octaves; o++) {
    // Lattice can't exceed the tile (that would alias into grit), so cap it.
    addOctave(
      field,
      tile,
      Math.max(2, Math.min(tile, Math.round(cells))),
      amp,
      seed + o * 0x9e3779b9
    );
    ampSum += amp;
    amp *= persistence;
    cells *= lacunarity;
  }

  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(tile, tile);
  const span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < field.length; i++) {
    const n = field[i] / ampSum; // normalize the fractal sum to [0,1]
    const t = Math.max(0, Math.min(1, (n - lo) / span));
    const a = floor + (1 - floor) * Math.pow(t, gamma); // floor: faint wax in valleys
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

function ensureToothTile(): HTMLCanvasElement {
  if (!toothTile) toothTile = buildToothTile();
  return toothTile;
}

// --- Per-colour tinted tiles + per-target patterns ----------------------------

// A tinted tile is the tooth field painted in one crayon colour (colour RGB,
// alpha = tooth alpha). Small LRU so a long custom-colour session can't grow it
// without bound. Patterns are cached per target context (visible/baseline/
// keyframe/export), since createPattern is bound to one context.
const MAX_TINTS = 24;
const tintCache = new Map<string, HTMLCanvasElement>();

function tintedTile(color: string): HTMLCanvasElement {
  const cached = tintCache.get(color);
  if (cached) {
    tintCache.delete(color);
    tintCache.set(color, cached);
    return cached;
  }
  const tooth = ensureToothTile();
  const canvas = document.createElement('canvas');
  canvas.width = tooth.width;
  canvas.height = tooth.height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(tooth, 0, 0);
  tintCache.set(color, canvas);
  if (tintCache.size > MAX_TINTS) tintCache.delete(tintCache.keys().next().value!);
  return canvas;
}

// Build a repeat pattern of the tinted tooth tile for one context. The grain
// scale + per-stroke phase is applied per op in paintCrayonOp (setTransform), so
// one cached pattern serves every stroke on that context.
function buildCrayonPattern(target: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  return target.createPattern(tintedTile(color), 'repeat');
}

const canTransformPattern = typeof DOMMatrix !== 'undefined';

// Drop every cache so the next paint rebuilds against new params. The pattern
// cache is a WeakMap keyed by live contexts and can't be iterated, so it's
// invalidated by bumping a generation token instead of clearing.
function invalidate() {
  toothTile = null;
  tintCache.clear();
  patternGeneration++;
}

let patternGeneration = 0;

// --- Painting -----------------------------------------------------------------

type ShapeOp = Extract<StrokeOp, { kind: 'dot' | 'path' }>;

// Paint one crayon op onto a target. Fills the op's bare geometry (a start dot or
// a stroked path) with the tooth pattern, source-over, at the op's stored deposit
// level. The op's stored per-stroke phase shifts the tooth so a later same-colour
// pass lands its peaks in the earlier pass's valleys — coating the bare-paper
// specks and building the body up at a constant hue. Returns false if the pattern
// can't be built (caller leaves the op unpainted, matching magic's contract).
export function paintCrayonOp(target: CanvasRenderingContext2D, op: ShapeOp): boolean {
  const pattern = patternForGeneration(target, op.color);
  if (!pattern) return false;
  if (canTransformPattern) {
    // Grain scale + per-stroke phase (a full-tile offset, so all phases are
    // reachable). Set every op from stored fields → deterministic replay.
    const period = CRAYON.tile * CRAYON.grain;
    const dx = (op.toothPhaseX ?? 0) * period;
    const dy = (op.toothPhaseY ?? 0) * period;
    pattern.setTransform(new DOMMatrix([CRAYON.grain, 0, 0, CRAYON.grain, dx, dy]));
  }
  const prevAlpha = target.globalAlpha;
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = op.depositLevel ?? CRAYON.deposit;
  if (op.kind === 'dot') {
    target.fillStyle = pattern;
    target.beginPath();
    target.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    target.fill();
  } else {
    target.strokeStyle = pattern;
    target.lineWidth = op.lineWidth;
    target.beginPath();
    target.moveTo(op.startX, op.startY);
    for (const s of op.segs) {
      if (s.c2x !== undefined) target.bezierCurveTo(s.cx, s.cy, s.c2x, s.c2y!, s.x, s.y);
      else target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
  target.globalAlpha = prevAlpha;
  return true;
}

// Pattern cache is invalidated by bumping a generation token (a WeakMap can't be
// cleared). Each target holds its patterns under the current generation.
const genPatternCache = new WeakMap<
  CanvasRenderingContext2D,
  { gen: number; byColor: Map<string, CanvasPattern> }
>();

function patternForGeneration(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  let entry = genPatternCache.get(target);
  if (!entry || entry.gen !== patternGeneration) {
    entry = { gen: patternGeneration, byColor: new Map() };
    genPatternCache.set(target, entry);
  }
  const cached = entry.byColor.get(color);
  if (cached) return cached;
  const pattern = buildCrayonPattern(target, color);
  if (pattern) entry.byColor.set(color, pattern);
  return pattern;
}

// --- Dev seam -----------------------------------------------------------------

// Override crayon look params at runtime and rebuild caches. Wired onto
// window.__engine only on /dev/engine (PUBLIC_ENABLE_DEV_HARNESS); production
// never calls it. Used to sweep the tooth/deposit look against reference images.
export function setCrayonParams(params: Partial<CrayonParams>) {
  Object.assign(CRAYON, params);
  invalidate();
}
