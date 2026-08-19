import { expect, test } from '@playwright/test';

import { openSettingsModal } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  openColoringBookGrid,
  openDrawer,
} from './flows-harness';

test('book covers use chalk thumbnails in dark mode', async ({ page }) => {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);
  const dialog = page.locator('#coloring-book-dialog');
  const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');

  await expect(cover).toHaveAttribute('srcset', /\/coloring\/max-240px\/farm\/cover\.thumb\.webp/);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  const settings = await openSettingsModal(page);
  await settings.locator('#themeOption-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();

  await openColoringBookGrid(page);
  await expect(cover).toHaveAttribute(
    'srcset',
    /\/coloring\/max-240px\/farm\/cover\.chalk\.thumb\.webp/
  );
});
