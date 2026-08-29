import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BOOKS,
  coloringDerivativeAssets,
  compactPresentationColoringAssets,
  coverThumbImageSource,
  selectorColoringAssets,
  presentationColoringAssets,
} from '../../../web/src/lib/state/books.ts';
import { WEB_STATIC } from '../lib/asset-paths.mjs';
import {
  RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION,
  renderDeterministicColoringSvg,
  renderResponsiveColoringAsset,
  responsiveSavingsFraction,
} from '../lib/responsive-coloring.mjs';

// The catalog fidelity pass decodes every committed derivative. Bounded concurrency keeps the
// lossless encoder below this budget without allowing the catalog to consume unbounded CI memory.
const RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS = 300_000;
const RESPONSIVE_CATALOG_TEST_CONCURRENCY = 1;
const EXPECTED_RESPONSIVE_ASSET_COUNT = 208;
const EXPECTED_SELECTOR_ASSET_COUNT = 192;
const EXPECTED_PRESENTATION_ASSET_COUNT = 192;
const EXPECTED_COMPACT_PRESENTATION_ASSET_COUNT = 192;

function srcsetWidths() {
  const widths = new Map();
  const record = ({ srcset }) => {
    for (const candidate of srcset.split(', ')) {
      const [path, descriptor] = candidate.split(' ');
      widths.set(path, Number.parseInt(descriptor, 10));
    }
  };

  for (const book of BOOKS) {
    record(coverThumbImageSource(book, 'light'));
    record(coverThumbImageSource(book, 'dark'));
  }
  return widths;
}

// A fill is painted into the canvas rather than laid out from a srcset, so it carries no width
// descriptor at all. Deriving the expected descriptor from the encoding keeps that a checked
// fact for every asset — a fill that started shipping a descriptor now fails.
const expectedDescriptor = (asset, intrinsicWidth) =>
  asset.encoding === 'thumbnail' ? intrinsicWidth : undefined;

async function forEachWithConcurrency(items, task) {
  let nextItemIndex = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(RESPONSIVE_CATALOG_TEST_CONCURRENCY, items.length) },
      async () => {
        while (nextItemIndex < items.length) {
          const itemIndex = nextItemIndex;
          nextItemIndex += 1;
          await task(items[itemIndex]);
        }
      }
    )
  );
}

describe('responsive coloring catalog', () => {
  it(
    'regenerates every raster derivative exactly and keeps srcset descriptors intrinsic',
    async () => {
      const widths = srcsetWidths();
      const assets = BOOKS.flatMap(coloringDerivativeAssets);
      let sourceBytes = 0;
      let targetBytes = 0;

      expect(
        assets.filter((asset) => !['selector', 'presentation'].includes(asset.encoding))
      ).toHaveLength(EXPECTED_RESPONSIVE_ASSET_COUNT);
      expect(assets.filter((asset) => asset.encoding === 'selector')).toHaveLength(
        EXPECTED_SELECTOR_ASSET_COUNT
      );
      expect(BOOKS.flatMap(presentationColoringAssets)).toHaveLength(
        EXPECTED_PRESENTATION_ASSET_COUNT
      );
      expect(BOOKS.flatMap(compactPresentationColoringAssets)).toHaveLength(
        EXPECTED_COMPACT_PRESENTATION_ASSET_COUNT
      );
      await forEachWithConcurrency(assets, async (asset) => {
        const sourceMetadata = await sharp(join(WEB_STATIC, asset.source)).metadata();
        const targetMetadata = await sharp(join(WEB_STATIC, asset.target)).metadata();
        expect(widths.get(asset.source), asset.source).toBe(
          expectedDescriptor(asset, sourceMetadata.width)
        );
        expect(widths.get(asset.target), asset.target).toBe(
          expectedDescriptor(asset, targetMetadata.width)
        );
        expect(targetMetadata.width, asset.target).toBe(asset.widthPx);
        expect(Math.max(targetMetadata.width ?? 0, targetMetadata.height ?? 0), asset.target).toBe(
          asset.maxEdgePx
        );
        expect(targetMetadata.hasAlpha, asset.target).toBe(sourceMetadata.hasAlpha);
        const sourcePath = join(WEB_STATIC, asset.source);
        const targetPath = join(WEB_STATIC, asset.target);
        const regenerated = await renderResponsiveColoringAsset(sourcePath, asset);
        expect(regenerated.equals(await readFile(targetPath)), asset.target).toBe(true);
      });
      const compressibleAssets = assets.filter((asset) => asset.encoding !== 'presentation');
      await forEachWithConcurrency(compressibleAssets, async (asset) => {
        const sourceSize = (await stat(join(WEB_STATIC, asset.source))).size;
        const targetSize = (await stat(join(WEB_STATIC, asset.target))).size;
        expect(targetSize, asset.target).toBeLessThan(sourceSize);
        sourceBytes += sourceSize;
        targetBytes += targetSize;
      });
      expect((sourceBytes - targetBytes) / sourceBytes).toBeGreaterThanOrEqual(
        RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION
      );
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it(
    'preserves every canonical SVG pixel in the canvas presentation rasters',
    async () => {
      const assets = BOOKS.flatMap((book) => [
        ...presentationColoringAssets(book),
        ...compactPresentationColoringAssets(book),
      ]);
      await forEachWithConcurrency(assets, async (asset) => {
        const reference = await renderDeterministicColoringSvg(
          join(WEB_STATIC, asset.source),
          asset
        );
        const actual = await sharp(join(WEB_STATIC, asset.target)).ensureAlpha().raw().toBuffer();
        expect(actual.equals(Buffer.from(reference.pixels)), asset.target).toBe(true);
      });
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it(
    'preserves selector alpha and visible pixels against the canonical SVG rasterization',
    async () => {
      await forEachWithConcurrency(BOOKS.flatMap(selectorColoringAssets), async (asset) => {
        const reference = await renderDeterministicColoringSvg(
          join(WEB_STATIC, asset.source),
          asset
        );
        const actual = await sharp(join(WEB_STATIC, asset.target)).ensureAlpha().raw().toBuffer();
        expect(actual.equals(Buffer.from(reference.pixels)), asset.target).toBe(true);
      });
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it('fails closed when no compressible source bytes were measured', () => {
    expect(() => responsiveSavingsFraction(0, 0)).toThrow('no source bytes');
  });
});
