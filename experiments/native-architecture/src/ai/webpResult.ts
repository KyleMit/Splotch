import type { PngWork } from '../drawing/pngWork';
import { ascii, imageGrid, invalidImage, MAX_AI_IMAGE_METADATA_BYTES } from './imageBounds';
import type { PngGrid } from '../drawing/pngLimits';
const MAX_CHUNKS = 8;
function uint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
}
function frame(type: string, bytes: Uint8Array) {
  if (type === 'VP8L') {
    if (bytes.length < 6 || bytes[0] !== 0x2f || bytes[4] >>> 5) invalidImage();
    const packed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      1,
      true
    );
    return {
      grid: imageGrid((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1),
      alpha: !!(packed & 0x10000000),
    };
  }
  if (
    type !== 'VP8 ' ||
    bytes.length < 11 ||
    bytes[0] & 1 ||
    ((bytes[0] >>> 1) & 7) > 3 ||
    !(bytes[0] & 16) ||
    ascii(bytes, 3, 3) !== '\x9d\x01\x2a'
  )
    invalidImage();
  const partition = uint24(bytes, 0) >>> 5,
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true),
    height = view.getUint16(8, true);
  if (!partition || partition > bytes.length - 10 || width >>> 14 || height >>> 14) invalidImage();
  return { grid: imageGrid(width, height), alpha: false };
}
export async function webpResultGrid(bytes: Uint8Array, work: PngWork): Promise<PngGrid> {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP')
    invalidImage();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) invalidImage();
  let offset = 12,
    canvas: PngGrid | null = null,
    picture: PngGrid | null = null,
    flags = 0,
    alpha = false,
    metadataBytes = 0;
  const seen = new Set<string>();
  while (offset < bytes.length) {
    if (seen.size >= MAX_CHUNKS || offset + 8 > bytes.length) invalidImage();
    const type = ascii(bytes, offset, 4),
      length = view.getUint32(offset + 4, true),
      end = offset + 8 + length;
    if (end + (length & 1) > bytes.length || seen.has(type) || (length & 1 && bytes[end] !== 0))
      invalidImage();
    const body = bytes.subarray(offset + 8, end);
    if (type === 'VP8X') {
      if (offset !== 12 || length !== 10 || body[0] & 0xc3 || body[1] || body[2] || body[3])
        invalidImage();
      flags = body[0];
      canvas = imageGrid(uint24(body, 4) + 1, uint24(body, 7) + 1);
    } else if (type === 'ALPH') {
      if (
        !canvas ||
        picture ||
        !(flags & 16) ||
        !length ||
        body[0] & 0xc0 ||
        (body[0] & 3) > 1 ||
        ((body[0] >>> 4) & 3) > 1
      )
        invalidImage();
      if (!(body[0] & 3) && length !== canvas.width * canvas.height + 1) invalidImage();
      if (body[0] & 3 && length < 2) invalidImage();
      alpha = true;
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (picture || (type === 'VP8L' && alpha)) invalidImage();
      const decoded = frame(type, body);
      picture = decoded.grid;
      alpha ||= decoded.alpha;
    } else if (type === 'ICCP' || type === 'EXIF' || type === 'XMP ') {
      const flag = type === 'ICCP' ? 32 : type === 'EXIF' ? 8 : 4;
      if (
        !canvas ||
        !(flags & flag) ||
        !length ||
        (type === 'ICCP' ? !!picture || alpha : !picture)
      )
        invalidImage();
      metadataBytes += length;
      if (metadataBytes > MAX_AI_IMAGE_METADATA_BYTES) invalidImage();
    } else invalidImage();
    seen.add(type);
    offset = end + (length & 1);
    work.charge();
    if (work.due()) await work.pause();
  }
  if (
    !picture ||
    (canvas &&
      (canvas.width !== picture.width ||
        canvas.height !== picture.height ||
        !!(flags & 16) !== alpha ||
        !!(flags & 32) !== seen.has('ICCP') ||
        !!(flags & 8) !== seen.has('EXIF') ||
        !!(flags & 4) !== seen.has('XMP ')))
  )
    invalidImage();
  return picture;
}
