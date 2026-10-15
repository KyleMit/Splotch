import type { PaneRaster } from './glassPaneRaster';

// A pane raster as a PNG data URI for a plain Image: one colour in a 256-entry palette whose
// transparency entry is its index, so each pixel's byte is its alpha. Stored, not compressed: the
// rasters are small and built once per layout.
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PALETTE_ENTRIES = 256;
const BIT_DEPTH = 8;
const INDEXED_COLOUR = 3;
const NO_FILTER = 0;
const ZLIB_HEADER = [0x78, 0x01];
const STORED_BLOCK_BYTES = 65535;
const ADLER_MODULUS = 65521;
const CRC_POLYNOMIAL = 0xedb88320;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? CRC_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function uint32(value: number) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  out.set(uint32(body.length), 0);
  out.set(
    Array.from(type, (character) => character.charCodeAt(0)),
    4
  );
  out.set(body, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < body.length + 8; index++)
    crc = CRC_TABLE[(crc ^ out[index]) & 255] ^ (crc >>> 8);
  out.set(uint32((crc ^ 0xffffffff) >>> 0), body.length + 8);
  return out;
}

function storedZlib(bytes: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(bytes.length / STORED_BLOCK_BYTES));
  const out = new Uint8Array(ZLIB_HEADER.length + bytes.length + blocks * 5 + 4);
  out.set(ZLIB_HEADER, 0);
  let at = ZLIB_HEADER.length;
  for (let block = 0; block < blocks; block++) {
    const start = block * STORED_BLOCK_BYTES;
    const size = Math.min(STORED_BLOCK_BYTES, bytes.length - start);
    out.set(
      [block === blocks - 1 ? 1 : 0, size & 255, size >>> 8, ~size & 255, (~size >>> 8) & 255],
      at
    );
    out.set(bytes.subarray(start, start + size), at + 5);
    at += size + 5;
  }
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % ADLER_MODULUS;
    b = (b + a) % ADLER_MODULUS;
  }
  out.set(uint32(((b << 16) | a) >>> 0), at);
  return out;
}

function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += 3) {
    const bits = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    parts.push(
      BASE64_ALPHABET[(bits >>> 18) & 63] +
        BASE64_ALPHABET[(bits >>> 12) & 63] +
        (index + 1 < bytes.length ? BASE64_ALPHABET[(bits >>> 6) & 63] : '=') +
        (index + 2 < bytes.length ? BASE64_ALPHABET[bits & 63] : '=')
    );
  }
  return parts.join('');
}

export function glassPanePng(
  { columns, rows, alpha }: PaneRaster,
  rgb: readonly [number, number, number]
): string {
  const scanlines = new Uint8Array(rows * (columns + 1));
  for (let row = 0; row < rows; row++) {
    scanlines[row * (columns + 1)] = NO_FILTER;
    scanlines.set(alpha.subarray(row * columns, (row + 1) * columns), row * (columns + 1) + 1);
  }
  const header = new Uint8Array([
    ...uint32(columns),
    ...uint32(rows),
    BIT_DEPTH,
    INDEXED_COLOUR,
    0,
    0,
    0,
  ]);
  const palette = new Uint8Array(PALETTE_ENTRIES * 3).map((_, index) => rgb[index % 3]);
  const transparency = Uint8Array.from({ length: PALETTE_ENTRIES }, (_, index) => index);
  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('tRNS', transparency),
    chunk('IDAT', storedZlib(scanlines)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((at, part) => {
    png.set(part, at);
    return at + part.length;
  }, 0);
  return `data:image/png;base64,${base64(png)}`;
}
