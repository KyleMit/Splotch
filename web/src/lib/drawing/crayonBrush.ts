// The crayon brush's waxy-paper texture.
//
// A crayon op is not a flat stroke: it deposits waxy colour that catches on the
// paper's tooth, so the body reads as dense wax with fine grain showing through,
// and building a second same-colour stroke over the first fills the tooth in
// *without* darkening the hue. Two mechanisms, both derived purely from stored op
// data so replay/export stay bit-identical (ADR-0033) and the render is
// deterministic (no Math.random/time — criterion in the crayon brief):
//
//   1. DEPOSIT — a colour tile whose texture lives entirely in the ALPHA channel
//      (RGB is the flat crayon colour everywhere). Because it's the pure colour,
//      painting it over the same colour is a no-op on hue (C over C = C at any
//      alpha) — overlap only raises coverage, never shifts/darkens the colour.
//      The tile is offset by a per-STROKE phase (from op.seed): every op in one
//      stroke shares the phase (no seams within a stroke), but a *different*
//      stroke lands a different phase, so its grain fills the first stroke's gaps
//      → live, gradual buildup at constant hue.
//
//   2. WEAVE CARVE — a low-frequency, colour-independent tile carved back out with
//      destination-out at phase 0 (paper-anchored: the tooth is a fixed property
//      of the sheet, identical for every stroke and colour). Its deepest valleys
//      stay open no matter how many passes build up, so heavy scribble never
//      flattens to a solid fill, and the coarse notches fray the stroke silhouette
//      into a broken-but-crisp edge. It reveals the paper layer beneath the
//      (transparent) canvas — exactly what real tooth does.
//
// This is the "two-octave tooth" the brief sketched (a coarse weave + a fine
// grain), with the split that makes buildup work: the fine grain is per-stroke
// (fills in), the coarse weave is paper-anchored (persists). Tuned against real
// crayon reference photos with an automated vision critic used as a regression
// signal.

import type { StrokeOp } from './strokeOps';

type ShapeOp = Extract<StrokeOp, { kind: 'dot' | 'path' }>;

// Texture constants (locked after iterating renders against real-crayon
// references). Cell sizes are expressed per renderScale unit so the physical
// tooth size is identical at 1× and 2× backing stores; `tile` and every cell stay
// integers that divide the tile, keeping the noise tiles seamless.
const TUNING = {
  tileUnit: 64, // tile = tileUnit * renderScale
  coarseDiv: 8, // coarse deposit octave cell = tile / coarseDiv
  fineDiv: 32, // fine grain octave
  microDiv: 64, // finest speckle octave
  coarseW: 0.06,
  fineW: 0.34,
  microW: 0.6,
  grainSharp: 0.28,
  thLo: 0.12,
  thHi: 0.5,
  floor: 0.35, // valley wax floor: keeps tooth a subtle density dip, not a white pinhole
  peak: 1.0,
  weaveDiv: 8, // paper weave cell = tile / weaveDiv
  weaveLo: 0.32, // weave values below this get carved out
  weaveBand: 0.16, // ramp width of the carve
  weaveMax: 0.44, // max carve strength (never fully to paper → subtle permanent tooth)
} as const;

let renderScale = 1;
let tile = TUNING.tileUnit;

export function setCrayonRenderScale(scale: number) {
  const next = Math.max(1, Math.round(scale));
  if (next === renderScale) return;
  renderScale = next;
  tile = TUNING.tileUnit * renderScale;
  // Cell sizes changed, so every cached tile/pattern is stale.
  depositTiles.clear();
  weaveTile = null;
  patternCaches = new WeakMap();
}

