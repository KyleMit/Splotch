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
    const responsiveAssets = responsiveColoringAssets(book);
    const compactPaths = new Map(
      responsiveAssets
        .filter((asset) => asset.encoding !== 'thumbnail')
        .map((asset) => [asset.source, asset.target])
    );
    const canonicalThumbnailPaths = new Set(
      responsiveAssets
        .filter((asset) => asset.encoding === 'thumbnail')
        .map((asset) => asset.source)
    );
    const invariantPaths = new Set(canonicalPaths.filter((path) => path.endsWith('.svg')));
    if (
      compactPaths.size + canonicalThumbnailPaths.size + invariantPaths.size !==
      canonicalPaths.length
    ) {
      throw new Error(`Compact coloring-pack inventory is incomplete for ${book.id}`);
    }
    const variant = (resolution: ColoringPackResolution) => {
      const files = canonicalPaths.map((path) => {
        const downloadPath =
          resolution === 'compact' &&
          !canonicalThumbnailPaths.has(path) &&
          !invariantPaths.has(path)
            ? compactPaths.get(path)
            : path;
        if (!downloadPath) throw new Error(`No compact coloring asset for ${path}`);
        const bytes = readFileSync(`${STATIC_DIRECTORY}${downloadPath}`);
        return {
          path,
          ...(downloadPath === path ? {} : { downloadPath }),
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
