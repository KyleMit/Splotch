import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';

const LANDSCAPE_VIEWPORTS = [
  { name: 'narrow two-column', width: 568, height: 320, paletteWidth: 156 },
  { name: 'common two-column', width: 667, height: 375, paletteWidth: 156 },
  { name: 'single-column', width: 1024, height: 768, paletteWidth: 84 },
] as const;

const NARROW_LANDSCAPE_VIEWPORTS = LANDSCAPE_VIEWPORTS.slice(0, 2);

interface ActionPanelGeometry {
  paletteRight: number;
  panelLeft: number;
  visibleButtonCount: number;
  buttonWidth: number;
  drawerRight: number;
  settingsLeft: number;
}

function actionPanelGeometry(page: Page): Promise<ActionPanelGeometry> {
  return page.evaluate(() => {
    const palette = document.querySelector('.color-palette');
    const panel = document.querySelector('.actions-panel');
    const drawer = document.querySelector('.actions-drawer-inner');
    const settingsButton = document.querySelector('button[aria-label="Settings"]');
    const visibleButtons = [...document.querySelectorAll('.action-button')].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && getComputedStyle(element).display !== 'none'
    );
    if (
      !(palette instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(drawer instanceof HTMLElement) ||
      !(settingsButton instanceof HTMLElement) ||
      !visibleButtons[0]
    ) {
      throw new Error('Actions Panel geometry is unavailable');
    }
    return {
      paletteRight: palette.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
      visibleButtonCount: visibleButtons.length,
      buttonWidth: visibleButtons[0].getBoundingClientRect().width,
      drawerRight: drawer.getBoundingClientRect().right,
      settingsLeft: settingsButton.getBoundingClientRect().left,
    };
  });
}

for (const viewport of LANDSCAPE_VIEWPORTS) {
  test(`${viewport.name} Actions Panel first paint matches hydrated geometry`, async ({
    browser,
    page,
  }) => {
    const preHydrationContext = await browser.newContext({
      javaScriptEnabled: false,
      viewport,
    });
    const preHydrationPage = await preHydrationContext.newPage();
    await preHydrationPage.goto('/');
    await expect(preHydrationPage.locator('.color-palette')).toBeVisible();
    const preHydration = await actionPanelGeometry(preHydrationPage);
    await preHydrationContext.close();

    expect(preHydration.paletteRight).toBe(viewport.paletteWidth);
    expect(preHydration.panelLeft).toBeGreaterThan(preHydration.paletteRight);
    expect(preHydration.visibleButtonCount).toBe(5);

    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const hydrated = await actionPanelGeometry(page);

    expect(hydrated.paletteRight).toBe(viewport.paletteWidth);
    expect(hydrated.panelLeft).toBeGreaterThan(hydrated.paletteRight);
    expect(hydrated.visibleButtonCount).toBe(5);
    expect(preHydration.panelLeft).toBe(hydrated.panelLeft);
    expect(preHydration.buttonWidth).toBeCloseTo(hydrated.buttonWidth, 2);
  });
}

for (const viewport of NARROW_LANDSCAPE_VIEWPORTS) {
  test(`${viewport.name} six-button row clears the Settings Button`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('splotch-drawer-open', 'true');
      localStorage.setItem('splotch-ai-access-token', 'test-token');
    });
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    await expect(page.locator('#aiImageButton')).toBeVisible();

    const hydrated = await actionPanelGeometry(page);
    expect(hydrated.visibleButtonCount).toBe(6);
    expect(hydrated.drawerRight).toBeLessThanOrEqual(hydrated.settingsLeft);
    expect(hydrated.drawerRight).toBeLessThanOrEqual(viewport.width);
  });
}
