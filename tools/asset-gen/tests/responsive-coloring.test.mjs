import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BOOKS,
  coloringDerivativeAssets,
  coverThumbImageSource,
  responsiveColoringAssets,
  selectorColoringAssets,
  presentationColoringAssets,
} from '../../../web/src/lib/state/books.ts';
import { WEB_STATIC } from '../lib/asset-paths.mjs';
import {
  RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION,
  renderResponsiveColoringAsset,
} from '../lib/responsive-coloring.mjs';

// The catalog fidelity pass decodes every committed derivative. Bounded concurrency keeps the
// lossless encoder below this budget without allowing the catalog to consume unbounded CI memory.
const RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS = 300_000;
const RESPONSIVE_CATALOG_TEST_CONCURRENCY = 4;
const EXPECTED_RESPONSIVE_ASSET_COUNT = 208;
const EXPECTED_SELECTOR_ASSET_COUNT = 192;
const EXPECTED_PRESENTATION_ASSET_COUNT = 192;
const SELECTOR_INK_ALPHA_THRESHOLD = 105;
const SELECTOR_MAX_PREMULTIPLIED_MAE = 0.1;

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
      expect(assets.filter((asset) => asset.encoding === 'presentation')).toHaveLength(
        EXPECTED_PRESENTATION_ASSET_COUNT
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
        const sourceSize = (await stat(sourcePath)).size;
        const targetSize = (await stat(targetPath)).size;
        if (asset.encoding !== 'presentation') {
          expect(targetSize, asset.target).toBeLessThan(sourceSize);
          sourceBytes += sourceSize;
          targetBytes += targetSize;
        }

        const regenerated = await renderResponsiveColoringAsset(sourcePath, asset);
        expect(regenerated.equals(await readFile(targetPath)), asset.target).toBe(true);
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
      await forEachWithConcurrency(BOOKS.flatMap(presentationColoringAssets), async (asset) => {
        const reference = await sharp(join(WEB_STATIC, asset.source))
          .ensureAlpha()
          .raw()
          .toBuffer();
        const actual = await sharp(join(WEB_STATIC, asset.target)).ensureAlpha().raw().toBuffer();
        expect(actual.equals(reference), asset.target).toBe(true);
      });
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it(
    'preserves selector alpha and visible pixels against the canonical SVG rasterization',
    async () => {
      await forEachWithConcurrency(BOOKS.flatMap(selectorColoringAssets), async (asset) => {
        const reference = await sharp(join(WEB_STATIC, asset.source))
          .resize(asset.maxEdgePx, asset.maxEdgePx, {
            fit: 'inside',
            kernel: 'lanczos3',
            withoutEnlargement: true,
          })
          .ensureAlpha()
          .raw()
          .toBuffer();
        const actual = await sharp(join(WEB_STATIC, asset.target)).ensureAlpha().raw().toBuffer();
        let premultipliedError = 0;
        let intersection = 0;
        let union = 0;
        for (let offset = 0; offset < reference.length; offset += 4) {
          const referenceAlpha = reference[offset + 3];
          const actualAlpha = actual[offset + 3];
          expect(actualAlpha, `${asset.target} alpha at pixel ${offset / 4}`).toBe(referenceAlpha);
          const referenceInk = referenceAlpha > SELECTOR_INK_ALPHA_THRESHOLD;
          const actualInk = actualAlpha > SELECTOR_INK_ALPHA_THRESHOLD;
          if (referenceInk && actualInk) intersection += 1;
          if (referenceInk || actualInk) union += 1;
          for (let channel = 0; channel < 4; channel += 1) {
            const referenceValue =
              channel === 3 ? referenceAlpha : (reference[offset + channel] * referenceAlpha) / 255;
            const actualValue =
              channel === 3 ? actualAlpha : (actual[offset + channel] * actualAlpha) / 255;
            premultipliedError += Math.abs(referenceValue - actualValue);
          }
        }
        const premultipliedMae = premultipliedError / reference.length;
        expect(premultipliedMae, asset.target).toBeLessThanOrEqual(SELECTOR_MAX_PREMULTIPLIED_MAE);
        expect(intersection / union, asset.target).toBe(1);
      });
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );
});
