import { expect, test, type Locator } from '@playwright/test';

import { booksForPlatform, coloringBookGridLayout } from '../src/lib/state/books';
import { gotoApp, settleFlyIn } from './helpers';
import {
  applyFarmPage,
  gotoAppWithAllColoringBooksInstalled,
  gotoAppWithInstalledColoringBook,
  openColoringBookGrid,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
} from './flows-harness';

const GRID_WHOLE_PIXEL_TOLERANCE_PX = 1;
const STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX = 800;
const BOOK_GRID_VIEWPORTS = [
  { width: 1200, columns: 4 },
  { width: 700, columns: 3 },
  { width: 500, columns: 2 },
] as const;
const SMALL_VIEWPORT = { width: 320, height: 568 };
const MINIMUM_TOUCH_TARGET_PX = 44;
const MAX_CHIP_CLOSE_GAP_PX = 8;
const WEB_COLORING_BOOK_COUNT = booksForPlatform('web').length;

async function tileGeometry(grid: Locator) {
  return grid.locator(':scope > .coloring-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const { left, top, width, height } = tile.getBoundingClientRect();
      return {
        label: tile.getAttribute('aria-label'),
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      };
    })
  );
}

test('paper presentation residency starts on picker demand and survives clear', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  const paper = page.locator('.paper-view');
  await expect(paper).not.toHaveClass(/paper-presentation-resident/);
  await expect(paper).not.toHaveAttribute('data-paper-active');

  await openColoringDialog(page);
  await expect(paper).toHaveClass(/paper-presentation-resident/);
  await expect(paper).not.toHaveAttribute('data-paper-active');

  await (await openFarmPageGrid(page)).first().click();
  await expect(paper).toHaveAttribute('data-paper-active', '');

  await openColoringDialog(page);
  await page
    .locator('#coloring-book-dialog')
    .getByRole('button', { name: 'Clear active coloring page: Cat' })
    .click();
  await expect(paper).not.toHaveAttribute('data-paper-active');
  await expect(paper).toHaveClass(/paper-presentation-resident/);
});

test('an active page leaves the book grid geometry unchanged', async ({ page }) => {
  await page.setViewportSize({
    width: BOOK_GRID_VIEWPORTS[0].width,
    height: STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX,
  });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  const grid = dialog.locator('.coloring-books-grid');
  // The grid is open on its first tile; the rest land with it unless a book is
  // still downloading, which is what the long window covers.
  await expect(grid.locator(':scope > .coloring-tile')).toHaveCount(WEB_COLORING_BOOK_COUNT, {
    timeout: 30_000,
  });
  const geometryBefore = await tileGeometry(grid);
  await expect(dialog.locator('.active-page-chip')).toHaveCount(0);

  await (await openFarmPageGrid(page)).first().click();
  await expect(dialog).toBeHidden();
  await openColoringBookGrid(page);
  await settleFlyIn(dialog);

  await expect(grid.locator(':scope > .coloring-tile')).toHaveCount(WEB_COLORING_BOOK_COUNT);
  expect(await tileGeometry(grid)).toEqual(geometryBefore);
  await expect(grid.locator('img').first()).toHaveAttribute(
    'sizes',
    coloringBookGridLayout(WEB_COLORING_BOOK_COUNT).imageSizes
  );
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeLessThanOrEqual(GRID_WHOLE_PIXEL_TOLERANCE_PX);

  for (const { width, columns } of BOOK_GRID_VIEWPORTS) {
    await page.setViewportSize({ width, height: STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX });
    await expect
      .poll(() =>
        grid.evaluate((element) => {
          const tracks = getComputedStyle(element).gridTemplateColumns.trim();
          return tracks === 'none' ? 0 : tracks.split(/\s+/).length;
        })
      )
      .toBe(columns);
  }
});

test('the active-page chip identifies the page in both picker views', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await applyFarmPage(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
  await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Cat');
  await expect(chip.locator('[data-icon="close"]')).toBeVisible();
  const chipImage = chip.locator('img');
  await expect(chipImage).toHaveAttribute('src', /\/farm\/cat-wide\.selector\.webp$/);
  await expect(chipImage).toHaveAttribute(
    'srcset',
    /\/coloring\/max-240px\/farm\/cat-wide\.selector\.webp 240w, \/coloring\/farm\/cat-wide\.selector\.webp 400w$/
  );
  await expect(chipImage).toHaveAttribute('sizes', '36px');
  await expect(chipImage).toHaveCSS('mix-blend-mode', 'normal');
  await expect(chipImage).toHaveCSS('filter', 'none');

  await openFarmPageGrid(page);
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(chip).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
});

test.describe('active-page chip on a small viewport', () => {
  test.use({ viewport: SMALL_VIEWPORT });

  test('keeps book-picker and page-grid headings readable', async ({ page }) => {
    await gotoAppWithAllColoringBooksInstalled(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringBookGrid(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    await expect(chip.locator('.active-page-name')).toBeHidden();

    const booksHeading = dialog.getByRole('heading', { name: 'Coloring Books' });
    await expect
      .poll(() => booksHeading.evaluate((heading) => heading.scrollWidth <= heading.clientWidth))
      .toBe(true);

    await dialog.getByRole('button', { name: 'Dinosaurs coloring book' }).click();
    const pagesHeading = dialog.getByRole('heading', { name: 'Dinosaurs' });
    await expect(pagesHeading).toBeVisible();
    await expect
      .poll(() => pagesHeading.evaluate((heading) => heading.scrollWidth <= heading.clientWidth))
      .toBe(true);
  });

  test('is a full-size right-aligned keyboard action before the close button', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const close = dialog.getByRole('button', { name: 'Close' });
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    const [chipBox, closeBox] = await Promise.all([chip.boundingBox(), close.boundingBox()]);
    expect(chipBox?.width).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
    expect(chipBox?.height).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
    const chipCloseGap = closeBox!.x - (chipBox!.x + chipBox!.width);
    expect(chipCloseGap).toBeGreaterThanOrEqual(0);
    expect(chipCloseGap).toBeLessThanOrEqual(MAX_CHIP_CLOSE_GAP_PX);

    await chip.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(chip).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeHidden();
  });

  test('compresses while pressed and clears immediately on release', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(chip).not.toHaveCSS('transform', 'none');
    await page.mouse.up();

    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeHidden();
  });
});
