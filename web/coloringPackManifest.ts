import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STARTER_COLORING_BOOK_ID,
  bookPackAssetPaths,
  booksForPlatform,
  responsiveColoringAssets,
  type BookPlatform,
} from './src/lib/state/books.ts';
import {
  COLORING_PACK_FORMAT_VERSION,
  coloringPackManifestPath,
  type ColoringPackManifest,
} from './src/lib/coloringPacks/manifest.ts';
import type { ColoringPackResolution } from './src/lib/coloringPacks/resolution.ts';

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
    const canonicalPaths = bookPackAssetPaths(book);
    const compactPaths = new Map(
      responsiveColoringAssets(book).map((asset) => [asset.source, asset.target])
    );
    if (compactPaths.size !== canonicalPaths.length) {
      throw new Error(`Compact coloring-pack inventory is incomplete for ${book.id}`);
    }
    const variant = (resolution: ColoringPackResolution) => {
      const files = canonicalPaths.map((path) => {
        const downloadPath = resolution === 'compact' ? compactPaths.get(path) : path;
        if (!downloadPath) throw new Error(`No compact coloring asset for ${path}`);
        const bytes = readFileSync(`${STATIC_DIRECTORY}${downloadPath}`);
        return {
          path,
          downloadPath,
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
        };
      });
      return { bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
    };
    return {
      id: book.id,
      variants: {
        compact: variant('compact'),
        full: variant('full'),
      },
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
