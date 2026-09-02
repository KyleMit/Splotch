import { expect, test, type Page } from '@playwright/test';

import { draw, renderedCanvasHandle } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  openColoringBookGrid,
  openDrawer,
  pickBrush,
  settleTapGuard,
} from './flows-harness';

const VECTOR_MAGIC_MIN_COLORS = 5;

async function selectPageFromBook(page: Page, bookName: string, pageName: string) {
  await openColoringBookGrid(page);
  const dialog = page.locator('#coloring-book-dialog');
  await settleTapGuard(page);
  await dialog.getByRole('button', { name: `${bookName} coloring book`, exact: true }).click();
  await expect(dialog.getByRole('heading', { name: bookName, exact: true })).toBeVisible();
  await settleTapGuard(page);
  await dialog.getByRole('button', { name: `${pageName} coloring page`, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function distinctOpaqueCanvasColors(page: Page): Promise<number> {
  const bits = 6;
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((element, colorBits) => {
      const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height);
      const shift = 8 - colorBits;
      const colors = new Set<number>();
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 200) continue;
        colors.add(
          ((data[index] >> shift) << (2 * colorBits)) |
            ((data[index + 1] >> shift) << colorBits) |
            (data[index + 2] >> shift)
        );
      }
      return colors.size;
    }, bits);
  } finally {
    await canvas.dispose();
  }
}

test('a canonical catalog SVG reveals with Magic across themes', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await selectPageFromBook(page, 'Space', 'Station');

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /\/coloring\/space\/station-wide\.overlay\.svg$/);
  await expect(overlay).toHaveAttribute(
    'data-canonical-url',
    /\/coloring\/space\/station-wide\.overlay\.svg$/
  );
  // 1180 css px of wide art at DPR 1 needs more than the 1152 tier: the 1536 tier, a whole-number
  // scale of the SVG viewBox, so the Magic registration below is exact.
  await expect
    .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/\/coloring\/max-1536px\/space\/station-wide\.presentation\.webp$/);
  // A width-descriptor candidate reports its natural size divided by the selected density, so
  // the 3:2 ratio is the invariant; the tier's pixel dimensions are pinned by the catalog test.
  await expect
    .poll(() =>
      overlay.evaluate((image: HTMLImageElement) =>
        Math.round((image.naturalWidth / image.naturalHeight) * 100)
      )
    )
    .toBe(150);

  await pickBrush(page, '#magicBrushButton');
  await draw(page, [
    { x: 120, y: 180 },
    { x: 400, y: 500 },
    { x: 650, y: 760 },
  ]);
  await expect
    .poll(() => distinctOpaqueCanvasColors(page))
    .toBeGreaterThanOrEqual(VECTOR_MAGIC_MIN_COLORS);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(overlay).toHaveAttribute(
    'src',
    /\/coloring\/space\/station-wide\.dark\.overlay\.svg$/
  );
  await expect(overlay).toHaveAttribute(
    'data-canonical-url',
    /\/coloring\/space\/station-wide\.dark\.overlay\.svg$/
  );
  await expect(overlay).toHaveAttribute(
    'srcset',
    /station-wide\.dark\.presentation\.webp 1536w, .*station-wide\.dark\.overlay\.svg 6144w$/
  );
});

test('a dark canonical SVG decodes and exports through the live app', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await selectPageFromBook(page, 'Vehicles', 'Train');

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute(
    'src',
    /\/coloring\/vehicles\/train-wide\.dark\.overlay\.svg$/
  );
  await expect(overlay).toHaveAttribute(
    'data-canonical-url',
    /\/coloring\/vehicles\/train-wide\.dark\.overlay\.svg$/
  );
  await expect
    .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/\/coloring\/max-1536px\/vehicles\/train-wide\.dark\.presentation\.webp$/);

  await draw(page, [
    { x: 180, y: 260 },
    { x: 420, y: 360 },
  ]);
  const download = page.waitForEvent('download');
  await page.locator('#screenshotButton').click();
  expect(await (await download).failure()).toBeNull();
});
