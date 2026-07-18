export type CrayonVariant = 'solid' | 'wax';

const TOOTH_TILE_SIZE = 24;
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function hash(value: number) {
  let n = value | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function colorSeed(color: string) {
  let seed = 0;
  for (let i = 0; i < color.length; i++) seed = Math.imul(seed ^ color.charCodeAt(i), 16777619);
  return seed;
}

function waxPattern(target: CanvasRenderingContext2D, color: string) {
  let patterns = patternCache.get(target);
  if (!patterns) {
    patterns = new Map();
    patternCache.set(target, patterns);
  }
  const cached = patterns.get(color);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = TOOTH_TILE_SIZE;
  tile.height = TOOTH_TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx || !ctx.fillRect || !ctx.getImageData || !ctx.putImageData) return null;

  const seed = colorSeed(color);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TOOTH_TILE_SIZE, TOOTH_TILE_SIZE);
  const pixels = ctx.getImageData(0, 0, TOOTH_TILE_SIZE, TOOTH_TILE_SIZE);
  for (let y = 0; y < TOOTH_TILE_SIZE; y++) {
    for (let x = 0; x < TOOTH_TILE_SIZE; x++) {
      const i = (y * TOOTH_TILE_SIZE + x) * 4;
      const grain = hash(seed + x * 374761393 + y * 668265263);
      // Two nearby samples make a fine, slightly fibrous tooth rather than
      // isolated digital speckles. Low-alpha pits leave paper showing through
      // on the first pass and naturally accept more wax on later passes.
      const neighbor = hash(seed + (x + 1) * 374761393 + y * 668265263);
      const tooth = ((grain & 255) + (neighbor & 255)) / 510;
      const alpha = Math.round(105 + tooth * 142);
      pixels.data[i + 3] = alpha;
    }
  }
  ctx.putImageData(pixels, 0, 0);

  const pattern = target.createPattern(tile, 'repeat');
  if (!pattern) return null;
  patterns.set(color, pattern);
  return pattern;
}

export function crayonPaint(
  target: CanvasRenderingContext2D,
  color: string,
  variant: CrayonVariant
): string | CanvasPattern {
  return variant === 'wax' ? (waxPattern(target, color) ?? color) : color;
}
