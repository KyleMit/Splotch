// A compact, deterministic wax mask. The low-frequency field leaves fine paper
// tooth visible on the first pass; a different stored phase on the next stroke
// covers different tooth without changing the pigment's hue.

const TILE_SIZE = 64;
const GRID_SIZE = 24;
const MIN_ALPHA = 108;
const MAX_ALPHA = 184;

interface PatternEntry {
  pattern: CanvasPattern;
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, PatternEntry>>();

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function toothMask() {
  const random = mulberry32(0x5a10c7);
  const values = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => random());
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const image = canvas.getContext('2d')!.createImageData(TILE_SIZE, TILE_SIZE);

  for (let y = 0; y < TILE_SIZE; y++) {
    const fy = (y / TILE_SIZE) * GRID_SIZE;
    const y0 = Math.floor(fy) % GRID_SIZE;
    const y1 = (y0 + 1) % GRID_SIZE;
    const ty = smoothstep(fy - Math.floor(fy));
    for (let x = 0; x < TILE_SIZE; x++) {
      const fx = (x / TILE_SIZE) * GRID_SIZE;
      const x0 = Math.floor(fx) % GRID_SIZE;
      const x1 = (x0 + 1) % GRID_SIZE;
      const tx = smoothstep(fx - Math.floor(fx));
      const top = values[y0 * GRID_SIZE + x0] * (1 - tx) + values[y0 * GRID_SIZE + x1] * tx;
      const bottom = values[y1 * GRID_SIZE + x0] * (1 - tx) + values[y1 * GRID_SIZE + x1] * tx;
      const alpha = Math.round(
        MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * (top * (1 - ty) + bottom * ty)
      );
      image.data[(y * TILE_SIZE + x) * 4 + 3] = alpha;
    }
  }
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas;
}

let mask: HTMLCanvasElement | null = null;

function patternFor(target: CanvasRenderingContext2D, color: string) {
  let byColor = patterns.get(target);
  if (!byColor) {
    byColor = new Map();
    patterns.set(target, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached.pattern;

  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileCtx = tile.getContext('2d')!;
  tileCtx.fillStyle = color;
  tileCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  tileCtx.globalCompositeOperation = 'destination-in';
  mask ||= toothMask();
  tileCtx.drawImage(mask, 0, 0);
  const pattern = target.createPattern(tile, 'repeat')!;
  byColor.set(color, { pattern });
  return pattern;
}

export function crayonPaint(target: CanvasRenderingContext2D, color: string, seed: number) {
  const pattern = patternFor(target, color);
  const phaseX = (seed * 11) % TILE_SIZE;
  const phaseY = (seed * 17) % TILE_SIZE;
  pattern.setTransform(new DOMMatrix().translate(phaseX, phaseY));
  return pattern;
}
