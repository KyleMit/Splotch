import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';

const LANDSCAPE_VIEWPORT = { width: 667, height: 375 };

interface PalettePanelGeometry {
  paletteRight: number;
  panelLeft: number;
}

function palettePanelGeometry(page: Page): Promise<PalettePanelGeometry> {
  return page.evaluate(() => {
    const palette = document.querySelector('.color-palette');
    const panel = document.querySelector('.actions-panel');
    if (!(palette instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('Actions Panel geometry is unavailable');
    }
    return {
      paletteRight: palette.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
    };
  });
}

test('landscape Actions Panel starts at its hydrated palette-clearing offset', async ({
  browser,
  page,
}) => {
  const preHydrationContext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: LANDSCAPE_VIEWPORT,
  });
  const preHydrationPage = await preHydrationContext.newPage();
  await preHydrationPage.goto('/');
  await expect(preHydrationPage.locator('.color-palette')).toBeVisible();
  const preHydration = await palettePanelGeometry(preHydrationPage);
  await preHydrationContext.close();

  expect(preHydration.panelLeft).toBeGreaterThan(0);
  expect(preHydration.panelLeft).toBeGreaterThan(preHydration.paletteRight);

  await page.setViewportSize(LANDSCAPE_VIEWPORT);
  await gotoApp(page);
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
  const hydrated = await palettePanelGeometry(page);

  expect(hydrated.panelLeft).toBeGreaterThan(hydrated.paletteRight);
  expect(preHydration.panelLeft).toBe(hydrated.panelLeft);
});
