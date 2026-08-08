import { expect, test } from '@playwright/test';

import { openColoringDialog, openDrawer } from './flows-harness';
import { gotoApp } from './helpers';
import type { ColoringPackManifest } from '../src/lib/coloringPacks/manifest';

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
  await dialog.getByRole('button', { name: 'Clear Page' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeHidden();
});

test('the picker responds when a second book finishes downloading', async ({ page }) => {
  let releaseDinosaurDownload!: () => void;
  const dinosaurDownloadHeld = new Promise<void>((resolve) => {
    releaseDinosaurDownload = resolve;
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
    await dinosaurDownloadHeld;
    await route.continue();
  });

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);

    releaseDinosaurDownload();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          for (const cacheName of await caches.keys()) {
            const requests = await (await caches.open(cacheName)).keys();
            if (requests.some(({ url }) => new URL(url).pathname.endsWith('/dinosaur'))) {
              return true;
            }
          }
          return false;
        })
      )
      .toBe(true);

    await expect(dialog.getByRole('button', { name: 'Back' })).toBeVisible();
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
