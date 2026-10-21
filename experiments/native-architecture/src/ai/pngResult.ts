import { inflatePng } from '../drawing/pngInflate';
import { captureMetadataFits, isCaptureMetadata } from '../drawing/pngCaptureMetadata';
import type { PngWork } from '../drawing/pngWork';
import { ascii, imageGrid, invalidImage, MAX_AI_IMAGE_METADATA_BYTES } from './imageBounds';
import type { PngGrid } from '../drawing/pngLimits';
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_CHUNKS = 4096;
const SRGB_GAMMA = 45455;
const SRGB_CHROMATICITY = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
const CHROMATICITY_SCALE = 100000;
const BEFORE_PALETTE = new Set(['cHRM', 'gAMA', 'sRGB', 'sBIT']);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
type Chunk = { type: string; data: Uint8Array };
async function chunks(bytes: Uint8Array, work: PngWork) {
  if (SIGNATURE.some((value, index) => bytes[index] !== value)) invalidImage();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Chunk[] = [];
  let offset = SIGNATURE.length;
  while (offset < bytes.length) {
    if (result.length >= MAX_CHUNKS || offset + 12 > bytes.length) invalidImage();
    const length = view.getUint32(offset),
      end = offset + 12 + length;
    if (end > bytes.length) invalidImage();
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalidImage();
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index++) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
      work.charge();
      if (work.due() && work.endSlice()) await work.pause();
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(end - 4)) invalidImage();
    result.push({ type, data: bytes.subarray(offset + 8, end - 4) });
    offset = end;
  }
  return result;
}
function metadata(chunk: Chunk, channels: number) {
  const n = chunk.data.length;
  if (chunk.type === 'sRGB') {
    if (n !== 1 || chunk.data[0] > 3) invalidImage();
  } else if (chunk.type === 'gAMA') {
    if (n !== 4 || chunk.data.every((value) => value === 0)) invalidImage();
  } else if (chunk.type === 'cHRM') {
    if (n !== 32) invalidImage();
    const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, n);
    for (let offset = 0; offset < n; offset += 8) {
      const x = view.getUint32(offset),
        y = view.getUint32(offset + 4);
      if (x > CHROMATICITY_SCALE || y > CHROMATICITY_SCALE || !y || x + y > CHROMATICITY_SCALE)
        invalidImage();
    }
  } else if (chunk.type === 'pHYs') {
    if (n !== 9 || chunk.data[8] > 1) invalidImage();
  } else if (chunk.type === 'sBIT') {
    if (n !== channels || chunk.data.some((value) => value < 1 || value > 8)) invalidImage();
  } else if (chunk.type === 'PLTE') {
    if (!n || n > 768 || n % 3) invalidImage();
  } else if (chunk.type === 'caBX') {
    // The provider's C2PA content credentials. Its pictures carry one; it is kept, never read.
    if (!n) invalidImage();
  } else if (isCaptureMetadata(chunk.type)) {
    // The original is the app's own canvas capture, which WebKit encodes with an eXIf chunk.
    const tiffHeader = () => new DataView(chunk.data.buffer, chunk.data.byteOffset, n).getUint32(0);
    if (!captureMetadataFits(chunk.type, n, tiffHeader)) invalidImage();
  } else invalidImage();
}
export async function pngResultGrid(
  bytes: Uint8Array,
  work: PngWork,
  gridFromDimensions: (width: number, height: number) => PngGrid = imageGrid
) {
  const all = await chunks(bytes, work),
    header = all.shift();
  if (header?.type !== 'IHDR' || header.data.length !== 13) invalidImage();
  const h = header.data,
    view = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const grid = gridFromDimensions(view.getUint32(0), view.getUint32(4));
  if (h[8] !== 8 || (h[9] !== 2 && h[9] !== 6) || h[10] || h[11] || h[12]) invalidImage();
  const channels = h[9] === 2 ? 3 : 4,
    data: Uint8Array[] = [],
    seen = new Set<string>();
  let ended = false,
    metadataBytes = 0;
  for (const chunk of all) {
    if (ended) invalidImage();
    if (chunk.type === 'IDAT') data.push(chunk.data);
    else if (chunk.type === 'IEND') {
      if (chunk.data.length || !data.length || chunk !== all.at(-1)) invalidImage();
      ended = true;
    } else {
      if (
        data.length ||
        seen.has(chunk.type) ||
        (seen.has('PLTE') && BEFORE_PALETTE.has(chunk.type))
      )
        invalidImage();
      metadataBytes += chunk.data.length;
      if (metadataBytes > MAX_AI_IMAGE_METADATA_BYTES) invalidImage();
      seen.add(chunk.type);
      metadata(chunk, channels);
    }
  }
  if (!ended) invalidImage();
  if (seen.has('sRGB')) {
    for (const chunk of all) {
      const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
      if (chunk.type === 'gAMA' && view.getUint32(0) !== SRGB_GAMMA) invalidImage();
      if (
        chunk.type === 'cHRM' &&
        SRGB_CHROMATICITY.some((value, index) => view.getUint32(index * 4) !== value)
      )
        invalidImage();
    }
  }
  let chunk = 0,
    position = 0,
    output = 0;
  const rowBytes = grid.width * channels + 1;
  await inflatePng(
    () => {
      while (chunk < data.length && position === data[chunk].length) {
        chunk++;
        position = 0;
      }
      return chunk < data.length ? data[chunk][position++] : null;
    },
    rowBytes * grid.height,
    (value) => {
      if (output++ % rowBytes === 0 && value > 4) invalidImage();
    },
    work
  );
  return grid;
}
