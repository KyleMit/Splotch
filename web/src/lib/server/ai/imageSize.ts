// Reads the pixel dimensions of an uploaded drawing straight from its header
// bytes, so the AI adapter can ask the image model for a canvas that matches
// the shape the child drew on.
//
// The image tool renders onto a canvas of a size the caller picks, and picking
// it wrong is not cosmetic — a tall drawing rendered onto a square canvas has the
// child's own composition cropped or letterboxed. Deriving the shape here rather
// than adding a request header keeps every already-shipped native client working:
// they send bytes and nothing else.
//
// Only the two formats the client actually uploads are parsed — PNG, and the
// WebP it prefers when the platform can encode one (see encodeWebpUpload in
// lib/drawing/aiImage.ts). Anything else falls back to a square canvas.

export interface PixelSize {
  width: number;
  height: number;
}

/** The image sizes the OpenAI image tool is asked for, one per canvas shape. */
export const IMAGE_SIZES = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
} as const;

export type ImageSize = (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES];

// Aspect ratios within this band of 1:1 are treated as square rather than
// pushed onto a 3:2 canvas the drawing never filled.
const SQUARE_ASPECT_TOLERANCE = 0.15;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const PNG_IHDR_WIDTH_OFFSET = 16;
const PNG_IHDR_HEIGHT_OFFSET = 20;
// RIFF container: "RIFF" <u32 size> "WEBP" <4-byte chunk tag> …
const WEBP_CHUNK_TAG_OFFSET = 12;
// Each WebP variant packs its dimensions at its own fixed offset past the tag,
// and they do NOT agree on the encoding: lossy VP8 stores the dimension itself,
// while VP8L and VP8X store (dimension - 1) and have to add it back. Verified
// against real sharp-encoded images of every variant in imageSize.test.ts.
const VP8_DIMENSION_OFFSET = 26;
const VP8L_DIMENSION_OFFSET = 21;
const VP8X_DIMENSION_OFFSET = 24;
// VP8 and VP8L pack dimensions into 14 bits; VP8X uses 24.
const FOURTEEN_BIT_MASK = 0x3fff;

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const readU32BE = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];

const readU24LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

function pngSize(bytes: Uint8Array): PixelSize | null {
  if (bytes.length < PNG_IHDR_HEIGHT_OFFSET + 4) return null;
  return {
    width: readU32BE(bytes, PNG_IHDR_WIDTH_OFFSET),
    height: readU32BE(bytes, PNG_IHDR_HEIGHT_OFFSET),
  };
}

function webpSize(bytes: Uint8Array): PixelSize | null {
  const tag = ascii(bytes, WEBP_CHUNK_TAG_OFFSET, 4);

  if (tag === 'VP8 ' && bytes.length >= VP8_DIMENSION_OFFSET + 4) {
    return {
      width:
        (bytes[VP8_DIMENSION_OFFSET] | (bytes[VP8_DIMENSION_OFFSET + 1] << 8)) & FOURTEEN_BIT_MASK,
      height:
        (bytes[VP8_DIMENSION_OFFSET + 2] | (bytes[VP8_DIMENSION_OFFSET + 3] << 8)) &
        FOURTEEN_BIT_MASK,
    };
  }

  if (tag === 'VP8L' && bytes.length >= VP8L_DIMENSION_OFFSET + 4) {
    // 14 bits of (width-1) then 14 bits of (height-1), little-endian across the
    // four bytes that follow the 0x2f signature byte.
    const packed =
      bytes[VP8L_DIMENSION_OFFSET] |
      (bytes[VP8L_DIMENSION_OFFSET + 1] << 8) |
      (bytes[VP8L_DIMENSION_OFFSET + 2] << 16) |
      (bytes[VP8L_DIMENSION_OFFSET + 3] << 24);
    return {
      width: (packed & FOURTEEN_BIT_MASK) + 1,
      height: ((packed >>> 14) & FOURTEEN_BIT_MASK) + 1,
    };
  }

  if (tag === 'VP8X' && bytes.length >= VP8X_DIMENSION_OFFSET + 6) {
    return {
      width: readU24LE(bytes, VP8X_DIMENSION_OFFSET) + 1,
      height: readU24LE(bytes, VP8X_DIMENSION_OFFSET + 3) + 1,
    };
  }

  return null;
}

/** Pixel dimensions of a PNG or WebP buffer, or null for anything else. */
export function readImageSize(bytes: Uint8Array): PixelSize | null {
  if (bytes.length < WEBP_CHUNK_TAG_OFFSET + 4) return null;
  const size = startsWith(bytes, PNG_SIGNATURE)
    ? pngSize(bytes)
    : ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
      ? webpSize(bytes)
      : null;
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * The image size to render a drawing of these dimensions at. A drawing whose
 * dimensions can't be read renders square — the shape most toddler canvases
 * are, and the one that crops least when it is wrong.
 */
export function imageSizeFor(size: PixelSize | null): ImageSize {
  if (!size) return IMAGE_SIZES.square;
  const aspect = size.width / size.height;
  if (Math.abs(aspect - 1) <= SQUARE_ASPECT_TOLERANCE) return IMAGE_SIZES.square;
  return aspect > 1 ? IMAGE_SIZES.landscape : IMAGE_SIZES.portrait;
}
