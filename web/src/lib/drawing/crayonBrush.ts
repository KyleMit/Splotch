// Deterministic wax-crayon texture. Every stroke gets a stored seed, which
// shifts a fine, low-contrast paper-tooth pattern. Re-stroking the same colour
// therefore catches different tooth while alpha accumulation keeps the hue clean
// instead of multiplying it into mud.

export type CrayonVariant = 'tooth-coverage' | 'flat';

export const DEFAULT_CRAYON_VARIANT: CrayonVariant = 'tooth-coverage';

let variant: CrayonVariant = DEFAULT_CRAYON_VARIANT;
let nextSeed = 1;

export function setCrayonVariant(next: CrayonVariant) {
  variant = next;
}

export function nextCrayonSeed(): number {
  const seed = nextSeed;
  nextSeed += 1;
  return seed;
}

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 16), 0x27d4eb2d);
  return (n ^ (n >>> 15)) >>> 0;
}

// A 24px tile is large enough not to read as repeating digital noise. Its
// coverage stays in a narrow range: fine paper tooth, not gritty pinholes.
const TILE_SIZE = 24;
const textureCanvases = new Map<string, HTMLCanvasElement>();
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function textureCanvas(seed: number, color: string): HTMLCanvasElement {
  const key = `${seed}:${color}`;
  const cached = textureCanvases.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const texture = canvas.getContext('2d')!;
  const image = texture.createImageData(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = (y * TILE_SIZE + x) * 4;
      // Blend one cell with its neighbours so the tooth is tactile rather than
      // salt-and-pepper noise, while keeping its edge crisp via the path mask.
      const grain =
        (hash(x, y, seed) + hash(x + 1, y, seed) + hash(x, y + 1, seed) + hash(x - 1, y, seed)) /
        (4 * 0xffffffff);
      image.data[i] = 0;
      image.data[i + 1] = 0;
      image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(82 + grain * 92);
    }
  }
  texture.putImageData(image, 0, 0);
  texture.globalCompositeOperation = 'source-in';
  texture.fillStyle = color;
  texture.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  textureCanvases.set(key, canvas);
  return canvas;
}

function toothPattern(
  target: CanvasRenderingContext2D,
  seed: number,
  color: string
): CanvasPattern | null {
  let cache = patterns.get(target);
  if (!cache) {
    cache = new Map();
    patterns.set(target, cache);
  }
  const key = `${seed % 32}:${color}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pattern = target.createPattern(textureCanvas(seed % 32, color), 'repeat');
  if (pattern) cache.set(key, pattern);
  return pattern;
}

export function crayonPaint(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number
): string | CanvasPattern {
  if (variant === 'flat') return color;
  return toothPattern(target, seed, color) ?? color;
}

export function crayonCompositeOperation(): GlobalCompositeOperation {
  // Source-over accumulates coverage as 1 - (1 - a) * (1 - b): each pass fills
  // more tooth without ever changing a same-colour wax hue. It also preserves
  // destination-out erasing exactly, unlike Canvas's colour-channel `lighten`
  // blend implementation on transparent backing stores.
  return 'source-over';
}
