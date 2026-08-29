import { expect, test, type Page } from '@playwright/test';

import { gotoApp, settleFlyIn } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  gotoAppWithInstalledColoringBook,
  openColoringBookGrid,
  openDrawer,
  openFarmPageGrid,
  settleTapGuard,
} from './flows-harness';

// A tall viewport swaps the four cover columns for two and caps the grid by the
// dialog's height. These viewports walk both sides of that crossover, including
// the barely-portrait windows a desktop resize or Stage Manager can produce.
const COVER_GRID_VIEWPORTS = [
  { width: 741, height: 745 },
  { width: 741, height: 800 },
  { width: 741, height: 926 },
  { width: 760, height: 800 },
  { width: 800, height: 900 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 1366 },
];

async function coverGeometry(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  return page.evaluate(() => {
    const grid = document.querySelector('.coloring-books-grid') as HTMLElement;
    const row = grid.parentElement as HTMLElement;
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    return {
      coverWidth: (grid.querySelector('.coloring-tile') as HTMLElement).offsetWidth,
      fourColumnCoverWidth: (row.clientWidth - 3 * gap) / 4,
    };
  });
}

async function openCoverGrid(page: Page) {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);
}

test('no viewport draws a cover smaller than four columns would', async ({ page }) => {
  test.slow();
  for (const viewport of COVER_GRID_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openCoverGrid(page);
    const { coverWidth, fourColumnCoverWidth } = await coverGeometry(page);
    expect(
      coverWidth,
      `cover width at ${viewport.width}x${viewport.height}`
    ).toBeGreaterThanOrEqual(Math.floor(fourColumnCoverWidth));
  }
});

test('a tablet held upright spends its height on bigger covers', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openCoverGrid(page);
  const { coverWidth, fourColumnCoverWidth } = await coverGeometry(page);
  expect(coverWidth).toBeGreaterThan(fourColumnCoverWidth);
});

test('a repeat tap where the launch button sat does not dismiss the just-opened modal', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const btn = page.locator('#coloringBookButton');
  const box = (await btn.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await btn.click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // The fresh backdrop occupies the launcher's old location; the launch guard
  // swallows that repeat tap while a backdrop tap elsewhere still dismisses.
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeVisible();

  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 10, 10);
  await expect(dialog).toBeHidden();
});

test('a repeat tap on a book cover does not pick the page that lands under it', async ({
  page,
}) => {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  // Raw input uses the remembered coordinate, so the fly-in must land before
  // measuring the cover that a page tile will replace.
  await settleFlyIn(dialog);
  const coverBox = (await dialog
    .getByRole('button', { name: 'Farm coloring book' })
    .boundingBox())!;
  const cx = coverBox.x + coverBox.width / 2;
  const cy = coverBox.y + coverBox.height / 2;

  const pageTiles = await openFarmPageGrid(page);
  const tileBoxes = await pageTiles.evaluateAll((tiles) =>
    tiles.map((tile) => {
      const { left, top, right, bottom } = tile.getBoundingClientRect();
      return { left, top, right, bottom };
    })
  );
  expect(
    tileBoxes.filter(
      (box) => cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom
    )
  ).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
  await settleTapGuard(page);

  // Back-to-back clicks land inside the guard window; after it lapses, the same
  // coordinate selects the page normally.
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx, cy);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();

  await settleTapGuard(page);
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();
});

test.describe('coloring book picker via touch', () => {
  test.use({ hasTouch: true });

  test('a touch tap on the launcher opens the picker at the root book list', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);

    await page.locator('#coloringBookButton').tap();

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog).toBeVisible();
    // A trailing synthesized click is hit-tested after the dialog paints. The
    // picker must remain at the root instead of drilling into the tile under it.
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});
