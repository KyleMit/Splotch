import { MAX_RESULT_BYTES } from './contract';
import { assertPngGrid, type PngGrid } from '../drawing/pngLimits';
export const MAX_AI_IMAGE_DIMENSION_PX = 4096;
export const MAX_AI_IMAGE_PIXELS = 4 * 1024 * 1024;
export const MAX_AI_DECODED_BYTES = MAX_AI_IMAGE_PIXELS * 4;
export const AI_IMAGE_DECODE_TIMEOUT_MS = 10_000;
export const MAX_AI_IMAGE_METADATA_BYTES = 64 * 1024;
export function invalidImage(): never {
  throw new Error('AI picture is incomplete, corrupt, too large or unsupported.');
}
export function imageGrid(width: number, height: number): PngGrid {
  const grid = { width, height };
  assertPngGrid(grid);
  if (
    width > MAX_AI_IMAGE_DIMENSION_PX ||
    height > MAX_AI_IMAGE_DIMENSION_PX ||
    width * height > MAX_AI_IMAGE_PIXELS
  )
    invalidImage();
  return grid;
}
export function imageBytes(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_RESULT_BYTES)
    invalidImage();
}
export function ascii(bytes: Uint8Array, offset: number, count: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + count));
}
