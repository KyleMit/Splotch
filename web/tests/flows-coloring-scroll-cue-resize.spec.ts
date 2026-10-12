import { expect, test } from '@playwright/test';

import { settleFlyIn } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  openColoringBookGrid,
  openDrawer,
} from './flows-harness';

// The picker's trailing-row cut is an inline pixel height. A viewport that
// changes height alone (split screen, a vertical window resize) resizes nothing
// the picker observes, so a cut left from the taller viewport would override
// the dialog's vh ceiling and centre it past the top of the screen, close
// button included.

const PHONE_PORTRAIT = { width: 375, height: 812 };
const SPLIT_SCREEN_HEIGHT = 480;

test.use({ viewport: PHONE_PORTRAIT });

test('keeps the picker on screen when only the viewport height shrinks', async ({ page }) => {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  // The cut is in force before the shrink, so there is a budget to go stale.
  await expect.poll(() => dialog.evaluate((node) => node.style.maxHeight)).not.toBe('');

  await page.setViewportSize({ width: PHONE_PORTRAIT.width, height: SPLIT_SCREEN_HEIGHT });

  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect
    .poll(async () => (await close.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => dialog.evaluate((node) => node.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(SPLIT_SCREEN_HEIGHT);
});
