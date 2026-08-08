import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STARTER_COLORING_BOOK_ID,
  bookPackAssetPaths,
  booksForPlatform,
  type BookPlatform,
} from './src/lib/state/books';
import {
  COLORING_PACK_FORMAT_VERSION,
  coloringPackManifestPath,
  type ColoringPackManifest,
} from './src/lib/coloringPacks/manifest';

const STATIC_DIRECTORY = fileURLToPath(new URL('./static', import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildColoringPackManifest(
  appVersion: string,
  platform: BookPlatform
): {
  fileName: string;
  manifest: ColoringPackManifest;
  revision: string;
  source: string;
} {
  const books = booksForPlatform(platform).map((book) => {
    const files = bookPackAssetPaths(book).map((path) => {
      const bytes = readFileSync(`${STATIC_DIRECTORY}${path}`);
      return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
    });
    return {
      id: book.id,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      files,
    };
  });
  const manifest: ColoringPackManifest = {
    formatVersion: COLORING_PACK_FORMAT_VERSION,
    appVersion,
    starterBookId: STARTER_COLORING_BOOK_ID,
    books,
  };
  const source = JSON.stringify(manifest);
  return {
    fileName: coloringPackManifestPath(appVersion).slice(1),
    manifest,
    revision: sha256(Buffer.from(source)),
    source,
  };
}
