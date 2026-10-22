// Ancillary chunks that Apple's and WebKit's PNG encoders add to a canvas or view capture: eXIf (a
// TIFF stream naming the colour space and pixel dimensions) and Apple's iDOT (offsets for parallel
// decoding). Neither changes the pixels a sequential IDAT decoder produces, so the capture and AI
// PNG readers admit them after checking only their framing, and never read them further.
const APPLE_IDOT_BYTES = 28;
const EXIF_TIFF_HEADER_BYTES = 4;
const EXIF_TIFF_HEADERS = [0x49492a00, 0x4d4d002a];
const CAPTURE_METADATA = new Set(['eXIf', 'iDOT']);

export function isCaptureMetadata(type: string) {
  return CAPTURE_METADATA.has(type);
}

export function captureMetadataFits(type: string, length: number, tiffHeader: () => number) {
  if (type === 'iDOT') return length === APPLE_IDOT_BYTES;
  return length >= EXIF_TIFF_HEADER_BYTES && EXIF_TIFF_HEADERS.includes(tiffHeader() >>> 0);
}
