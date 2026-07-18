const TILE_SIZE = 48;

type TexturedStroke = { color: string; textureSeed: number };

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f) ^ seed;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (Math.imul(value, 0x846ca68b) ^ (value >>> 16)) >>> 0;
}

function rgbFromHex(color: string): [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return null;
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}

function createPattern(
  target: CanvasRenderingContext2D,
  stroke: TexturedStroke
): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const rgb = rgbFromHex(stroke.color);
  if (!rgb) return null;
  const image = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const value = hash(x, y, stroke.textureSeed) / 0x1_0000_0000;
      const neighbour = hash(x >> 1, y >> 1, stroke.textureSeed ^ 0x6d2b79f5) / 0x1_0000_0000;
      const alpha = value < 0.09 ? 0 : neighbour < 0.22 ? 0.52 : 0.82;
      const offset = (y * TILE_SIZE + x) * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return target.createPattern(tile, 'repeat');
}

export function crayonPattern(target: CanvasRenderingContext2D, stroke: TexturedStroke) {
  const key = `${stroke.color}:${stroke.textureSeed}`;
  let cache = patterns.get(target);
  if (!cache) {
    cache = new Map();
    patterns.set(target, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;
  const pattern = createPattern(target, stroke);
  if (pattern) cache.set(key, pattern);
  return pattern;
}
