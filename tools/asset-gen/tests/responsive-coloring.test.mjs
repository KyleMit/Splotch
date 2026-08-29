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
  renderResponsiveColoringAsset,
  responsiveSavingsFraction,
} from '../lib/responsive-coloring.mjs';

// Vitest runs this file beside other Sharp-heavy asset suites. Serializing this catalog prevents
// this worker from multiplying libvips work and starving sibling tests; the standalone generator
// retains its own bounded concurrency.
const RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS = 300_000;
const RESPONSIVE_CATALOG_TEST_CONCURRENCY = 1;
const EXPECTED_RESPONSIVE_ASSET_COUNT = 208;
const EXPECTED_SELECTOR_ASSET_COUNT = 192;
const EXPECTED_PRESENTATION_ASSET_COUNT = 192;
const EXPECTED_COMPACT_PRESENTATION_ASSET_COUNT = 192;
const MAX_COMPACT_PRESENTATION_ALPHA_MAE = 2;
const MAX_SELECTOR_ALPHA_MAE = 3;

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

async function crossArtifactAlphaMae(fullPresentationPath, derivativePath) {
  const derivative = sharp(derivativePath);
  const { width, height } = await derivative.metadata();
  if (!width || !height) {
    throw new Error(`Missing derivative dimensions: ${derivativePath}`);
  }
  const actual = await derivative.ensureAlpha().raw().toBuffer();
  const reference = await sharp(fullPresentationPath)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  let totalAlphaDifference = 0;
  for (let index = 3; index < actual.length; index += 4) {
    totalAlphaDifference += Math.abs(actual[index] - reference[index]);
  }
  return totalAlphaDifference / (actual.length / 4);
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
    'keeps compact presentation and selector edges consistent with the full presentation',
    async () => {
      for (const book of BOOKS) {
        const fullPresentationBySource = new Map(
          presentationColoringAssets(book).map((asset) => [asset.source, asset])
        );
        const assertDerivativeFidelity = async (asset, maximumAlphaMae) => {
          const fullPresentation = fullPresentationBySource.get(asset.source);
          expect(fullPresentation, asset.source).toBeDefined();
          const alphaMae = await crossArtifactAlphaMae(
            join(WEB_STATIC, fullPresentation.target),
            join(WEB_STATIC, asset.target)
          );
          expect(alphaMae, asset.target).toBeLessThanOrEqual(maximumAlphaMae);
        };
        await forEachWithConcurrency(compactPresentationColoringAssets(book), (asset) =>
          assertDerivativeFidelity(asset, MAX_COMPACT_PRESENTATION_ALPHA_MAE)
        );
        await forEachWithConcurrency(selectorColoringAssets(book), (asset) =>
          assertDerivativeFidelity(asset, MAX_SELECTOR_ALPHA_MAE)
        );
      }
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it('fails closed when no compressible source bytes were measured', () => {
    expect(() => responsiveSavingsFraction(0, 0)).toThrow('no source bytes');
  });
});
