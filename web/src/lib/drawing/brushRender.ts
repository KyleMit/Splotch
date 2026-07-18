// Per-op renderers for the textured brushes (crayon, watercolor), dispatched
// from renderOp() in strokeOps.ts. Kept in their own module so the drawing hot
// path's brush styling is isolated and independently unit-/perf-testable.
//
// THE INVARIANT (ADR-0033): renderOp() is the single renderer every surface
// shares — live drawing, undo/resize replay, and export all paint each op
// through it. So a brush renderer here MUST be a pure function of the op's
// stored fields plus the target's current pixels: same op → same pixels, every
// time. That is what keeps undo bit-identical. Concretely:
//   - No hidden per-stroke state that live drawing has but replay doesn't.
//   - Any randomness (crayon grain) must be DERIVED deterministically from the
//     op's geometry or baked once into a cached texture — never Math.random() at
//     render time, or a rebuild will differ from what the child drew.
//   - SSR-safety: the `/` route is prerendered (Node), and this module is on that
//     import graph, so NO `document`/canvas work at module top level — allocate
//     lazily on first use, exactly like magicBrush.ts.
//
// Each brush exposes numbered VARIANTS. Only one is active at a time
// (`activeVariant`); the dev harness can switch it via setBrushVariant() so a
// single production build can A/B every candidate under the profiler
// (`perf:brush`, mirrors setSimplifyParams / perf:sweep). Production ships the
// chosen default (ADR-0065).

import { paintOpShape, type InkOp } from './strokeOps';

export type TexturedBrush = 'crayon' | 'watercolor';

// The candidate implementation to use for each textured brush. Production
// defaults to the winner picked after profiling; the /dev harness overrides it.
// Winners picked via perf:brush (ADR-0065):
//   crayon → v2 (jittered multi-pass) — the only performant variant with a
//     visibly waxy, non-pen edge; grain-based v3/v4 read as near-solid at real
//     stroke widths, and v3 was 20–70× slower.
//   watercolor → v3 (feathered wet edge) — soft translucent edge that keeps the
//     picked colour with gentle overlap-pooling, and the cheapest variant. v2
//     (multiply) pooled harder but shifted the colour to navy; v4 (blurred stamp)
//     was 30–40× slower (an 84 ms jank frame, ~330 ms undo).
const activeVariant: Record<TexturedBrush, number> = {
  crayon: 2,
  watercolor: 3,
};

// Dev/profiling seam (mirrors engine.setSimplifyParams): pin which candidate a
// brush renders with so one build can sweep every variant. Production never
// calls this.
export function setBrushVariant(brush: TexturedBrush, variant: number) {
  activeVariant[brush] = variant;
}

export function getBrushVariant(brush: TexturedBrush): number {
  return activeVariant[brush];
}

type OpRenderer = (target: CanvasRenderingContext2D, op: InkOp) => void;

// --- Shared helpers ---------------------------------------------------------

// mulberry32: a tiny seeded PRNG, used only to BAKE fixed grain textures once
// (never at render time), so the speckle field is identical on every rebuild.
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

function rgbOf(hex: string): [number, number, number] {
  let h = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The op's control-point hull, padded to contain the round-capped stroke — the
// scratch-canvas box a self-contained (offscreen) brush renders into.
function opBounds(op: InkOp): [number, number, number, number] {
  if (op.kind === 'dot') {
    const pad = op.radius + 2;
    return [op.x - pad, op.y - pad, op.x + pad, op.y + pad];
  }
  const pad = op.lineWidth / 2 + 2;
  let minX = op.startX;
  let minY = op.startY;
  let maxX = op.startX;
  let maxY = op.startY;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const s of op.segs) {
    grow(s.cx, s.cy);
    grow(s.x, s.y);
    if (s.c2x !== undefined) grow(s.c2x, s.c2y!);
  }
  return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}

// One shared grow-only scratch canvas for the offscreen brushes, allocated lazily
// (SSR-safety) so no per-op allocation on the hot path.
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
function ensureScratch(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratchCtx = scratch.getContext('2d')!;
  }
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  return scratchCtx!;
}

// --- Crayon -----------------------------------------------------------------

// v1: plain solid stroke — the pen-equivalent baseline the bench compares against.
function crayonV1(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  paintOpShape(target, op, op.color);
}

