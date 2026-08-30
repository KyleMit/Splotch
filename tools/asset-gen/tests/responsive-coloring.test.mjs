import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import {
  BOOKS,
  coloringDerivativeAssets,
  coverThumbImageSource,
  pageSelectorImageSource,
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
const EXPECTED_SELECTOR_ASSET_COUNT = 384;

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
    for (const page of book.pages) {
      for (const orientation of ['portrait', 'landscape']) {
        record(pageSelectorImageSource(page, orientation, 'light'));
        record(pageSelectorImageSource(page, orientation, 'dark'));
      }
    }
  }
  return widths;
}

// A fill is painted into the canvas rather than laid out from a srcset, so it carries no width
// descriptor at all. Deriving the expected descriptor from the encoding keeps that a checked
// fact for every asset — a fill that started shipping a descriptor now fails.
const expectedSourceDescriptor = (asset, intrinsicWidth) =>
  asset.encoding === 'thumbnail' ? intrinsicWidth : undefined;
const expectedTargetDescriptor = (asset, intrinsicWidth) =>
  asset.encoding === 'thumbnail' || asset.encoding === 'selector' ? intrinsicWidth : undefined;

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

async function deterministicSvgPixels(sourcePath, asset) {
  const fitTo =
    asset.widthPx < asset.maxEdgePx
      ? { mode: 'height', value: asset.maxEdgePx }
      : { mode: 'width', value: asset.maxEdgePx };
  const rendered = new Resvg(await readFile(sourcePath), {
    fitTo,
    shapeRendering: 2,
    imageRendering: 1,
    font: { loadSystemFonts: false },
  }).render();
  expect(rendered.width, asset.target).toBe(asset.widthPx);
  expect(Math.max(rendered.width, rendered.height), asset.target).toBe(asset.maxEdgePx);
  return Buffer.from(rendered.pixels);
}

describe('responsive coloring catalog', () => {
  it(
    'regenerates every raster derivative exactly and keeps srcset descriptors intrinsic',
    async () => {
      const widths = srcsetWidths();
      const assets = BOOKS.flatMap(coloringDerivativeAssets);
      let sourceBytes = 0;
      let targetBytes = 0;

      expect(assets.filter((asset) => asset.encoding !== 'selector')).toHaveLength(
        EXPECTED_RESPONSIVE_ASSET_COUNT
      );
      expect(assets.filter((asset) => asset.encoding === 'selector')).toHaveLength(
        EXPECTED_SELECTOR_ASSET_COUNT
      );
      await forEachWithConcurrency(assets, async (asset) => {
        const sourceMetadata = await sharp(join(WEB_STATIC, asset.source)).metadata();
        const targetMetadata = await sharp(join(WEB_STATIC, asset.target)).metadata();
        expect(widths.get(asset.source), asset.source).toBe(
          expectedSourceDescriptor(asset, sourceMetadata.width)
        );
        expect(widths.get(asset.target), asset.target).toBe(
          expectedTargetDescriptor(asset, targetMetadata.width)
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
      await forEachWithConcurrency(assets, async (asset) => {
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
    'keeps every selector tier pixel-exact to its canonical SVG render',
    async () => {
      const selectors = BOOKS.flatMap(coloringDerivativeAssets).filter(
        (asset) => asset.encoding === 'selector'
      );
      expect(selectors).toHaveLength(EXPECTED_SELECTOR_ASSET_COUNT);
      await forEachWithConcurrency(selectors, async (asset) => {
        const sourcePath = join(WEB_STATIC, asset.source);
        const targetPath = join(WEB_STATIC, asset.target);
        const actual = await sharp(targetPath).ensureAlpha().raw().toBuffer();
        expect(actual.equals(await deterministicSvgPixels(sourcePath, asset)), asset.target).toBe(
          true
        );
      });
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it('fails closed when no compressible source bytes were measured', () => {
    expect(() => responsiveSavingsFraction(0, 0)).toThrow('no source bytes');
  });
});
