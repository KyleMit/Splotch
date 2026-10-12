import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  generateResponsiveColoringAssets,
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

describe('responsive coloring generation', () => {
  const TRACKED_BYTES = 'tracked derivative';
  let staticDir;

  const fillAsset = (name, widthPx) => ({
    source: `book/${name}.light.png`,
    target: `max-400px/book/${name}.light.webp`,
    maxEdgePx: 400,
    widthPx,
    encoding: 'fill',
  });

  async function addSource(asset) {
    const noisyPortrait = await sharp({
      create: {
        width: 600,
        height: 800,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(join(staticDir, asset.source), noisyPortrait);
  }

  async function addTrackedTarget(asset) {
    await mkdir(join(staticDir, 'max-400px/book'), { recursive: true });
    await writeFile(join(staticDir, asset.target), TRACKED_BYTES);
  }

  beforeEach(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'splotch-responsive-coloring-'));
    await mkdir(join(staticDir, 'book'), { recursive: true });
  });

  afterEach(async () => {
    await rm(staticDir, { recursive: true, force: true });
  });

  it('replaces tracked derivatives once every derivative passes its checks', async () => {
    const asset = fillAsset('ok', 300);
    await addSource(asset);
    await addTrackedTarget(asset);

    const result = await generateResponsiveColoringAssets(staticDir, [asset]);

    const written = await readFile(join(staticDir, asset.target));
    expect(written.toString()).not.toBe(TRACKED_BYTES);
    expect(await sharp(written).metadata()).toMatchObject({ width: 300, height: 400 });
    expect(result).toMatchObject({ count: 1, outputBytes: written.length });
  });

  it('leaves every tracked derivative untouched when any derivative fails a check', async () => {
    const passing = fillAsset('ok', 300);
    const wrongWidth = fillAsset('wrong-width', 123);
    for (const asset of [passing, wrongWidth]) {
      await addSource(asset);
      await addTrackedTarget(asset);
    }

    await expect(
      generateResponsiveColoringAssets(staticDir, [passing, wrongWidth])
    ).rejects.toThrow(`${wrongWidth.target} generated at 300x400; expected width 123px`);

    for (const asset of [passing, wrongWidth]) {
      await expect(readFile(join(staticDir, asset.target), 'utf8')).resolves.toBe(TRACKED_BYTES);
    }
  });
});
