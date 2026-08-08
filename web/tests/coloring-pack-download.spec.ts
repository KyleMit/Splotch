import { expect, test } from '@playwright/test';

import { openColoringDialog, openDrawer, openFarmPageGrid } from './flows-harness';
import { gotoApp } from './helpers';

test('a fresh install exposes only Farm and all six Farm pages before packs arrive', async ({
  page,
}) => {
  await page.route(/\/coloring\/manifest-.+\.json$/, (route) => route.abort());
  await gotoApp(page);
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog.locator('.coloring-books-grid .coloring-tile')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Farm coloring book' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Dinosaur coloring book/i })).toHaveCount(0);
  await expect(await openFarmPageGrid(page)).toHaveCount(6);
});
