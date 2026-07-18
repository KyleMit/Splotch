// Deterministic wax-crayon paint. A small, paper-anchored alpha tile leaves
// fine tooth visible on the first pass; repeated same-colour passes fill it
// without changing hue because source-over composites identical RGB values.

export type CrayonVariant = 'wax' | 'flat';

let variant: CrayonVariant = 'wax';
const patternCache = new Map<string, CanvasPattern>();

const TOOTH_SIZE = 12;
const WAX_ALPHA = 0.68;

function hash(x: number, y: number): number {
  let n = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  return (n >>> 0) / 0xffffffff;
}

function waxPattern(target: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const key = `${color}:${variant}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = TOOTH_SIZE;
  tile.height = TOOTH_SIZE;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;

  for (let y = 0; y < TOOTH_SIZE; y++) {
    for (let x = 0; x < TOOTH_SIZE; x++) {
      const tooth = 0.56 + hash(x, y) * 0.44;
      tileCtx.globalAlpha = WAX_ALPHA * tooth;
      tileCtx.fillStyle = color;
      tileCtx.fillRect(x, y, 1, 1);
    }
  }
  const pattern = target.createPattern(tile, 'repeat');
  if (pattern) patternCache.set(key, pattern);
  return pattern;
}

export function crayonPaint(
  target: CanvasRenderingContext2D,
  color: string
): string | CanvasPattern {
  return variant === 'flat' ? color : (waxPattern(target, color) ?? color);
}

export function setCrayonVariant(next: CrayonVariant) {
  variant = next;
}

export function getCrayonVariant(): CrayonVariant {
  return variant;
}
