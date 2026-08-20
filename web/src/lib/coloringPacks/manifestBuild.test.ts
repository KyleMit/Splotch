// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildColoringPackManifest } from '../../../coloringPackManifest';
import { booksForPlatform } from '../state/books';
import { parseColoringPackManifest } from './manifest';

// Bounds verification-metadata overhead while retaining one-document cross-tier validation.
const MAX_COLORING_PACK_MANIFEST_BYTES = 200_000;
const MAX_COMPACT_TO_FULL_RASTER_BYTES_RATIO = 0.7;

describe('buildColoringPackManifest', () => {
  it('offers every logical runtime file at compact and full resolutions', () => {
    const { manifest, source } = buildColoringPackManifest('1.2.3-test', 'mobile');
    let compactRasterBytes = 0;
    let fullRasterBytes = 0;

    for (const book of manifest.books) {
      const compact = book.variants.compact;
      const full = book.variants.full;
      expect(compact.files.length).toBeGreaterThan(0);
      expect(compact.files.length).toBe(full.files.length);
      expect(compact.files.map((file) => file.path)).toEqual(full.files.map((file) => file.path));
      expect(compact.files.some((file) => file.downloadPath?.includes('/max-'))).toBe(true);
      expect(
        compact.files
          .filter((file) => file.path.includes('.thumb.webp'))
          .every((file) => file.downloadPath === undefined)
      ).toBe(true);
      expect(
        compact.files
          .filter((file) => file.path.endsWith('.webp') && !file.path.includes('.thumb.webp'))
          .every((file) => file.downloadPath?.includes('/max-'))
      ).toBe(true);
      expect(
        compact.files
          .filter((file) => file.path.endsWith('.svg'))
          .every((file) => file.downloadPath === undefined)
      ).toBe(true);
      expect(full.files.every((file) => file.downloadPath === undefined)).toBe(true);
      expect(compact.bytes).toBeLessThan(full.bytes);
      compactRasterBytes += compact.files
        .filter((file) => file.path.endsWith('.webp'))
        .reduce((sum, file) => sum + file.bytes, 0);
      fullRasterBytes += full.files
        .filter((file) => file.path.endsWith('.webp'))
        .reduce((sum, file) => sum + file.bytes, 0);
    }

    expect(compactRasterBytes).toBeLessThan(
      fullRasterBytes * MAX_COMPACT_TO_FULL_RASTER_BYTES_RATIO
    );
    expect(Buffer.byteLength(source)).toBeLessThan(MAX_COLORING_PACK_MANIFEST_BYTES);
    expect(() => parseColoringPackManifest(manifest, '1.2.3-test')).not.toThrow();
  });

  it('ships every landscape vector overlay through both incremental variants', () => {
    const { manifest } = buildColoringPackManifest('1.2.3-test', 'mobile');
    const catalog = new Map(booksForPlatform('mobile').map((book) => [book.id, book]));

    for (const manifestBook of manifest.books) {
      const book = catalog.get(manifestBook.id);
      if (!book) throw new Error(`Missing catalog book ${manifestBook.id}`);
      const expectedLandscapePaths = book.pages.flatMap((page) => [
        `/coloring/${book.id}/${page.id}-wide.overlay.svg`,
        `/coloring/${book.id}/${page.id}-wide.dark.overlay.svg`,
      ]);

      for (const variant of Object.values(manifestBook.variants)) {
        const filesByPath = new Map(variant.files.map((file) => [file.path, file]));
        expect(
          variant.files
            .map((file) => file.path)
            .filter((path) => /-wide(?:\.dark)?\.overlay\.svg$/.test(path))
        ).toEqual(expectedLandscapePaths);
        expect(
          expectedLandscapePaths.every(
            (path) => filesByPath.has(path) && filesByPath.get(path)?.downloadPath === undefined
          )
        ).toBe(true);
        expect(filesByPath.has(book.cover)).toBe(false);
        expect(filesByPath.has(book.chalkCover)).toBe(false);
        expect(filesByPath.has(`/coloring/${book.id}/cover.thumb.webp`)).toBe(true);
        expect(filesByPath.has(`/coloring/${book.id}/cover.chalk.thumb.webp`)).toBe(true);
      }
    }
  });
});
