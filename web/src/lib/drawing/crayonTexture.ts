export type CrayonVariant = 'two-octave' | 'solid';

const TILE_SIZE = 64;
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function crayonAlphaAt(x: number, y: number): number {
  const coarse = (hash(Math.floor(x / 8), Math.floor(y / 8), 17) & 255) / 255;
  const fine = (hash(x, y, 91) & 255) / 255;
  return 0.42 + coarse * 0.24 + fine * 0.26;
}

function hexToRgb(color: string): [number, number, number] | null {
  const value = /^#([\da-f]{6})$/i.exec(color)?.[1];
  if (!value) return null;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function makePattern(target: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  const image = tileCtx.createImageData(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = (y * TILE_SIZE + x) * 4;
      image.data[i] = rgb[0];
      image.data[i + 1] = rgb[1];
      image.data[i + 2] = rgb[2];
      image.data[i + 3] = Math.round(crayonAlphaAt(x, y) * 255);
    }
  }
  tileCtx.putImageData(image, 0, 0);
  return target.createPattern(tile, 'repeat');
}

export function crayonPaintFor(
  target: CanvasRenderingContext2D,
  color: string,
  variant: CrayonVariant
): string | CanvasPattern {
  if (variant === 'solid') return color;
  let patterns = patternCache.get(target);
  if (!patterns) {
    patterns = new Map();
    patternCache.set(target, patterns);
  }
  const cached = patterns.get(color);
  if (cached) return cached;
  const pattern = makePattern(target, color);
  if (!pattern) return color;
  patterns.set(color, pattern);
  return pattern;
}
