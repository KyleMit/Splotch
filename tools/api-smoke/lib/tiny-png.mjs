// A 1×1 PNG: a real image small enough for every upload guard the smoke reaches.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function tinyPngBuffer() {
  return Buffer.from(TINY_PNG_BASE64, 'base64');
}