// v2: jittered multi-pass wax. Stamp the op's exact geometry a few times —
// a darker narrow core plus lighter, wider, offset feather passes — so the
// misregistered translucent edges read as waxy, uneven crayon. Every offset,
// width wobble, and shade is a deterministic hash of the op's own geometry, so
// replay is bit-identical (ADR-0033). No offscreen canvas; source-over only.
const CRAYON_HASH_SEED = 0x9e3779b9;
function crayonMix(h: number, v: number): number {
  h = Math.imul(h ^ (v | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  return h >>> 0;
}
function crayonOpSeed(op: InkOp): number {
  if (op.kind === 'dot')
    return crayonMix(crayonMix(crayonMix(CRAYON_HASH_SEED, op.x * 8), op.y * 8), op.radius * 8);
  const last = op.segs.length ? op.segs[op.segs.length - 1] : { x: op.startX, y: op.startY };
  let h = crayonMix(CRAYON_HASH_SEED, op.startX * 8);
  h = crayonMix(h, op.startY * 8);
  h = crayonMix(h, last.x * 8);
  h = crayonMix(h, last.y * 8);
  return crayonMix(h, op.segs.length);
}
const crayonSignedUnit = (h: number) => (h & 0xffff) / 0x8000 - 1;
function crayonShade(hex: string, factor: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${Math.min(255, r * factor) | 0},${Math.min(255, g * factor) | 0},${Math.min(255, b * factor) | 0})`;
}
const CRAYON_PASSES = [
  { widthScale: 0.78, alpha: 0.85, offset: 0.4, shade: 0.82 },
  { widthScale: 1.0, alpha: 0.34, offset: 1.2, shade: 1.0 },
  { widthScale: 1.14, alpha: 0.22, offset: 1.8, shade: 1.07 },
];
function crayonV2(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  const seed = crayonOpSeed(op);
  const base = op.kind === 'dot' ? op.radius : op.lineWidth;
  for (let i = 0; i < CRAYON_PASSES.length; i++) {
    const p = CRAYON_PASSES[i];
    const jx = crayonSignedUnit(crayonMix(seed, i * 3 + 1)) * p.offset;
    const jy = crayonSignedUnit(crayonMix(seed, i * 3 + 2)) * p.offset;
    const wobble = 1 + crayonSignedUnit(crayonMix(seed, i * 3 + 3)) * 0.08;
    const size = Math.max(0.5, base * p.widthScale * wobble);
    const passOp: InkOp = op.kind === 'dot' ? { ...op, radius: size } : { ...op, lineWidth: size };
    target.globalAlpha = p.alpha;
    target.save();
    target.translate(jx, jy);
    paintOpShape(target, passOp, crayonShade(op.color, p.shade));
    target.restore();
  }
  target.globalAlpha = 1;
}

// v3: grain-stamp. Fill the op's exact geometry in op.color on the private
// scratch canvas, punch a cached grain tile out of it (destination-out), then
// blit the broken coverage onto the target (source-over — never touches other
// strokes' pixels). The grain lattice is anchored in op-coordinate space (the
// scratch is translated by -minX,-minY so the default-transform pattern samples
// each pixel at its true op coordinate), so it's stable across ops and replays.
const GRAIN_TILE = 64;
let grainTile: HTMLCanvasElement | null = null;
let grainPattern: CanvasPattern | null = null;
function buildGrainTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(GRAIN_TILE, GRAIN_TILE);
  const rand = mulberry32(0x9e3779b9);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = rand();
    // ~32% of texels are holes with varied bite, so the punched edges read as
    // waxy grain rather than a hard stipple. RGB is irrelevant under dest-out.
    data[i + 3] = r < 0.32 ? 90 + Math.floor(rand() * 150) : 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function crayonV3(target: CanvasRenderingContext2D, op: InkOp) {
  const [minX, minY, maxX, maxY] = opBounds(op);
  const w = Math.max(1, Math.ceil(maxX - minX));
  const h = Math.max(1, Math.ceil(maxY - minY));
  const sctx = ensureScratch(w, h);
  if (!grainTile) grainTile = buildGrainTile();
  if (!grainPattern) grainPattern = sctx.createPattern(grainTile, 'repeat');

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.clearRect(0, 0, w, h);
  sctx.translate(-minX, -minY);
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';
  sctx.globalCompositeOperation = 'source-over';
  paintOpShape(sctx, op, op.color);
  sctx.globalCompositeOperation = 'destination-out';
  sctx.fillStyle = grainPattern!;
  sctx.fillRect(minX, minY, w, h);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over';

  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  target.drawImage(scratch!, 0, 0, w, h, minX, minY, w, h);
}

// v4: tinted-grain strokeStyle. Paint a faint solid base of op.color, then stroke
// the op with a per-color CanvasPattern whose grain leaves waxy transparent gaps.
// The grain mask is baked once; each color's tile is cached (LRU) and the pattern
// keeps the target's default transform, so the lattice tiles from the paper origin
// — seamless across ops and identical on replay.
const CRAYON4_TILE = 64;
const CRAYON4_BASE_ALPHA = 0.22;
const CRAYON4_MAX_TILES = 24;
let crayon4Grain: Uint8ClampedArray | null = null;
function crayon4GrainMask(): Uint8ClampedArray {
  if (crayon4Grain) return crayon4Grain;
  const rand = mulberry32(0x85ebca6b);
  const a = new Uint8ClampedArray(CRAYON4_TILE * CRAYON4_TILE);
  for (let i = 0; i < a.length; i++) {
    const r = rand();
    a[i] = r < 0.14 ? 0 : r < 0.4 ? 90 + rand() * 90 : 210 + rand() * 45;
  }
  crayon4Grain = a;
  return a;
}
const crayon4Tiles = new Map<string, HTMLCanvasElement>();
function crayon4Tile(color: string): HTMLCanvasElement {
  const cached = crayon4Tiles.get(color);
  if (cached) {
    crayon4Tiles.delete(color);
    crayon4Tiles.set(color, cached);
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = CRAYON4_TILE;
  canvas.height = CRAYON4_TILE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(CRAYON4_TILE, CRAYON4_TILE);
  const mask = crayon4GrainMask();
  const [r, g, b] = rgbOf(color);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = mask[i];
  }
  ctx.putImageData(img, 0, 0);
  crayon4Tiles.set(color, canvas);
  if (crayon4Tiles.size > CRAYON4_MAX_TILES) crayon4Tiles.delete(crayon4Tiles.keys().next().value!);
  return canvas;
}
function crayonV4(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = CRAYON4_BASE_ALPHA;
  paintOpShape(target, op, op.color);
  target.globalAlpha = 1;
  const pattern = target.createPattern(crayon4Tile(op.color), 'repeat');
  paintOpShape(target, op, pattern ?? op.color);
}

// v5: canvas-anchored crisp grain, source-over overlay. A continuous opaque wax
// base (op.color, shared round caps → no per-op beads) overstroked with the SAME
// geometry using a CanvasPattern of baked crisp speckles. The pattern keeps the
// target's transform, so the grain lattice tiles from the paper origin — seamless
// across ops and bit-identical on replay (ADR-0033). Per-color tiles are baked once
// from a seeded PRNG and cached (LRU); no Math.random / offscreen dest-out at render.
const C5_TILE = 64;
const C5_MAX_TILES = 24;
const C5_GRAIN_ALPHA = 0.92;

function c5Tint(
  base: [number, number, number],
  to: [number, number, number],
  t: number,
  a: number
) {
  const r = (base[0] + (to[0] - base[0]) * t) | 0;
  const g = (base[1] + (to[1] - base[1]) * t) | 0;
  const b = (base[2] + (to[2] - base[2]) * t) | 0;
  return `rgba(${r},${g},${b},${a})`;
}

interface C5Speckle {
  x: number;
  y: number;
  r: number;
  a: number;
}

// Baked once: irregular (not gridded) speckle fields — a denser darker-wax mottle
// and a lighter paper-tooth fleck field. Positions/sizes/alphas are fixed so every
// per-color tile shares one lattice and caching only re-tints.
let c5Fields: { dark: C5Speckle[]; light: C5Speckle[] } | null = null;
function c5SpeckleFields() {
  if (c5Fields) return c5Fields;
  const rand = mulberry32(0x1a2b3c4d);
  const make = (count: number, aMin: number, aSpan: number): C5Speckle[] => {
    const out: C5Speckle[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        x: rand() * C5_TILE,
        y: rand() * C5_TILE,
        r: 0.8 + rand() * 2.0,
        a: aMin + rand() * aSpan,
      });
    }
    return out;
  };
  c5Fields = { dark: make(150, 0.3, 0.5), light: make(132, 0.35, 0.5) };
  return c5Fields;
}

// Draw one speckle plus wrapped copies so the tile repeats seamlessly.
function c5Stamp(ctx: CanvasRenderingContext2D, s: C5Speckle) {
  for (let dx = -C5_TILE; dx <= C5_TILE; dx += C5_TILE) {
    for (let dy = -C5_TILE; dy <= C5_TILE; dy += C5_TILE) {
      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const c5Tiles = new Map<string, HTMLCanvasElement>();
function c5Tile(color: string): HTMLCanvasElement {
  const cached = c5Tiles.get(color);
  if (cached) {
    c5Tiles.delete(color);
    c5Tiles.set(color, cached);
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = C5_TILE;
  canvas.height = C5_TILE;
  const ctx = canvas.getContext('2d')!;
  const base = rgbOf(color);
  const { dark, light } = c5SpeckleFields();
  for (const s of dark) {
    ctx.fillStyle = c5Tint(base, [0, 0, 0], 0.34, s.a);
    c5Stamp(ctx, s);
  }
  for (const s of light) {
    ctx.fillStyle = c5Tint(base, [255, 255, 255], 0.6, s.a);
    c5Stamp(ctx, s);
  }
  c5Tiles.set(color, canvas);
  if (c5Tiles.size > C5_MAX_TILES) c5Tiles.delete(c5Tiles.keys().next().value!);
  return canvas;
}

function crayonV5(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  paintOpShape(target, op, op.color);
  const pattern = target.createPattern(c5Tile(op.color), 'repeat');
  if (pattern) {
    target.globalAlpha = C5_GRAIN_ALPHA;
    paintOpShape(target, op, pattern);
    target.globalAlpha = 1;
  }
}

// v6: offscreen ragged-edge wax. Paint the op as a solid wax body on a private
// scratch, then punch canvas-anchored hard grain out of it (crisp broken tooth +
// ragged rim), keep the spine dense, and mottle within the shape's alpha. All
// grain is baked once from a seeded PRNG and sampled in op-space (the scratch is
// translated by -minX,-minY), so replay is bit-identical and continuous across
// ops (ADR-0033). Blit source-over (never corrupts other strokes).
const C6_TILE = 96;
function c6Bounds(op: InkOp): [number, number, number, number] {
  if (op.kind === 'dot') {
    const pad = op.radius + 2;
    return [op.x - pad, op.y - pad, op.x + pad, op.y + pad];
  }
  const pad = op.lineWidth / 2 + 2;
  let minX = op.startX;
  let minY = op.startY;
  let maxX = op.startX;
  let maxY = op.startY;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const seg of op.segs) {
    grow(seg.cx, seg.cy);
    grow(seg.x, seg.y);
    if (seg.c2x !== undefined) grow(seg.c2x, seg.c2y!);
  }
  return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}
let c6Scratch: HTMLCanvasElement | null = null;
let c6Ctx: CanvasRenderingContext2D | null = null;
function c6EnsureScratch(w: number, h: number): CanvasRenderingContext2D {
  if (!c6Scratch) {
    c6Scratch = document.createElement('canvas');
    c6Ctx = c6Scratch.getContext('2d')!;
  }
  if (c6Scratch.width < w) c6Scratch.width = w;
  if (c6Scratch.height < h) c6Scratch.height = h;
  return c6Ctx!;
}
// Hard-edged holes with clustered coverage (8px coarse cells) so the bite reads as
// waxy tooth, not per-pixel noise. Only alpha matters (dest-out).
function c6HoleTile(
  seed: number,
  coverage: number,
  aMin: number,
  aRange: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = C6_TILE;
  c.height = C6_TILE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(C6_TILE, C6_TILE);
  const rand = mulberry32(seed);
  const cells = C6_TILE >> 3;
  const coarse = new Float32Array(cells * cells);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rand();
  const d = img.data;
  for (let y = 0; y < C6_TILE; y++) {
    for (let x = 0; x < C6_TILE; x++) {
      const cb = coarse[(y >> 3) * cells + (x >> 3)];
      const p = coverage * (0.35 + 1.35 * cb);
      const o = (y * C6_TILE + x) * 4;
      d[o + 3] = rand() < p ? (aMin + rand() * aRange) | 0 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Dark pressure specks composited source-atop (stays inside the wax alpha).
function c6MottleTile(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = C6_TILE;
  c.height = C6_TILE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(C6_TILE, C6_TILE);
  const rand = mulberry32(seed);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = rand() < 0.42 ? (20 + rand() * 55) | 0 : 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function c6Core(op: InkOp, scale: number): InkOp {
  return op.kind === 'dot'
    ? { ...op, radius: Math.max(0.5, op.radius * scale) }
    : { ...op, lineWidth: Math.max(0.5, op.lineWidth * scale) };
}
let c6Coarse: HTMLCanvasElement | null = null;
let c6Fine: HTMLCanvasElement | null = null;
let c6Mottle: HTMLCanvasElement | null = null;
let c6CoarsePat: CanvasPattern | null = null;
let c6FinePat: CanvasPattern | null = null;
let c6MottlePat: CanvasPattern | null = null;
function crayonV6(target: CanvasRenderingContext2D, op: InkOp) {
  const [minX, minY, maxX, maxY] = c6Bounds(op);
  const w = Math.max(1, Math.ceil(maxX - minX));
  const h = Math.max(1, Math.ceil(maxY - minY));
  const s = c6EnsureScratch(w, h);
  if (!c6Coarse) {
    c6Coarse = c6HoleTile(0x1a2b3c4d, 0.42, 120, 135);
    c6Fine = c6HoleTile(0x51ed270b, 0.2, 70, 120);
    c6Mottle = c6MottleTile(0x9e3779b9);
  }
  if (!c6CoarsePat) c6CoarsePat = s.createPattern(c6Coarse, 'repeat');
  if (!c6FinePat) c6FinePat = s.createPattern(c6Fine!, 'repeat');
  if (!c6MottlePat) c6MottlePat = s.createPattern(c6Mottle!, 'repeat');

  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 1;
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, w, h);
  s.translate(-minX, -minY);
  s.lineCap = 'round';
  s.lineJoin = 'round';
  paintOpShape(s, op, op.color);
  s.globalCompositeOperation = 'destination-out';
  s.fillStyle = c6CoarsePat!;
  s.fillRect(minX, minY, w, h);
  s.globalCompositeOperation = 'source-over';
  paintOpShape(s, c6Core(op, 0.6), op.color);
  s.globalCompositeOperation = 'destination-out';
  s.fillStyle = c6FinePat!;
  s.fillRect(minX, minY, w, h);
  s.globalCompositeOperation = 'source-atop';
  s.fillStyle = c6MottlePat!;
  s.fillRect(minX, minY, w, h);
  s.restore();
  s.globalCompositeOperation = 'source-over';

  target.save();
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  target.drawImage(c6Scratch!, 0, 0, w, h, minX, minY, w, h);
  target.restore();
}

// v7: stippled scumble. Rasterise the op's coverage region into a fixed paper-space
// cell grid; each covered cell paints ONE crisp filled circle whose jitter/size/
// shade/alpha and keep-decision are a pure hash of its quantized (canvas-space) cell
// coordinate. Because a mark is a function of the cell — not the op — overlapping ops
// paint identical marks (seam-free, no cap beads), the surviving rim specks form no
// periodic pattern, and dense overlapping opaque cores read as crisp wax, not blur.
// A coverage falloff toward the rim leaves a ragged, broken-pigment edge. source-over.
const C7_G = 2;
const C7_LSTEP = 1.6;
const C7_JIT = C7_G * 0.55;
const C7_MARK_MIN = 1.0;
const C7_MARK_SPAN = 0.9;
const C7_A_MIN = 0.72;
const C7_A_SPAN = 0.26;
const C7_SHADES = 12;
const C7_MAX_MARKS = 5000;
const C7_S_COV = 0x1b56c4f9;
const C7_S_JX = 0x7feb352d;
const C7_S_JY = 0x846ca68b;
const C7_S_R = 0xc2b2ae35;
const C7_S_A = 0x9e3779b1;
const C7_S_S = 0x85ebca77;
function c7cell(qx: number, qy: number): number {
  let h = Math.imul((qx | 0) ^ 0x9e3779b9, 0x85ebca77);
  h = Math.imul(h ^ (qy | 0) ^ 0xc2b2ae3d, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}
function c7chan(base: number, salt: number): number {
  let h = Math.imul(base ^ salt, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function c7shades(color: string): string[] {
  const [r, g, b] = rgbOf(color);
  const out = new Array<string>(C7_SHADES);
  for (let i = 0; i < C7_SHADES; i++) {
    const f = 0.8 + (i / (C7_SHADES - 1)) * 0.36;
    out[i] =
      `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
  }
  return out;
}
function crayonV7(target: CanvasRenderingContext2D, op: InkOp) {
  target.save();
  target.globalCompositeOperation = 'source-over';
  const shades = c7shades(op.color);
  const visited = new Set<number>();
  let drawn = 0;
  let full = false;
  const drawCell = (bx: number, by: number, u: number) => {
    if (full) return;
    const qx = Math.round(bx / C7_G);
    const qy = Math.round(by / C7_G);
    const key = ((qx & 0xffff) << 16) | (qy & 0xffff);
    if (visited.has(key)) return;
    visited.add(key);
    const base = c7cell(qx, qy);
    const cov = 1.18 - 1.05 * u * u;
    if (c7chan(base, C7_S_COV) >= cov) return;
    const jx = (c7chan(base, C7_S_JX) * 2 - 1) * C7_JIT;
    const jy = (c7chan(base, C7_S_JY) * 2 - 1) * C7_JIT;
    const r = C7_MARK_MIN + c7chan(base, C7_S_R) * C7_MARK_SPAN;
    const a = C7_A_MIN + c7chan(base, C7_S_A) * C7_A_SPAN;
    const idx = (c7chan(base, C7_S_S) * C7_SHADES) | 0;
    target.globalAlpha = a;
    target.fillStyle = shades[idx];
    target.beginPath();
    target.arc(qx * C7_G + jx, qy * C7_G + jy, r, 0, Math.PI * 2);
    target.fill();
    if (++drawn >= C7_MAX_MARKS) full = true;
  };
  if (op.kind === 'dot') {
    const hw = Math.max(0.5, op.radius);
    const Jr = Math.ceil(hw / C7_LSTEP);
    for (let gx = -Jr; gx <= Jr && !full; gx++) {
      for (let gy = -Jr; gy <= Jr; gy++) {
        const lx = gx * C7_LSTEP;
        const ly = gy * C7_LSTEP;
        const d = Math.hypot(lx, ly);
        if (d > hw + C7_G) continue;
        drawCell(op.x + lx, op.y + ly, Math.min(1.05, d / hw));
        if (full) break;
      }
    }
  } else {
    const hw = Math.max(0.5, op.lineWidth / 2);
    const J = Math.ceil(hw / C7_LSTEP);
    const scatter = (px: number, py: number, nx: number, ny: number) => {
      for (let j = -J; j <= J; j++) {
        const lat = j * C7_LSTEP;
        drawCell(px + nx * lat, py + ny * lat, Math.min(1.05, Math.abs(lat) / hw));
        if (full) return;
      }
    };
    let x0 = op.startX;
    let y0 = op.startY;
    for (const seg of op.segs) {
      const cx = seg.cx;
      const cy = seg.cy;
      const x1 = seg.x;
      const y1 = seg.y;
      const cubic = seg.c2x !== undefined;
      const c2x = cubic ? seg.c2x! : 0;
      const c2y = cubic ? seg.c2y! : 0;
      const approx = cubic
        ? Math.hypot(cx - x0, cy - y0) +
          Math.hypot(c2x - cx, c2y - cy) +
          Math.hypot(x1 - c2x, y1 - c2y)
        : Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
      const steps = Math.max(1, Math.ceil(approx / C7_LSTEP));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        let px, py, dx, dy;
        if (cubic) {
          const a = mt * mt * mt;
          const b = 3 * mt * mt * t;
          const c = 3 * mt * t * t;
          const dd = t * t * t;
          px = a * x0 + b * cx + c * c2x + dd * x1;
          py = a * y0 + b * cy + c * c2y + dd * y1;
          dx = 3 * mt * mt * (cx - x0) + 6 * mt * t * (c2x - cx) + 3 * t * t * (x1 - c2x);
          dy = 3 * mt * mt * (cy - y0) + 6 * mt * t * (c2y - cy) + 3 * t * t * (y1 - c2y);
        } else {
          const a = mt * mt;
          const b = 2 * mt * t;
          const c = t * t;
          px = a * x0 + b * cx + c * x1;
          py = a * y0 + b * cy + c * y1;
          dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
          dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
        }
        let tl = Math.hypot(dx, dy);
        if (tl < 1e-6) {
          dx = x1 - x0;
          dy = y1 - y0;
          tl = Math.hypot(dx, dy) || 1;
        }
        scatter(px, py, -dy / tl, dx / tl);
        if (full) break;
      }
      x0 = x1;
      y0 = y1;
      if (full) break;
    }
  }
  target.restore();
}

