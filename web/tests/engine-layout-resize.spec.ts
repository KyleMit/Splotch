import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';
import { RESIZE_SETTLE_MS } from '../src/lib/drawing/engineListeners';

// A native rotation's toolbar swap lands on the layout's own settle timer, so
// the canvas can grow after the engine's resize debounce has already adopted
// the pre-swap box — with no window resize left to announce it. The paper must
// still follow the canvas, or the margin tone shows as a flat band along the
// grown edge (issue 2125).
const LAYOUT_BAND_PX = 30;

function heights(page: Page) {
  return page.evaluate(() => ({
    canvas: document.getElementById('drawingCanvas')!.getBoundingClientRect().height,
    paper: document.querySelector('.paper-sheet')!.getBoundingClientRect().height,
  }));
}

function setLayoutBand(page: Page, px: number) {
  return page.evaluate((band) => {
    document.querySelector<HTMLElement>('.app-container')!.style.paddingBottom = `${band}px`;
  }, px);
}

test('the paper follows a canvas that layout grows after the resize settled', async ({ page }) => {
  await gotoApp(page);
  const full = await heights(page);
  expect(full.paper).toBe(full.canvas);

  await setLayoutBand(page, LAYOUT_BAND_PX);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(async () => (await heights(page)).paper).toBe(full.canvas - LAYOUT_BAND_PX);
  await page.waitForTimeout(RESIZE_SETTLE_MS * 2);

  await setLayoutBand(page, 0);
  await expect.poll(async () => (await heights(page)).paper).toBe(full.canvas);
});