// Deterministic 32-bit integer hash → [0,1).
function hash01(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(seed | 0, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function smoothstep(a: number, b: number, x: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  return smooth((x - a) / (b - a));
}

// Value noise whose lattice wraps every `period` cells, so a tile of it is seamless.
function valueNoise(x: number, y: number, cell: number, period: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const wrap = (n: number) => ((n % period) + period) % period;
  const x0w = wrap(x0);
  const x1w = wrap(x0 + 1);
  const y0w = wrap(y0);
  const y1w = wrap(y0 + 1);
  const v00 = hash01(x0w, y0w, seed);
  const v10 = hash01(x1w, y0w, seed);
  const v01 = hash01(x0w, y1w, seed);
  const v11 = hash01(x1w, y1w, seed);
  const sx = smooth(fx);
  const sy = smooth(fy);
  const top = v00 * (1 - sx) + v10 * sx;
  const bot = v01 * (1 - sx) + v11 * sx;
  return top * (1 - sy) + bot * sy;
}

function makeTileCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = tile;
  cv.height = tile;
  return cv;
}

function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// The colour deposit tile: flat crayon RGB, tooth in the alpha channel.
function buildDepositTile(color: string): HTMLCanvasElement {
  const cv = makeTileCanvas();
  const g = cv.getContext('2d')!;
  const [r, gg, b] = parseColor(color);
  const img = g.createImageData(tile, tile);
  const d = img.data;
  const coarseCell = tile / TUNING.coarseDiv;
  const fineCell = tile / TUNING.fineDiv;
  const microCell = tile / TUNING.microDiv;
  const mid = (TUNING.thLo + TUNING.thHi) / 2;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const coarse = valueNoise(x, y, coarseCell, TUNING.coarseDiv, 1013);
      const fine = valueNoise(x, y, fineCell, TUNING.fineDiv, 2027);
      const micro = valueNoise(x, y, microCell, TUNING.microDiv, 3041);
      let tooth = TUNING.coarseW * coarse + TUNING.fineW * fine + TUNING.microW * micro;
      tooth = mid + (tooth - mid) * (1 + TUNING.grainSharp * 4);
      const a =
        TUNING.floor + (TUNING.peak - TUNING.floor) * smoothstep(TUNING.thLo, TUNING.thHi, tooth);
      const i = (y * tile + x) * 4;
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// The paper-weave carve tile (colour-independent): alpha = how much to remove.
function buildWeaveTile(): HTMLCanvasElement {
  const cv = makeTileCanvas();
  const g = cv.getContext('2d')!;
  const img = g.createImageData(tile, tile);
  const d = img.data;
  const cell = tile / TUNING.weaveDiv;
  const cell2 = cell / 2;
  const per = TUNING.weaveDiv;
  const per2 = TUNING.weaveDiv * 2;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const w =
        0.62 * valueNoise(x, y, cell, per, 5051) + 0.38 * valueNoise(x, y, cell2, per2, 6067);
      const carve = smoothstep(0, TUNING.weaveBand, TUNING.weaveLo - w) * TUNING.weaveMax;
      d[(y * tile + x) * 4 + 3] = Math.round(carve * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// Tiles are pure functions of (colour, renderScale) so they're cached process-wide;
// patterns are bound to a target context, so they're cached per context (the visible
// ctx almost always, plus baseline/keyframe/export contexts on replay), mirroring
// magicBrush.
const depositTiles = new Map<string, HTMLCanvasElement>();
let weaveTile: HTMLCanvasElement | null = null;

interface CtxPatterns {
  deposits: Map<string, CanvasPattern>;
  weave: CanvasPattern | null;
}
let patternCaches = new WeakMap<CanvasRenderingContext2D, CtxPatterns>();

function ctxPatterns(target: CanvasRenderingContext2D): CtxPatterns {
  let entry = patternCaches.get(target);
  if (!entry) {
    entry = { deposits: new Map(), weave: null };
    patternCaches.set(target, entry);
  }
  return entry;
}

function depositPattern(target: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const entry = ctxPatterns(target);
  const cached = entry.deposits.get(color);
  if (cached) return cached;
  let tileCanvas = depositTiles.get(color);
  if (!tileCanvas) {
    tileCanvas = buildDepositTile(color);
    depositTiles.set(color, tileCanvas);
  }
  const pattern = target.createPattern(tileCanvas, 'repeat');
  if (pattern) entry.deposits.set(color, pattern);
  return pattern;
}

// Pre-build the (renderScale-sized) weave tile and the deposit tiles for a set of
// colours, so the first stroke of a colour doesn't pay the tile's pixel loop on
// the draw hot path (a first-op spike under CPU throttle). The per-context
// patterns are still made lazily on first use, but those are cheap once the tile
// exists. Call from idle time; safe to call repeatedly.
export function warmCrayonTiles(colors: string[]) {
  if (!weaveTile) weaveTile = buildWeaveTile();
  for (const color of colors) {
    if (!depositTiles.has(color)) depositTiles.set(color, buildDepositTile(color));
  }
}

function weavePattern(target: CanvasRenderingContext2D): CanvasPattern | null {
  const entry = ctxPatterns(target);
  if (entry.weave) return entry.weave;
  if (!weaveTile) weaveTile = buildWeaveTile();
  const pattern = target.createPattern(weaveTile, 'repeat');
  if (pattern) entry.weave = pattern;
  return pattern;
}

// Per-stroke phase for the deposit tile: shared by every op of a stroke (same seed)
// so the grain is seamless within a stroke, and different between strokes so a
// second pass fills the first's tooth.
function phaseOffset(seed: number): DOMMatrix {
  const x = Math.floor(hash01(seed, 7, 91) * tile);
  const y = Math.floor(hash01(seed, 13, 91) * tile);
  return new DOMMatrix([1, 0, 0, 1, x, y]);
}

function fillShape(target: CanvasRenderingContext2D, op: ShapeOp, paint: string | CanvasPattern) {
  if (op.kind === 'dot') {
    target.fillStyle = paint;
    target.beginPath();
    target.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
    target.fill();
  } else {
    target.strokeStyle = paint;
    target.lineWidth = op.lineWidth;
    target.beginPath();
    target.moveTo(op.startX, op.startY);
    for (const s of op.segs) {
      if (s.c2x !== undefined) target.bezierCurveTo(s.cx, s.cy, s.c2x, s.c2y!, s.x, s.y);
      else target.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    }
    target.stroke();
  }
}

// Paint one crayon op: deposit the waxy colour, then carve the paper weave back out.
// Falls back to a flat fill only if patterns can't be created (createPattern null).
export function renderCrayonOp(target: CanvasRenderingContext2D, op: ShapeOp) {
  const deposit = depositPattern(target, op.color);
  if (!deposit) {
    // createPattern failed (should never happen for a valid tile) — lay the flat
    // colour so the stroke still paints.
    target.globalCompositeOperation = 'source-over';
    fillShape(target, op, op.color);
    return;
  }
  const seed = op.seed ?? 0;
  if (deposit.setTransform) deposit.setTransform(phaseOffset(seed));
  target.globalCompositeOperation = 'source-over';
  fillShape(target, op, deposit);

  const weave = weavePattern(target);
  if (weave) {
    // Phase 0 (paper-anchored): identity transform. Reset in case a prior stroke
    // left a phase on a shared pattern object.
    if (weave.setTransform) weave.setTransform(new DOMMatrix());
    target.globalCompositeOperation = 'destination-out';
    fillShape(target, op, weave);
  }
  target.globalCompositeOperation = 'source-over';
}
