import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BOOKS,
  coverThumbImageSource,
  pageOverlayImageSource,
  pageThumbImageSource,
  responsiveColoringAssets,
} from '../../../web/src/lib/state/books.ts';
import { WEB_STATIC } from '../lib/asset-paths.mjs';
import { maxOverlayAlphaError, OVERLAY_MAX_CHANNEL_ERROR } from '../lib/overlay-alpha.mjs';
import {
  RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION,
  renderResponsiveColoringAsset,
} from '../lib/responsive-coloring.mjs';

// The catalog fidelity pass decodes every committed derivative and is I/O-bound on CI runners. Its
// wall time tracks how many sibling files vitest decodes on the same cores, not its own work, so the
// budget is several times the solo run — a margin under contention, not a performance assertion.
const RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS = 120_000;

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
        for (const theme of ['light', 'dark']) {
          record(pageOverlayImageSource(page, orientation, theme));
          record(pageThumbImageSource(page, orientation, theme));
        }
      }
    }
  }
  return widths;
}

// A fill is painted into the canvas rather than laid out from a srcset, so it carries no width
// descriptor at all. Deriving the expected descriptor from the encoding keeps that a checked
// fact for every asset — a fill that started shipping a descriptor now fails.
const expectedDescriptor = (asset, intrinsicWidth) =>
  asset.encoding === 'fill' ? undefined : intrinsicWidth;

describe('responsive coloring catalog', () => {
  it(
    'regenerates every derivative exactly and keeps srcset descriptors intrinsic',
    async () => {
      const widths = srcsetWidths();
      const assets = BOOKS.flatMap(responsiveColoringAssets);
      let sourceBytes = 0;
      let targetBytes = 0;

      // Invariant SVG overlays replace their canonical WebP and responsive derivative together.
      expect(assets).toHaveLength(589);
      for (const asset of assets) {
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
        expect(targetSize, asset.target).toBeLessThan(sourceSize);
        sourceBytes += sourceSize;
        targetBytes += targetSize;

        const regenerated = await renderResponsiveColoringAsset(sourcePath, asset);
        expect(regenerated.equals(await readFile(targetPath)), asset.target).toBe(true);
      }
      expect((sourceBytes - targetBytes) / sourceBytes).toBeGreaterThanOrEqual(
        RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION
      );
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );

  it(
    'keeps every overlay within alpha tolerance of a direct resize',
    async () => {
      const overlays = BOOKS.flatMap(responsiveColoringAssets).filter(
        (asset) => asset.encoding === 'overlay'
      );

      expect(overlays.length, 'the catalog exposes no overlay to check').toBeGreaterThan(0);
      for (const asset of overlays) {
        const expected = await sharp(join(WEB_STATIC, asset.source))
          .resize(asset.maxEdgePx, asset.maxEdgePx, {
            fit: 'inside',
            kernel: 'lanczos3',
            withoutEnlargement: true,
          })
          .ensureAlpha()
          .raw()
          .toBuffer();
        const actual = await sharp(join(WEB_STATIC, asset.target)).ensureAlpha().raw().toBuffer();
        expect(maxOverlayAlphaError(expected, actual), asset.target).toBeLessThanOrEqual(
          OVERLAY_MAX_CHANNEL_ERROR
        );
      }
    },
    RESPONSIVE_CATALOG_FIDELITY_TIMEOUT_MS
  );
});
