import type { PaperSize } from '../drawing/paperSpace';
import { MAX_UPLOAD_BYTES } from './contract';
const PNG_HEADER_BYTES = 33;
const PNG_IHDR_LENGTH = 13;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function prepareAiPng(base64: string, size: PaperSize): Uint8Array {
  if (
    !base64 ||
    base64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 ||
    base64.length % 4 !== 0 ||
    !BASE64.test(base64)
  )
    throw new Error('This drawing is too large or could not be prepared for AI.');
  const raw = atob(base64);
  if (!raw.length || raw.length > MAX_UPLOAD_BYTES)
    throw new Error('This drawing is too large for AI.');
  const bytes = Uint8Array.from(raw, (value) => value.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value))
    throw new Error('Drawing capture is not a PNG.');
  if (bytes.length < PNG_HEADER_BYTES) throw new Error('Drawing capture has no PNG header.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    header.getUint32(8) !== PNG_IHDR_LENGTH ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' ||
    header.getUint32(PNG_WIDTH_OFFSET) !== size.width ||
    header.getUint32(PNG_HEIGHT_OFFSET) !== size.height
  )
    throw new Error('Drawing capture has unsupported dimensions.');
  return bytes;
}
