import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

// Browsers decode a data URI by its declared type and never sniff the bytes, so an
// SVG declared as image/webp fails to load. The type follows the file's extension.
const MIME_TYPES = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function mimeTypeForPath(path) {
  const mime = MIME_TYPES[extname(path)];
  if (!mime) throw new Error(`no data-URI MIME type for ${path}`);
  return mime;
}

export function bytesToDataUri(bytes, mime) {
  if (!mime) throw new Error('bytesToDataUri needs a MIME type');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export function fileToDataUri(path) {
  const mime = mimeTypeForPath(path);
  if (!existsSync(path)) return null;
  return bytesToDataUri(readFileSync(path), mime);
}
