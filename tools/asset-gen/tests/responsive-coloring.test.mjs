import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BOOKS,
  coverThumbImageSource,
  pageOverlayImageSource,
  pageThumbImageSource,
  responsiveColoringAssets,
} from '../../../web/src/lib/state/books.ts';
import { WEB_STATIC } from '../lib/paths.mjs';
import { maxOverlayAlphaError, OVERLAY_MAX_CHANNEL_ERROR } from '../lib/overlay-alpha.mjs';
import { RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION } from '../lib/responsive-coloring.mjs';

function srcsetWidths() {
  const widths = new Map();
  const record = ({ srcset }) => {
    for (const candidate of srcset.split(', ')) {
      const [path, descriptor] = candidate.split(' ');
      widths.set(path, Number.parseInt(descriptor, 10));
    }
  };

  for (const book of BOOKS) {
    record(coverThumbImageSource(book));
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

describe('responsive coloring catalog', () => {
  it('keeps every srcset width descriptor equal to the committed intrinsic width', async () => {
    const widths = srcsetWidths();
    const assets = BOOKS.flatMap(responsiveColoringAssets);
    let sourceBytes = 0;
    let targetBytes = 0;

    expect(assets).toHaveLength(392);
    for (const asset of assets) {
      const sourceMetadata = await sharp(join(WEB_STATIC, asset.source)).metadata();
      const targetMetadata = await sharp(join(WEB_STATIC, asset.target)).metadata();
      expect(widths.get(asset.source), asset.source).toBe(sourceMetadata.width);
      expect(widths.get(asset.target), asset.target).toBe(targetMetadata.width);
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

      if (asset.encoding === 'overlay') {
        const expected = await sharp(sourcePath)
          .resize(asset.maxEdgePx, asset.maxEdgePx, { fit: 'inside', kernel: 'lanczos3' })
          .ensureAlpha()
          .raw()
          .toBuffer();
        const actual = await sharp(targetPath).ensureAlpha().raw().toBuffer();
        expect(maxOverlayAlphaError(expected, actual), asset.target).toBeLessThanOrEqual(
          OVERLAY_MAX_CHANNEL_ERROR
        );
      }
    }
    expect((sourceBytes - targetBytes) / sourceBytes).toBeGreaterThanOrEqual(
      RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION
    );
  });
});
