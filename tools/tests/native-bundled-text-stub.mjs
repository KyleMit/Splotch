import { readFile } from 'node:fs/promises';

// Vite imports a bundled file as its "/@fs"-prefixed absolute path, so the Node tests read the
// shipped file the native apps would read from their package.
const VITE_FILE_PREFIX = '/@fs';

export async function readBundledText(asset) {
  if (typeof asset !== 'string' || !asset.startsWith(`${VITE_FILE_PREFIX}/`))
    throw new Error(`Unexpected bundled text asset ${String(asset)}`);
  return readFile(asset.slice(VITE_FILE_PREFIX.length), 'utf8');
}
