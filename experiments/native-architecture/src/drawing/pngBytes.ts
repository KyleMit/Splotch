import { MAX_PNG_BASE64_CHARACTERS, assertPngGrid, type PngGrid } from './pngLimits';
import type { PngWork } from './pngWork';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_POLYNOMIAL = 0xedb88320;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? CRC_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const MAX_CHUNK_BYTES = 0x7fffffff;
const IHDR_BYTES = 13;

function invalid(): never {
  throw new Error('Picture capture returned an invalid or unsupported PNG.');
}

function base64Bytes(input: string, work: PngWork) {
  if (typeof input !== 'string' || !input.length) invalid();
  if (input.length > MAX_PNG_BASE64_CHARACTERS)
    throw new Error('This picture is too large to check.');
  let position = 0;
  let ended = false;
  const bytes = new Uint8Array(3);
  let count = 0;
  let index = 0;
  function symbol(): string | null {
    let breaks = 0;
    while (position < input.length) {
      work.charge();
      const value = input[position++];
      if (value !== '\r' && value !== '\n') return value;
      if (++breaks > 2) invalid();
    }
    return null;
  }
  function read(): number | null {
    if (index < count) return bytes[index++];
    if (ended) return null;
    const a = symbol();
    if (a === null) {
      ended = true;
      return null;
    }
    const b = symbol(),
      c = symbol(),
      d = symbol();
    if (b === null || c === null || d === null) invalid();
    const va = BASE64_ALPHABET.indexOf(a),
      vb = BASE64_ALPHABET.indexOf(b);
    const vc = c === '=' ? 0 : BASE64_ALPHABET.indexOf(c);
    const vd = d === '=' ? 0 : BASE64_ALPHABET.indexOf(d);
    if (va < 0 || vb < 0 || vc < 0 || vd < 0 || (c === '=' && d !== '=')) invalid();
    count = c === '=' ? 1 : d === '=' ? 2 : 3;
    if ((count === 1 && vb & 15) || (count === 2 && vc & 3)) invalid();
    bytes[0] = (va << 2) | (vb >>> 4);
    bytes[1] = (vb << 4) | (vc >>> 2);
    bytes[2] = (vc << 6) | vd;
    index = 1;
    if (count !== 3) {
      if (symbol() !== null) invalid();
      ended = true;
    }
    return bytes[0];
  }
  return { read };
}

type Chunk = { type: string; remaining: number; crc: number; length: number };

export async function openPng(input: string, expected: PngGrid, work: PngWork) {
  assertPngGrid(expected);
  const bytes = base64Bytes(input, work);
  function byte() {
    const value = bytes.read();
    if (value === null) invalid();
    return value;
  }
  function uint32() {
    return (byte() * 0x1000000 + (byte() << 16) + (byte() << 8) + byte()) >>> 0;
  }
  function update(crc: number, value: number) {
    return CRC_TABLE[(crc ^ value) & 255] ^ (crc >>> 8);
  }
  function chunk(): Chunk {
    const length = uint32();
    if (length > MAX_CHUNK_BYTES) invalid();
    let type = '',
      crc = 0xffffffff;
    for (let index = 0; index < 4; index++) {
      const value = byte();
      if (
        !((value >= 65 && value <= 90) || (value >= 97 && value <= 122)) ||
        (index === 2 && value >= 97)
      )
        invalid();
      type += String.fromCharCode(value);
      crc = update(crc, value);
    }
    return { type, length, remaining: length, crc };
  }
  function data(current: Chunk) {
    if (!current.remaining) invalid();
    const value = byte();
    current.remaining--;
    current.crc = update(current.crc, value);
    return value;
  }
  function finish(current: Chunk) {
    if (current.remaining || uint32() !== (current.crc ^ 0xffffffff) >>> 0) invalid();
  }
  async function skip(current: Chunk) {
    while (current.remaining) {
      data(current);
      if (work.due()) await work.pause();
    }
    finish(current);
  }
  for (const value of PNG_SIGNATURE) if (byte() !== value) invalid();
  const header = chunk();
  if (header.type !== 'IHDR' || header.length !== IHDR_BYTES) invalid();
  const h = Uint8Array.from({ length: IHDR_BYTES }, () => data(header));
  finish(header);
  const width = h[0] * 0x1000000 + (h[1] << 16) + (h[2] << 8) + h[3];
  const height = h[4] * 0x1000000 + (h[5] << 16) + (h[6] << 8) + h[7];
  assertPngGrid({ width, height });
  if (
    width !== expected.width ||
    height !== expected.height ||
    h[8] !== 8 ||
    h[9] !== 6 ||
    h[10] !== 0 ||
    h[11] !== 0 ||
    h[12] !== 0
  )
    invalid();
  let current = chunk();
  let palette = false;
  let gamma: number | null = null;
  const metadata = new Set<string>();
  function ancillary(c: Chunk) {
    if (metadata.has(c.type)) invalid();
    metadata.add(c.type);
    if (c.type === 'PLTE') {
      if (palette || !c.length || c.length > 768 || c.length % 3) invalid();
      palette = true;
    } else if (c.type === 'sRGB') {
      if (palette || c.length !== 1 || data(c) > 3 || (gamma !== null && gamma !== 45455))
        invalid();
    } else if (c.type === 'gAMA') {
      if (palette || c.length !== 4) invalid();
      gamma = data(c) * 0x1000000 + (data(c) << 16) + (data(c) << 8) + data(c);
      if (!gamma || (metadata.has('sRGB') && gamma !== 45455)) invalid();
    } else if (c.type === 'sBIT') {
      if (palette || c.length !== 4) invalid();
      for (let channel = 0; channel < c.length; channel++) {
        const depth = data(c);
        if (!depth || depth > h[8]) invalid();
      }
    } else if (c.type === 'pHYs') {
      if (c.length !== 9) invalid();
      for (let index = 0; index < 8; index++) data(c);
      if (data(c) > 1) invalid();
    } else invalid();
  }
  while (current.type !== 'IDAT') {
    ancillary(current);
    await skip(current);
    current = chunk();
  }
  let streamEnded = false;
  function read(): number | null {
    if (streamEnded) return null;
    while (!current.remaining) {
      finish(current);
      current = chunk();
      if (current.type !== 'IDAT') {
        streamEnded = true;
        return null;
      }
    }
    return data(current);
  }
  async function complete() {
    if (read() !== null) invalid();
    if (current.type !== 'IEND') invalid();
    if (current.length !== 0) invalid();
    finish(current);
    if (bytes.read() !== null) invalid();
    work.check();
  }
  return { read, complete, width, height };
}
