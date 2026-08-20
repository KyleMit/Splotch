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

test('a vector light overlay reveals with Magic and keeps its raster theme fallback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await selectPageFromBook(page, 'Shapes', 'Circle');

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /\/coloring\/shapes\/circle-tall\.overlay\.svg$/);
  await expect
    .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/\/coloring\/shapes\/circle-tall\.overlay\.svg$/);
  await expect
    .poll(() =>
      overlay.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])
    )
    .toEqual([1024, 1536]);

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
    /\/coloring\/shapes\/circle-tall\.dark\.overlay\.webp$/
  );
  await expect(overlay).toHaveAttribute(
    'srcset',
    /\/coloring\/max-1152px\/shapes\/circle-tall\.dark\.overlay\.webp/
  );
});

test('a dark vector overlay decodes and exports through the live app', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await selectPageFromBook(page, 'Creatures', 'Owl');

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute(
    'src',
    /\/coloring\/creatures\/owl-tall\.dark\.overlay\.svg$/
  );
  await expect
    .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/\/coloring\/creatures\/owl-tall\.dark\.overlay\.svg$/);

  await draw(page, [
    { x: 180, y: 260 },
    { x: 420, y: 360 },
  ]);
  const download = page.waitForEvent('download');
  await page.locator('#screenshotButton').click();
  expect(await (await download).failure()).toBeNull();
});
