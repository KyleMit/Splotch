import { CRAYON_TILE_PX } from './crayon';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PALETTE_LIMIT = 256;
const DEFLATE_BLOCK_BYTES = 65535;
const ADLER_MODULUS = 65521;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function uint32(value: number) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}
function chunk(type: string, body: readonly number[]): number[] {
  const data = [...Array.from(type, (character) => character.charCodeAt(0)), ...body];
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return [...uint32(body.length), ...data, ...uint32((crc ^ 0xffffffff) >>> 0)];
}
function storedDeflate(bytes: readonly number[]): number[] {
  const output = [0x78, 0x01];
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % ADLER_MODULUS;
    b = (b + a) % ADLER_MODULUS;
  }
  for (let start = 0; start < bytes.length; start += DEFLATE_BLOCK_BYTES) {
    const block = bytes.slice(start, start + DEFLATE_BLOCK_BYTES);
    const size = block.length;
    output.push(
      start + size === bytes.length ? 1 : 0,
      size & 255,
      size >>> 8,
      ~size & 255,
      (~size >>> 8) & 255
    );
    for (const byte of block) output.push(byte);
  }
  return [...output, ...uint32(((b << 16) | a) >>> 0)];
}
function base64(bytes: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const bits = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(
      BASE64_ALPHABET[(bits >>> 18) & 63] +
        BASE64_ALPHABET[(bits >>> 12) & 63] +
        (i + 1 < bytes.length ? BASE64_ALPHABET[(bits >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? BASE64_ALPHABET[bits & 63] : '=')
    );
  }
  return parts.join('');
}
export function crayonTilePng(pixels: Uint8ClampedArray): string {
  if (pixels.length !== CRAYON_TILE_PX * CRAYON_TILE_PX * 4)
    throw new Error('Invalid Crayon tile dimensions');
  const palette = new Map<number, number>();
  const rgb: number[] = [];
  const alpha: number[] = [];
  const scanlines: number[] = [];
  for (let y = 0; y < CRAYON_TILE_PX; y++) {
    scanlines.push(0);
    for (let x = 0; x < CRAYON_TILE_PX; x++) {
      const offset = (y * CRAYON_TILE_PX + x) * 4;
      const key =
        ((pixels[offset] << 24) |
          (pixels[offset + 1] << 16) |
          (pixels[offset + 2] << 8) |
          pixels[offset + 3]) >>>
        0;
      let index = palette.get(key);
      if (index === undefined) {
        index = palette.size;
        if (index >= PALETTE_LIMIT) throw new Error('Crayon tile palette exceeds PNG capacity');
        palette.set(key, index);
        rgb.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        alpha.push(pixels[offset + 3]);
      }
      scanlines.push(index);
    }
  }
  const png = [
    ...PNG_SIGNATURE,
    ...chunk('IHDR', [...uint32(CRAYON_TILE_PX), ...uint32(CRAYON_TILE_PX), 8, 3, 0, 0, 0]),
    ...chunk('PLTE', rgb),
    ...chunk('tRNS', alpha),
    ...chunk('IDAT', storedDeflate(scanlines)),
    ...chunk('IEND', []),
  ];
  return `data:image/png;base64,${base64(png)}`;
}
