// Deterministic wax texture used by replayable crayon ops. The texture is made
// from stored stroke seeds, never from canvas readback, so folding a command
// into the baseline cannot change the pixels of a later replay.

const TILE_SIZE = 32;
const PHASE_COUNT = 16;
const tiles = new Map<string, HTMLCanvasElement>();

function hash(x: number, y: number, phase: number): number {
  let n = Math.imul(x + phase * 131, 0x45d9f3b) ^ Math.imul(y + phase * 313, 0x27d4eb2d);
  n ^= n >>> 16;
  n = Math.imul(n, 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function tileFor(color: string, seed: number): HTMLCanvasElement {
  const phase = seed & (PHASE_COUNT - 1);
  const key = `${color}:${phase}`;
  const cached = tiles.get(key);
  if (cached) return cached;

  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileCtx = tile.getContext('2d')!;
  const image = tileCtx.createImageData(TILE_SIZE, TILE_SIZE);
  const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const r = rgb ? Number.parseInt(rgb[1], 16) : 0;
  const g = rgb ? Number.parseInt(rgb[2], 16) : 0;
  const b = rgb ? Number.parseInt(rgb[3], 16) : 0;

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = (y * TILE_SIZE + x) * 4;
      // A broad, low-contrast tooth field avoids digital-looking salt and
      // pepper while the occasional pale pore keeps the paper visible.
      const fine = hash(x, y, phase) & 63;
      const tooth = hash(x >> 1, y >> 1, phase + 7) & 31;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = fine < 3 ? 52 : 132 + fine + tooth;
    }
  }
  tileCtx.putImageData(image, 0, 0);
  tiles.set(key, tile);
  return tile;
}

export function crayonPattern(
  target: CanvasRenderingContext2D,
  color: string,
  textureSeed: number
): CanvasPattern | null {
  return target.createPattern(tileFor(color, textureSeed), 'repeat');
}