// v8 "waxy stipple": opaque waxy body + crisp directional paper-tooth grain,
// ragged clamped edge, no halo/blur/beads/spray. A solid base is laid by the op's
// exact geometry (0.78× width), then canvas-cell-hashed stipple on top — every
// mark's keep/jitter/size/shade is a pure hash of its quantized canvas cell, so
// overlapping per-frame ops paint identical, non-periodic marks (seam-free, no
// beads; bit-identical replay, ADR-0033). Interior cells mottle; rim cells fray
// with a coverage falloff, clamped to <= hw so nothing sprays past the edge.
// Marks are hard-edged ellipses elongated along the tangent (dragged wax, not
// spatter). Self-contained source-over; SSR-safe; no Math.random.
const C8_G = 1;
const C8_LSTEP = 1.4;
const C8_JIT = 0.45;
const C8_CORE = 0.72;
const C8_BASE_SCALE = 0.78;
const C8_SHADES = 14;
const C8_MAX_MARKS = 6000;
const C8_TAU = Math.PI * 2;
const C8_S_COV = 0x1b56c4f9;
const C8_S_JX = 0x7feb352d;
const C8_S_JY = 0x846ca68b;
const C8_S_R = 0xc2b2ae35;
const C8_S_A = 0x9e3779b1;
const C8_S_SH = 0x85ebca77;
const C8_S_EL = 0x2545f4d1;
function c8cell(qx: number, qy: number): number {
  let h = Math.imul((qx | 0) ^ 0x9e3779b9, 0x85ebca77);
  h = Math.imul(h ^ (qy | 0) ^ 0xc2b2ae3d, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}
function c8chan(base: number, salt: number): number {
  let h = Math.imul(base ^ salt, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function c8shades(color: string): string[] {
  const [r, g, b] = rgbOf(color);
  const out = new Array<string>(C8_SHADES);
  for (let i = 0; i < C8_SHADES; i++) {
    const f = 0.74 + (i / (C8_SHADES - 1)) * 0.42;
    out[i] =
      `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
  }
  return out;
}
function c8Core(op: InkOp, scale: number): InkOp {
  return op.kind === 'dot'
    ? { ...op, radius: Math.max(0.5, op.radius * scale) }
    : { ...op, lineWidth: Math.max(0.5, op.lineWidth * scale) };
}
function crayonV8(target: CanvasRenderingContext2D, op: InkOp) {
  target.save();
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  target.lineCap = 'round';
  target.lineJoin = 'round';
  paintOpShape(target, c8Core(op, C8_BASE_SCALE), op.color);

  const shades = c8shades(op.color);
  const visited = new Set<number>();
  let drawn = 0;
  let full = false;
  const drawCell = (px: number, py: number, u: number, tx: number, ty: number) => {
    if (full) return;
    const qx = Math.round(px / C8_G);
    const qy = Math.round(py / C8_G);
    const key = ((qx & 0xffff) << 16) | (qy & 0xffff);
    if (visited.has(key)) return;
    visited.add(key);
    const base = c8cell(qx, qy);
    let cov, ry, elong, aMin, aSpan;
    if (u >= C8_CORE) {
      const t = Math.min(1, (u - C8_CORE) / (1.12 - C8_CORE));
      cov = 0.12 + 0.72 * (1 - t);
      ry = 0.55 + 0.55 * (1 - t) + c8chan(base, C8_S_R) * 0.35;
      elong = 2.4 + c8chan(base, C8_S_EL) * 1.0;
      aMin = 0.66;
      aSpan = 0.3;
    } else {
      cov = 0.4;
      ry = 0.85 + c8chan(base, C8_S_R) * 0.85;
      elong = 1.8 + c8chan(base, C8_S_EL) * 0.9;
      aMin = 0.32;
      aSpan = 0.3;
    }
    if (c8chan(base, C8_S_COV) >= cov) return;
    const jx = (c8chan(base, C8_S_JX) * 2 - 1) * C8_JIT;
    const jy = (c8chan(base, C8_S_JY) * 2 - 1) * C8_JIT;
    const a = aMin + c8chan(base, C8_S_A) * aSpan;
    const sh = (c8chan(base, C8_S_SH) * C8_SHADES) | 0;
    target.globalAlpha = a;
    target.fillStyle = shades[sh];
    target.beginPath();
    target.ellipse(qx * C8_G + jx, qy * C8_G + jy, ry * elong, ry, Math.atan2(ty, tx), 0, C8_TAU);
    target.fill();
    if (++drawn >= C8_MAX_MARKS) full = true;
  };
  if (op.kind === 'dot') {
    const hw = Math.max(0.5, op.radius);
    const R = hw + 0.2;
    const J = Math.ceil(R / C8_LSTEP);
    for (let gx = -J; gx <= J && !full; gx++) {
      for (let gy = -J; gy <= J; gy++) {
        const lx = gx * C8_LSTEP;
        const ly = gy * C8_LSTEP;
        const d = Math.hypot(lx, ly);
        if (d > R) continue;
        const inv = d > 1e-6 ? 1 / d : 0;
        drawCell(op.x + lx, op.y + ly, Math.min(1.1, d / hw), -ly * inv || 1, lx * inv);
        if (full) break;
      }
    }
  } else {
    const hw = Math.max(0.5, op.lineWidth / 2);
    const latMax = hw + 0.2;
    const J = Math.ceil(latMax / C8_LSTEP);
    const scatter = (px: number, py: number, nx: number, ny: number, tx: number, ty: number) => {
      for (let j = -J; j <= J; j++) {
        const lat = j * C8_LSTEP;
        if (Math.abs(lat) > latMax) continue;
        drawCell(px + nx * lat, py + ny * lat, Math.min(1.1, Math.abs(lat) / hw), tx, ty);
        if (full) return;
      }
    };
    let x0 = op.startX;
    let y0 = op.startY;
    for (const seg of op.segs) {
      const cx = seg.cx;
      const cy = seg.cy;
      const x1 = seg.x;
      const y1 = seg.y;
      const cubic = seg.c2x !== undefined;
      const c2x = cubic ? seg.c2x! : 0;
      const c2y = cubic ? seg.c2y! : 0;
      const approx = cubic
        ? Math.hypot(cx - x0, cy - y0) +
          Math.hypot(c2x - cx, c2y - cy) +
          Math.hypot(x1 - c2x, y1 - c2y)
        : Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
      const steps = Math.max(1, Math.ceil(approx / C8_LSTEP));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        let px, py, dx, dy;
        if (cubic) {
          const a = mt * mt * mt;
          const b = 3 * mt * mt * t;
          const c = 3 * mt * t * t;
          const dd = t * t * t;
          px = a * x0 + b * cx + c * c2x + dd * x1;
          py = a * y0 + b * cy + c * c2y + dd * y1;
          dx = 3 * mt * mt * (cx - x0) + 6 * mt * t * (c2x - cx) + 3 * t * t * (x1 - c2x);
          dy = 3 * mt * mt * (cy - y0) + 6 * mt * t * (c2y - cy) + 3 * t * t * (y1 - c2y);
        } else {
          const a = mt * mt;
          const b = 2 * mt * t;
          const c = t * t;
          px = a * x0 + b * cx + c * x1;
          py = a * y0 + b * cy + c * y1;
          dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
          dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
        }
        let tl = Math.hypot(dx, dy);
        if (tl < 1e-6) {
          dx = x1 - x0;
          dy = y1 - y0;
          tl = Math.hypot(dx, dy) || 1;
        }
        const txn = dx / tl;
        const tyn = dy / tl;
        scatter(px, py, -tyn, txn, txn, tyn);
        if (full) break;
      }
      x0 = x1;
      y0 = y1;
      if (full) break;
    }
  }
  target.restore();
}

// --- Watercolor -------------------------------------------------------------

// v1: plain solid stroke — the pen-equivalent baseline the bench compares against.
function watercolorV1(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  paintOpShape(target, op, op.color);
}

// v2: multiply wash. Two concentric 'multiply' passes (a wide faint bleed under a
// narrower denser core) give a soft translucent wash that darkens — pools —
// wherever the child crosses earlier ink, like layered watercolor. Each op is a
// single stroke() per pass, so there's no within-op accumulation; the passes stay
// on the target (no offscreen blit) to keep the pointermove path cheap. multiply
// on the transparent paper acts like source-over on untouched pixels, so the first
// wash isn't darkened against nothing. A few granulation specks are hashed from op
// geometry, so replay is bit-identical (ADR-0033). (WATER_HASH_SEED / waterSignedUnit
// are shared with v3, declared below.)
const WATER_PASSES = [
  { widthScale: 1.75, alpha: 0.18 },
  { widthScale: 1.0, alpha: 0.5 },
];
const WATER_SPECK_ALPHA = 0.1;
function waterHash(h: number, v: number): number {
  h = Math.imul(h ^ (v | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  return h >>> 0;
}
function waterDarken(hex: string, factor: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${(r * factor) | 0},${(g * factor) | 0},${(b * factor) | 0})`;
}
function waterSized(op: InkOp, scale: number): InkOp {
  return op.kind === 'dot'
    ? { ...op, radius: op.radius * scale }
    : { ...op, lineWidth: op.lineWidth * scale };
}
function waterGranulate(target: CanvasRenderingContext2D, op: InkOp, size: number) {
  if (size < 6) return;
  const speck = size * 0.14;
  target.globalAlpha = WATER_SPECK_ALPHA;
  target.fillStyle = waterDarken(op.color, 0.7);
  const stamp = (px: number, py: number, seed: number) => {
    const jx = waterSignedUnit(waterHash(seed, 1)) * size * 0.35;
    const jy = waterSignedUnit(waterHash(seed, 2)) * size * 0.35;
    target.beginPath();
    target.arc(px + jx, py + jy, speck, 0, Math.PI * 2);
    target.fill();
  };
  if (op.kind === 'dot') {
    stamp(op.x, op.y, waterHash(WATER_HASH_SEED, (op.x + op.y) * 8));
  } else {
    const n = op.segs.length;
    const step = Math.max(1, Math.floor(n / 3));
    for (let i = 0; i < n; i += step) {
      const s = op.segs[i];
      stamp(s.x, s.y, waterHash(waterHash(WATER_HASH_SEED, s.x * 8), s.y * 8));
    }
  }
}
function watercolorV2(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'multiply';
  const base = op.kind === 'dot' ? op.radius : op.lineWidth;
  for (const p of WATER_PASSES) {
    target.globalAlpha = p.alpha;
    paintOpShape(target, p.widthScale === 1 ? op : waterSized(op, p.widthScale), op.color);
  }
  waterGranulate(target, op, base);
  target.globalAlpha = 1;
}

// v3: feathered wet edge. Stroke the op's geometry several times from a wide,
// faint outer halo down to a narrow, stronger core; the stacked translucent
// source-over bands fake a soft gaussian falloff (a wet, bleeding edge) far
// cheaper than a real blur. Per-band alphas stay low so a lone stroke reads as a
// watery wash and self-crossings pool without hard beads. A sub-pixel edge wobble
// hashed from op geometry keeps the edge from being a perfect ellipse; every
// offset/width is a deterministic hash of the op's fields, so replay is
// bit-identical (ADR-0033). No offscreen canvas, source-over only.
const WATER_HASH_SEED = 0x632be5ab;
function waterMix(h: number, v: number): number {
  h = Math.imul(h ^ (v | 0), 0x2c1b3c6d);
  h ^= h >>> 13;
  return h >>> 0;
}
function waterOpSeed(op: InkOp): number {
  if (op.kind === 'dot')
    return waterMix(waterMix(waterMix(WATER_HASH_SEED, op.x * 8), op.y * 8), op.radius * 8);
  const last = op.segs.length ? op.segs[op.segs.length - 1] : { x: op.startX, y: op.startY };
  let h = waterMix(WATER_HASH_SEED, op.startX * 8);
  h = waterMix(h, op.startY * 8);
  h = waterMix(h, last.x * 8);
  h = waterMix(h, last.y * 8);
  return waterMix(h, op.segs.length);
}
const waterSignedUnit = (h: number) => (h & 0xffff) / 0x8000 - 1;
const WATER_BANDS = [
  { widthScale: 1.55, alpha: 0.09, wobble: 0.6 },
  { widthScale: 1.2, alpha: 0.11, wobble: 0.45 },
  { widthScale: 0.85, alpha: 0.13, wobble: 0.3 },
  { widthScale: 0.55, alpha: 0.16, wobble: 0.2 },
];
function watercolorV3(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  const seed = waterOpSeed(op);
  const base = op.kind === 'dot' ? op.radius : op.lineWidth;
  for (let i = 0; i < WATER_BANDS.length; i++) {
    const b = WATER_BANDS[i];
    const jx = waterSignedUnit(waterMix(seed, i * 2 + 1)) * b.wobble;
    const jy = waterSignedUnit(waterMix(seed, i * 2 + 2)) * b.wobble;
    const size = Math.max(0.5, base * b.widthScale);
    const bandOp: InkOp = op.kind === 'dot' ? { ...op, radius: size } : { ...op, lineWidth: size };
    target.globalAlpha = b.alpha;
    target.save();
    target.translate(jx, jy);
    paintOpShape(target, bandOp, op.color);
    target.restore();
  }
  target.globalAlpha = 1;
}

// v4: blurred soft stamp. Render the op as a diffuse blob on the scratch canvas —
// via shadowBlur (NOT ctx.filter, which the iOS 16.4 floor lacks — Safari added it
// in 17): the op is drawn off-box and its blurred, op.color shadow is offset back
// into view, so only the soft halo lands. Then blit onto the target translucently
// with 'multiply', so a single wash stays soft but crossing strokes pool/darken.
// Pure function of the op's fields (the scratch is redrawn per op), so bit-identical
// on replay. The heaviest candidate — a real per-op blur.
const WC_BLUR_FRAC = 0.35;
const WC_BLUR_MIN = 1.5;
const WC_BLUR_MAX = 7;
const WC_WASH_ALPHA = 0.62;
function wcBlurRadius(op: InkOp): number {
  const base = op.kind === 'dot' ? op.radius : op.lineWidth;
  return Math.min(WC_BLUR_MAX, base * WC_BLUR_FRAC + WC_BLUR_MIN);
}
function wcBounds(op: InkOp): [number, number, number, number] {
  const blur = wcBlurRadius(op);
  if (op.kind === 'dot') {
    const pad = op.radius + blur + 2;
    return [op.x - pad, op.y - pad, op.x + pad, op.y + pad];
  }
  const pad = op.lineWidth / 2 + blur + 2;
  let minX = op.startX;
  let minY = op.startY;
  let maxX = op.startX;
  let maxY = op.startY;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const s of op.segs) {
    grow(s.cx, s.cy);
    grow(s.x, s.y);
    if (s.c2x !== undefined) grow(s.c2x, s.c2y!);
  }
  return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}
function watercolorV4(target: CanvasRenderingContext2D, op: InkOp) {
  const [minX, minY, maxX, maxY] = wcBounds(op);
  const w = Math.max(1, Math.ceil(maxX - minX));
  const h = Math.max(1, Math.ceil(maxY - minY));
  const sctx = ensureScratch(w, h);

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, w, h);
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';

  // Draw the shape off the left of the box (shifted by -off) and offset its
  // blurred shadow back by +off, so only the soft op.color halo lands in-box.
  const off = w + 64;
  sctx.shadowColor = op.color;
  sctx.shadowBlur = wcBlurRadius(op);
  sctx.shadowOffsetX = off;
  sctx.translate(-minX - off, -minY);
  paintOpShape(sctx, op, op.color);
  sctx.shadowColor = 'transparent';
  sctx.shadowBlur = 0;
  sctx.shadowOffsetX = 0;
  sctx.setTransform(1, 0, 0, 1, 0, 0);

  target.globalCompositeOperation = 'multiply';
  target.globalAlpha = WC_WASH_ALPHA;
  target.drawImage(scratch!, 0, 0, w, h, minX, minY, w, h);
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
}

// --- Dispatch ---------------------------------------------------------------

const CRAYON_VARIANTS: Record<number, OpRenderer> = {
  1: crayonV1,
  2: crayonV2,
  3: crayonV3,
  4: crayonV4,
  5: crayonV5,
  6: crayonV6,
  7: crayonV7,
  8: crayonV8,
};

const WATERCOLOR_VARIANTS: Record<number, OpRenderer> = {
  1: watercolorV1,
  2: watercolorV2,
  3: watercolorV3,
  4: watercolorV4,
};

const VARIANTS: Record<TexturedBrush, Record<number, OpRenderer>> = {
  crayon: CRAYON_VARIANTS,
  watercolor: WATERCOLOR_VARIANTS,
};

// Render one crayon/watercolor op through the currently-active variant, falling
// back to variant 1 if an unknown variant was pinned. renderOp() has already
// ruled out clear/erase/magic/pen, so this only ever sees a textured brush.
export function renderBrushOp(target: CanvasRenderingContext2D, op: InkOp, brush: TexturedBrush) {
  const table = VARIANTS[brush];
  const renderer = table[activeVariant[brush]] ?? table[1];
  renderer(target, op);
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
}
