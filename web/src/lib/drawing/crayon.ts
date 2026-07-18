// Deterministic wax texture for the crayon renderer. Each stroke gets a
// different stored seed, so another pass fills different paper teeth without
// changing the colour that already landed.

export type CrayonVariant = 'paper-tooth' | 'solid';

const TILE_SIZE = 64;
const cache = new Map<string, HTMLCanvasElement>();

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function toothAlpha(x: number, y: number, seed: number): number {
  const value = hash(x >> 1, y >> 1, seed) & 255;
  if (value < 14) return 0;
  if (value < 42) return 118;
  if (value < 104) return 166;
  return 214;
}

function textureTile(color: string, seed: number): HTMLCanvasElement {
  const key = `${color}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const ctx = tile.getContext('2d')!;
  const image = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  const swatch = document.createElement('canvas').getContext('2d')!;
  swatch.fillStyle = color;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const offset = (y * TILE_SIZE + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = toothAlpha(x, y, seed);
    }
  }
  ctx.putImageData(image, 0, 0);
  if (cache.size > 96) cache.clear();
  cache.set(key, tile);
  return tile;
}

export function crayonPaint(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number,
  variant: CrayonVariant
): string | CanvasPattern {
  if (variant === 'solid') return color;
  return target.createPattern(textureTile(color, seed), 'repeat') ?? color;
}
