// Deterministic wax texture shared by the live canvas and every replay surface.

export type CrayonVariant = 'wax' | 'solid';

let variant: CrayonVariant = 'wax';

export function setCrayonVariant(next: CrayonVariant) {
  variant = next;
}

export function crayonVariant(): CrayonVariant {
  return variant;
}

function randomAt(seed: number, x: number, y: number): number {
  let n = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x27d4eb2d)) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x45d9f3b) >>> 0;
  n ^= n >>> 16;
  return n / 0xffffffff;
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

// A small, low-contrast alpha tile leaves fine paper tooth visible without making
// individual digital-looking speckles. Different stored seeds make a second pass
// land wax in the first pass's gaps while source-over preserves the selected hue.
export function waxPattern(
  target: CanvasRenderingContext2D,
  color: string,
  seed: number
): CanvasPattern | null {
  if (variant === 'solid') return null;
  const key = `${color}:${seed}`;
  let cache = patterns.get(target);
  if (!cache) patterns.set(target, (cache = new Map()));
  const existing = cache.get(key);
  if (existing) return existing;

  const tile = document.createElement('canvas');
  tile.width = 24;
  tile.height = 24;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(tile.width, tile.height);
  const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!rgb) return null;
  const channels = [parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16)];
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      const i = (y * tile.width + x) * 4;
      // Neighbour averaging turns independent noise into subtle paper fibres.
      const tooth =
        (randomAt(seed, x, y) + randomAt(seed, x + 1, y) + randomAt(seed, x, y + 1)) / 3;
      image.data[i] = channels[0];
      image.data[i + 1] = channels[1];
      image.data[i + 2] = channels[2];
      image.data[i + 3] = Math.round(138 + tooth * 92);
    }
  }
  ctx.putImageData(image, 0, 0);
  const pattern = target.createPattern(tile, 'repeat');
  if (pattern) cache.set(key, pattern);
  return pattern;
}
