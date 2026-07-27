import { expect, test } from '@playwright/test';
import { draw, firstOpaquePixel, gotoApp, openParentCenter } from './helpers';

// WebKit critical-path smoke — the only spec the `webkit` project runs (see
// playwright.config.ts). The rest of the E2E suite is Chromium-only, but
// Safari/iOS is the floor engine docs/COMPATIBILITY.md worries about most, so
// this tiny subset proves the core toddler path — boot, draw a stroke, open
// the Parent Center and Color Picker dialogs — works on the WebKit engine.
//
// Keep it small and WebKit-portable: no CDP sessions (the viewport-rotation
// coverage in flows-coloring-book.spec.ts and flows-magic-brush.spec.ts is
// Chromium-only), no synthetic-touch cases from flows-palette-brush.spec.ts,
// no dev-harness routes, no pixel-perfect assertions that depend on Chromium's
// rasterizer. The shared helpers imported above are held to the same
// WebKit-portable bar.

test('the app boots: canvas, palette, and Parent Center button render', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole('button', { name: 'Parent Center' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom Color' })).toBeVisible();
});

test('a pointer stroke puts ink on the canvas', async ({ page }) => {
  await gotoApp(page);
  expect(await firstOpaquePixel(page)).toBeNull();
  await draw(page, [
    { x: 120, y: 120 },
    { x: 180, y: 160 },
    { x: 240, y: 200 },
  ]);
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
});

test('the Parent Center dialog opens and closes', async ({ page }) => {
  await gotoApp(page);
  const modal = await openParentCenter(page);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).not.toBeVisible();
});

test('the Color Picker dialog opens and commits a color', async ({ page }) => {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Custom Color' }).click();
  const dialog = page.locator('#color-picker');
  await expect(dialog).toBeVisible();
  const green = dialog.locator('.grid.landscape .hexagon[data-color="#2ECC71"]');
  await green.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom Color' })).toHaveClass(/active/);
});
