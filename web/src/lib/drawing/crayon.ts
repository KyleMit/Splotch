// Deterministic wax-crayon texture. A stroke is a crisp geometric mask whose
// coverage is decided by the same paper-tooth value in every renderer.

export type CrayonVariant = 'wax' | 'solid';

const TILE_SIZE = 48;
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function hash(x: number, y: number): number {
  let n = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  return (n >>> 0) / 0x100000000;
}

// A lightly correlated field looks like paper fibres rather than isolated
// digital speckles. The coordinates are periodic only at the texture tile,
// which keeps a CanvasPattern inexpensive on the pointer-move hot path.
export function paperTooth(x: number, y: number): number {
  const center = hash(x, y);
  const neighbours = hash(x - 1, y) + hash(x + 1, y) + hash(x, y - 1) + hash(x, y + 1);
  return center * 0.72 + (neighbours / 4) * 0.28;
}

function patternFor(target: CanvasRenderingContext2D, color: string, depositLevel: number) {
  const level = Math.round(depositLevel * 100) / 100;
  const key = `${color}:${level}`;
  let targetPatterns = patterns.get(target);
  if (!targetPatterns) {
    targetPatterns = new Map();
    patterns.set(target, targetPatterns);
  }
  const cached = targetPatterns.get(key);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileCtx = tile.getContext('2d')!;
  tileCtx.fillStyle = color;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (paperTooth(x, y) < level) tileCtx.fillRect(x, y, 1, 1);
    }
  }
  const pattern = target.createPattern(tile, 'repeat')!;
  targetPatterns.set(key, pattern);
  return pattern;
}

export function crayonPaint(
  target: CanvasRenderingContext2D,
  color: string,
  depositLevel: number,
  variant: CrayonVariant
): string | CanvasPattern {
  return variant === 'solid' ? color : patternFor(target, color, depositLevel);
}

export function nextDepositLevel(pass: number): number {
  return Math.min(0.98, 0.78 + pass * 0.1);
}
