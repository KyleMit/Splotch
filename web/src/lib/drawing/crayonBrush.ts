export type CrayonVariant = 'wax' | 'solid';

const TILE_SIZE = 32;
const tileCache = new Map<string, HTMLCanvasElement>();
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function noise(x: number, y: number) {
  let n = Math.imul(x + 374761393, y + 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return ((Math.imul(n, 1274126177) ^ (n >>> 16)) >>> 0) / 4294967295;
}

function toothTile(color: string) {
  const cached = tileCache.get(color);
  if (cached) return cached;
  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const ctx = tile.getContext('2d')!;
  ctx.fillStyle = color;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const grain = noise(x, y);
      if (grain < 0.08) continue;
      ctx.globalAlpha = 0.52 + grain * 0.24;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  tileCache.set(color, tile);
  return tile;
}

export function crayonPaintFor(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number,
  variant: CrayonVariant
): string | CanvasPattern {
  if (variant === 'solid') return color;
  const key = `${color}:${seed}`;
  let patterns = patternCache.get(target);
  if (!patterns) {
    patterns = new Map();
    patternCache.set(target, patterns);
  }
  const cached = patterns.get(key);
  if (cached) return cached;
  const pattern = target.createPattern(toothTile(color), 'repeat');
  if (!pattern) return color;
  const offsetX = (seed * 11) % TILE_SIZE;
  const offsetY = (seed * 17) % TILE_SIZE;
  pattern.setTransform(new DOMMatrix([1, 0, 0, 1, offsetX, offsetY]));
  patterns.set(key, pattern);
  return pattern;
}
