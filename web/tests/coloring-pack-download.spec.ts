import { expect, test, type Page } from '@playwright/test';

import {
  gotoAppWithInstalledColoringBook,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
} from './flows-harness';
import { gotoApp, openSettingsModal } from './helpers';
import type { ColoringPackManifest } from '../src/lib/coloringPacks/manifest';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

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
        return {
          ...book,
          variants: Object.fromEntries(
            Object.entries(book.variants).map(([resolution, variant]) => {
              const files = variant.files.slice(0, 1);
              return [resolution, { ...variant, files, bytes: files[0].bytes }];
            })
          ),
        };
      });
    await route.fulfill({ response, json: { ...manifest, books } });
  });
  await page.route(/\/coloring\/(?:max-\d+px\/)?dinosaur\/.+\.webp$/, async (route) => {
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
  await expect(dialog.locator('.coloring-pages-grid > .coloring-tile')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Clear active coloring page: Cat' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('#coloringOverlay')).toHaveCSS('opacity', '0');
});

test('removing downloaded books restores single-book page previews', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const pages = await openFarmPageGrid(page);
  await expect
    .poll(() =>
      pages
        .first()
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      pages
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => !image.hasAttribute('src') && !image.hasAttribute('srcset'))
        )
    )
    .toBe(true);

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await settings.getByRole('button', { name: 'Remove downloaded pictures' }).click();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeDisabled();
  await settings.getByRole('button', { name: 'Close' }).click();

  await openColoringDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect
    .poll(() =>
      dialog
        .locator('.coloring-pages-grid img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
});

test('the Coloring section toggle clears the page but keeps downloaded books', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const pages = await openFarmPageGrid(page);
  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();

  const settings = await openSettingsModal(page);
  // The wide shell stacks every section in one scrolling pane, so the table of
  // contents moves the scroll position rather than swapping the pane's content:
  // the toggle is mounted throughout, and "the first card of the first group"
  // has to be read inside the Coloring section rather than across the whole card.
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  const coloring = settings.locator('.settings-section[data-section="coloring"]');
  const toggle = coloring.locator('#coloringBookToggle');
  await expect(
    coloring.locator('.setting-group > .setting').first().locator('#coloringBookToggle')
  ).toBeVisible();
  const removeDownloads = settings.getByRole('button', { name: 'Remove downloaded pictures' });
  await expect(removeDownloads).toBeEnabled();
  await expect(removeDownloads).toBeInViewport();

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('#coloringOverlay')).toHaveCSS('opacity', '0');
  await expect(page.locator('#coloringBookButton')).toBeHidden();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeEnabled();
});

test('a saved disabled setting blocks pack boot until coloring books are enabled', async ({
  page,
}) => {
  let manifestRequests = 0;
  page.on('request', (request) => {
    if (/\/coloring\/manifest-.+\.json$/.test(request.url())) manifestRequests++;
  });
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await page.evaluate(
    (key) => localStorage.setItem(key, 'false'),
    STORAGE_KEYS.coloringBookEnabled
  );
  // Leave the enabled document before counting so its already-scheduled downloader
  // cannot be mistaken for work started by the disabled cold boot.
  await page.goto('about:blank');
  manifestRequests = 0;

  await gotoApp(page);
  await openDrawer(page);

  await expect(page.locator('html')).toHaveAttribute('data-off-coloring', '');
  await expect(page.locator('html')).toHaveCSS('--action-btn-first-paint-count', '4');
  await expect(page.locator('#coloringBookButton')).toBeHidden();

  // This proves a negative over longer than scheduleIdle's fallback window: a
  // slower worker only lengthens the observation and cannot create a false pass.
  await page.waitForTimeout(500);
  expect(manifestRequests).toBe(0);

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await expect(
    settings.getByText('Storage details are unavailable while coloring books are off')
  ).toBeVisible();
  await expect(settings.locator('#coloringPacksMeteredToggle')).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeEnabled();
  await settings.locator('#coloringBookToggle').click();

  await expect(page.locator('#coloringBookButton')).toBeVisible();
  await expect.poll(() => manifestRequests).toBeGreaterThan(0);
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
    await expect(gridTiles).toHaveCount(6);
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
