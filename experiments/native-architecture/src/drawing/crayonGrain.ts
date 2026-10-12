export const CRAYON_TILE_PX = 256;

const FIELD_SEED = 0x5c1a1;
const DITHER_SEED = 0x0d17e;
const GRAIN_OCTAVES = [
  { cell: 6, weight: 0.22 },
  { cell: 4, weight: 0.3 },
  { cell: 3, weight: 0.3 },
  { cell: 2, weight: 0.18 },
] as const;
const BODY_CELL_PX = 110;
const BODY_VARIATION = 0.2;
const EDGE_DITHER = 0.045;
const SHADE_VARIATION = 0.08;
type Fields = { height: Float32Array; body: Float32Array; dither: Float32Array };
let fields: Fields | null = null;

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
function octave(out: Float32Array, cell: number, weight: number, rand: () => number) {
  const size = CRAYON_TILE_PX;
  const n = Math.max(1, Math.round(size / cell));
  const lattice = new Float32Array(n * n);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
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
      const top = lattice[y0 * n + x0] * (1 - tx) + lattice[y0 * n + x1] * tx;
      const bottom = lattice[y1 * n + x0] * (1 - tx) + lattice[y1 * n + x1] * tx;
      out[y * size + x] += (top * (1 - ty) + bottom * ty) * weight;
    }
  }
}
function normalize(values: Float32Array) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of values) {
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  const span = hi - lo || 1;
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - lo) / span;
}
function paperFields(): Fields {
  if (fields) return fields;
  const count = CRAYON_TILE_PX * CRAYON_TILE_PX;
  const rand = random(FIELD_SEED);
  const height = new Float32Array(count);
  const sum = GRAIN_OCTAVES.reduce((total, item) => total + item.weight, 0) || 1;
  for (const item of GRAIN_OCTAVES) octave(height, item.cell, item.weight / sum, rand);
  normalize(height);
  const body = new Float32Array(count);
  octave(body, BODY_CELL_PX, 1, rand);
  normalize(body);
  const dither = new Float32Array(count);
  const drand = random(DITHER_SEED);
  for (let i = 0; i < count; i++) dither[i] = drand();
  return (fields = { height, body, dither });
}
export function crayonTilePixels(hex: string, coverage: number): Uint8ClampedArray {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !Number.isFinite(coverage) || coverage < 0 || coverage > 1)
    throw new Error('Invalid Crayon tile pigment or coverage');
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const { height, body, dither } = paperFields();
  const pixels = new Uint8ClampedArray(height.length * 4);
  for (let i = 0; i < height.length; i++) {
    const fine = Math.max(-1, Math.min(1, (0.7 - height[i]) * 2));
    const slow = body[i] * 2 - 1;
    const shift = SHADE_VARIATION * (0.7 * fine + 0.3 * slow);
    for (let c = 0; c < channels.length; c++) {
      const value = channels[c];
      pixels[i * 4 + c] = Math.round(
        shift >= 0 ? value + (255 - value) * shift : value * (1 + shift)
      );
    }
    const threshold = 1 - coverage + BODY_VARIATION * (body[i] - 0.5);
    const jitter = (dither[i] - 0.5) * (2 * EDGE_DITHER);
    pixels[i * 4 + 3] = height[i] + jitter >= threshold ? 255 : 0;
  }
  return pixels;
}
export function canonicalCrayonPhase(seed: number) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const x = h % CRAYON_TILE_PX;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  return { x, y: h % CRAYON_TILE_PX };
}
