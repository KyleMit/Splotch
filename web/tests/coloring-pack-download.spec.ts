import { expect, test, type Page } from '@playwright/test';

import { openColoringDialog, openDrawer, openFarmPageGrid } from './flows-harness';
import { gotoApp } from './helpers';
import type { ColoringPackManifest } from '../src/lib/coloringPacks/manifest';

async function holdDinosaurDownload(page: Page): Promise<() => void> {
  let releaseDownload!: () => void;
  const downloadHeld = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });

  await page.route(/\/coloring\/manifest-.+\.json$/, async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as ColoringPackManifest;
    const books = manifest.books
      .filter((book) => book.id === manifest.starterBookId || book.id === 'dinosaur')
      .map((book) => {
        if (book.id !== 'dinosaur') return book;
        const files = book.files.slice(0, 1);
        return { ...book, files, bytes: files[0].bytes };
      });
    await route.fulfill({ response, json: { ...manifest, books } });
  });
  await page.route(/\/coloring\/dinosaur\/.+\.webp$/, async (route) => {
    await downloadHeld;
    await route.continue();
  });

  return releaseDownload;
}

test('a fresh install opens the Farm pages directly before packs arrive', async ({ page }) => {
  await page.route(/\/coloring\/manifest-.+\.json$/, (route) => route.abort());
  await gotoApp(page);
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(dialog.locator('.coloring-books-grid')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Farm coloring book' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Dinosaur coloring book/i })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  const pages = dialog.getByRole('button', { name: / coloring page$/i });
  await expect(pages).toHaveCount(6);

  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();

  await openColoringDialog(page);
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect
    .poll(() =>
      dialog
        .locator('.coloring-pages-grid img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
  await expect(dialog.locator('.coloring-pages-grid > .coloring-tile').last()).toHaveAttribute(
    'aria-label',
    'Clear Page'
  );
  await dialog.getByRole('button', { name: 'Clear Page' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeHidden();
});

test('finishing a download keeps the open page grid stable', async ({ page }) => {
  const releaseDinosaurDownload = await holdDinosaurDownload(page);

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await (await openFarmPageGrid(page)).first().click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeVisible();

    await openColoringDialog(page);
    const gridTiles = dialog.locator('.coloring-pages-grid > .coloring-tile');
    await expect(gridTiles).toHaveCount(7);
    const labelsBeforeDownload = await gridTiles.evaluateAll((tiles) =>
      tiles.map((tile) => tile.getAttribute('aria-label'))
    );

    releaseDinosaurDownload();
    await expect(dialog.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        gridTiles.evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label')))
      )
      .toEqual(labelsBeforeDownload);
  } finally {
    releaseDinosaurDownload();
  }
});

test('the picker responds when a second book finishes downloading', async ({ page }) => {
  const releaseDinosaurDownload = await holdDinosaurDownload(page);

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);

    releaseDinosaurDownload();
    await expect(dialog.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await openColoringDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.locator('.coloring-books-grid .coloring-book-tile')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: 'Farm coloring book' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dinosaurs coloring book' })).toBeVisible();
  } finally {
    releaseDinosaurDownload();
  }
});
