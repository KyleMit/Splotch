import { expect, test } from '@playwright/test';
import { rotateViewportViaCdp } from './cdp';
import { openDrawer } from './flows-harness';
import { draw, firstOpaquePixel, gotoApp } from './helpers';

test('the live paper keeps its compositor promotion', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('.live-paper-view')).toHaveCSS('will-change', 'transform');
});

test('rotating with ink CSS-presents the locked tiled paper until undo empties it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);
  const initialPaperWidth = await page
    .locator('.live-paper-view')
    .evaluate((view: HTMLElement) => view.style.width);
  await draw(page, [
    { x: 240, y: 240 },
    { x: 720, y: 360 },
  ]);
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await rotateViewportViaCdp(page, { width: 720, height: 1280, angle: 90 });

  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
  await expect
    .poll(() => page.locator('.live-paper-view').evaluate((view: HTMLElement) => view.style.width))
    .toBe(initialPaperWidth);
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await openDrawer(page);
  await page.locator('#undoButton').click();

  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
  await expect
    .poll(() => page.locator('.live-paper-view').evaluate((view: HTMLElement) => view.style.width))
    .toBe('720px');
});

test('rotating an empty canvas adopts the new viewport without letterboxing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);

  await rotateViewportViaCdp(page, { width: 720, height: 1280, angle: 90 });

  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator('.live-paper-view').evaluate((view: HTMLElement) => ({
        width: view.style.width,
        transform: view.style.transform,
      }))
    )
    .toEqual({ width: '720px', transform: 'matrix(1, 0, 0, 1, 0, 0)' });
  await expect(page.locator('#drawingCanvas')).toHaveJSProperty('width', 1);
  await expect(page.locator('#drawingCanvas')).toHaveJSProperty('height', 1);
});
