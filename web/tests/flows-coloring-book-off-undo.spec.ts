import { expect, test } from '@playwright/test';

import { draw, gotoApp } from './helpers';
import {
  applyFarmPage,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  openSettingsSection,
  pickBrush,
} from './flows-harness';

const MAGIC_STROKE_POINTS = [
  { x: 100, y: 120 },
  { x: 240, y: 260 },
  { x: 400, y: 120 },
  { x: 560, y: 280 },
];

test('undoing a page change after Coloring book is switched off leaves the paper without a page', async ({
  page,
}) => {
  const overlay = page.locator('#coloringOverlay');
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');
  await draw(page, MAGIC_STROKE_POINTS);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  await (await openFarmPageGrid(page)).nth(1).click();
  await expect(dialog).toBeHidden();
  await expect(overlay).toHaveAttribute('src', /\/cow-(?:wide|tall)\.overlay\.svg$/);

  await openSettingsSection(page, 'Coloring', '#coloringBookToggle');
  const toggle = page.locator('#coloringBookToggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).toBeHidden();

  await openDrawer(page);
  await page.locator('#undoButton').click();

  // The engine reports the undo after it has run the page change's restore
  // callback, so the button's firing icon means the page state is final.
  await expect(page.locator('#undoButton .undo-firing')).toBeAttached();
  await expect(overlay).toBeHidden();
  await expect(overlay).not.toHaveAttribute('src', /\/cat-(?:wide|tall)\.overlay\.svg$/);
});
