// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildColoringPackManifest } from '../../../coloringPackManifest';
import { booksForPlatform } from '../state/books';
import { parseColoringPackManifest } from './manifest';

// Bounds verification-metadata overhead per recorded file while retaining one-document
// cross-tier validation as the catalog grows. This is slightly tighter than the former
// 200 KB ceiling at the inventory size that ceiling guarded.
const MAX_COLORING_PACK_MANIFEST_BYTES_PER_FILE = 168;
const MAX_COMPACT_TO_FULL_TIERED_RASTER_BYTES_RATIO = 0.7;

function isTieredRaster(path: string): boolean {
  return path.endsWith('.webp') && !/\.(?:thumb|selector|presentation)\.webp$/.test(path);
}

const isPresentationTier = (path: string) => path.endsWith('.presentation.webp');

describe('buildColoringPackManifest', () => {
  it('offers every logical runtime file at compact and full resolutions', () => {
    const { manifest, source } = buildColoringPackManifest('1.2.3-test', 'mobile');
    let compactRasterBytes = 0;
    let fullRasterBytes = 0;
    let manifestFileCount = 0;

    for (const book of manifest.books) {
      const compact = book.variants.compact;
      const full = book.variants.full;
      expect(compact.files.length).toBeGreaterThan(0);
      expect(compact.files.length).toBe(full.files.length);
      manifestFileCount += compact.files.length + full.files.length;
      expect(compact.files.map((file) => file.path)).toEqual(full.files.map((file) => file.path));
      expect(compact.files.some((file) => file.downloadPath?.includes('/max-'))).toBe(true);
      expect(
        compact.files
          .filter((file) => file.path.includes('.thumb.webp'))
          .every((file) => file.downloadPath === undefined)
      ).toBe(true);
      expect(
        compact.files
          .filter((file) => isTieredRaster(file.path))
          .every((file) => file.downloadPath?.includes('/max-'))
      ).toBe(true);
      expect(
        compact.files
          .filter((file) => file.path.endsWith('.selector.webp'))
          .every((file) => file.downloadPath === undefined)
      ).toBe(true);
      expect(compact.files.some((file) => file.path.endsWith('.presentation.webp'))).toBe(false);
      expect(full.files.some((file) => file.path.endsWith('.presentation.webp'))).toBe(false);
      expect(
        compact.files
          .filter((file) => file.path.endsWith('.svg'))
          .every((file) => file.downloadPath === undefined)
      ).toBe(true);
      expect(full.files.every((file) => file.downloadPath === undefined)).toBe(true);
      expect(compact.bytes).toBeLessThan(full.bytes);
      compactRasterBytes += compact.files
        .filter((file) => isTieredRaster(file.path))
        .reduce((sum, file) => sum + file.bytes, 0);
      fullRasterBytes += full.files
        .filter((file) => isTieredRaster(file.path))
        .reduce((sum, file) => sum + file.bytes, 0);
    }

    expect(compactRasterBytes).toBeLessThan(
      fullRasterBytes * MAX_COMPACT_TO_FULL_TIERED_RASTER_BYTES_RATIO
    );
    expect(Buffer.byteLength(source)).toBeLessThan(
      manifestFileCount * MAX_COLORING_PACK_MANIFEST_BYTES_PER_FILE
    );
    expect(() => parseColoringPackManifest(manifest, '1.2.3-test')).not.toThrow();
  });

  it('keeps full-page art canonical SVG in both web pack variants', () => {
    const { manifest } = buildColoringPackManifest('1.2.3-test', 'web');

    for (const book of manifest.books) {
      for (const variant of Object.values(book.variants)) {
        expect(variant.files.filter((file) => file.path.endsWith('.overlay.svg'))).toHaveLength(24);
        expect(
          variant.files
            .filter((file) => file.path.endsWith('.overlay.svg'))
            .every((file) => file.downloadPath === undefined)
        ).toBe(true);
      }
    }
  });

  it('carries the paper presentation tiers a web device class can select, under their tier URLs', () => {
    const { manifest, source } = buildColoringPackManifest('1.2.3-test', 'web');
    const catalog = new Map(booksForPlatform('web').map((book) => [book.id, book]));
    let manifestFileCount = 0;

    for (const book of manifest.books) {
      const compactTiers = book.variants.compact.files.filter((file) =>
        isPresentationTier(file.path)
      );
      const fullTiers = book.variants.full.files.filter((file) => isPresentationTier(file.path));
      // Two orientations and two themes per catalog page.
      const pageVariants = catalog.get(book.id)!.pages.length * 4;
      expect(compactTiers).toHaveLength(pageVariants);
      expect(fullTiers).toHaveLength(pageVariants * 4);
      expect(compactTiers.every((file) => file.path.startsWith('/coloring/max-1152px/'))).toBe(
        true
      );
      expect(new Set(fullTiers.map((file) => /max-(\d+)px/.exec(file.path)?.[1]))).toEqual(
        new Set(['1152', '1536', '2304', '3072'])
      );
      for (const file of [...compactTiers, ...fullTiers]) {
        expect(file.downloadPath, file.path).toBeUndefined();
        expect(file.path).toContain(`/${book.id}/`);
      }
      const logical = (files: { path: string }[]) =>
        files.map((file) => file.path).filter((path) => !isPresentationTier(path));
      expect(logical(book.variants.compact.files)).toEqual(logical(book.variants.full.files));
      manifestFileCount += book.variants.compact.files.length + book.variants.full.files.length;
    }
    expect(Buffer.byteLength(source)).toBeLessThan(
      manifestFileCount * MAX_COLORING_PACK_MANIFEST_BYTES_PER_FILE
    );
    expect(() => parseColoringPackManifest(manifest, '1.2.3-test')).not.toThrow();
  });

  it('installs no hosted presentation tier into a native pack', () => {
    const { manifest } = buildColoringPackManifest('1.2.3-test', 'mobile');
    for (const book of manifest.books) {
      for (const variant of Object.values(book.variants)) {
        expect(variant.files.some((file) => isPresentationTier(file.path))).toBe(false);
        expect(variant.files.some((file) => file.path.includes('/max-'))).toBe(false);
      }
    }
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
        expect(filesByPath.has(book.darkCover)).toBe(false);
        expect(filesByPath.has(`/coloring/${book.id}/cover.thumb.webp`)).toBe(true);
        expect(filesByPath.has(`/coloring/${book.id}/cover.chalk.thumb.webp`)).toBe(true);
      }
    }
  });
});
