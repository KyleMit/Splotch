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
