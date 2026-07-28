import { existsSync, readFileSync } from 'node:fs';

export function bytesToDataUri(bytes, mime = 'image/webp') {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export function fileToDataUri(path, mime = 'image/webp') {
  if (!existsSync(path)) return null;
  return bytesToDataUri(readFileSync(path), mime);
}
