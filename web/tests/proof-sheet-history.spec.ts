import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const proofSheetsDir = fileURLToPath(
  new URL('../../scrapbook/coloring-book-proof-sheets/', import.meta.url)
);
const proofSheetPathPrefix = '/coloring-book-proof-sheets/';

test('the bare proof-sheet hub preserves the page before it in history', async ({ page }) => {
  await page.route('**/coloring-book-proof-sheets/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({
      path: join(proofSheetsDir, pathname.slice(proofSheetPathPrefix.length)),
    });
  });
  await page.route('**/proof-sheet-prior-page', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Prior page</title><p>Prior page</p>',
    })
  );

  await page.goto('/proof-sheet-prior-page');
  await page.goto('/coloring-book-proof-sheets/index.html');

  await expect(page).toHaveTitle('Splotch proof sheets — Farm');
  await expect(page.locator('#sheet')).toHaveAttribute('src', 'farm.html');

  await page.goBack();

  await expect(page).toHaveURL(/\/proof-sheet-prior-page$/);
  await expect(page).toHaveTitle('Prior page');
});
