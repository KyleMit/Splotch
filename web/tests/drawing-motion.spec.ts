import { test, expect } from '@playwright/test';
import { gotoApp, drawCommittedStroke } from './helpers';
import { openDrawer, opaqueCanvasPixelCount } from './flows-harness';

test('flyouts replay staggered arrivals and unmount immediately on close', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  for (const trigger of ['#brushButton', '#strokeWidthButton']) {
    await page.locator(trigger).click();
    const menu = page.locator('.flyout-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await expect(menu.locator('button').nth(1)).toHaveCSS('animation-delay', '0.065s');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.locator(trigger).click();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await page.keyboard.press('Escape');
  }
});

test('reduced motion makes flyouts appear without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openDrawer(page);
  await page.locator('#brushButton').click();
  await expect(page.locator('.flyout-menu')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#penBrushButton')).toHaveCSS('animation-name', 'none');
});

test('brush face rolls only for a changed explicit menu pick', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const face = page.locator('.brush-button-faces');
  await expect(face).toHaveCSS('animation-name', 'none');
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  await expect(face).toHaveCSS('animation-name', /face-roll/);
  const original = await face.elementHandle();
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test('undo retires ink immediately beneath a shrinking overlay and drawing cancels it', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  await page.locator('#undoButton').evaluate((button) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('animation-name', 'undo-ink');
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'undo-spin');
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  expect(
    await overlay.evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0)
    )
  ).toBe(true);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 450, y: 330 },
  ]);
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
});
