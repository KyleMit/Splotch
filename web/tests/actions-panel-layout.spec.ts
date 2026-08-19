import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';

const LANDSCAPE_VIEWPORTS = [
  { name: 'narrow two-column', width: 568, height: 320, paletteWidth: 156 },
  { name: 'common two-column', width: 667, height: 375, paletteWidth: 156 },
  { name: 'single-column', width: 1024, height: 768, paletteWidth: 84 },
] as const;

const NARROW_LANDSCAPE_VIEWPORTS = LANDSCAPE_VIEWPORTS.slice(0, 2);
const PERSISTED_VISIBILITY_CONFIGURATIONS = [
  {
    name: 'three-button row',
    hiddenKeys: ['splotch-screenshot-enabled', 'splotch-undo-button-enabled'],
    visibleButtonCount: 3,
  },
  {
    name: 'brush-only row',
    hiddenKeys: [
      'splotch-stroke-width-control',
      'splotch-coloring-book-enabled',
      'splotch-screenshot-enabled',
      'splotch-undo-button-enabled',
    ],
    visibleButtonCount: 1,
  },
] as const;

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
        element instanceof HTMLElement &&
        getComputedStyle(element).display !== 'none' &&
        element.getClientRects().length > 0
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

async function seedPersistedHiddenControls(
  page: Page,
  hiddenKeys: readonly string[]
): Promise<void> {
  await page.addInitScript((keys) => {
    localStorage.setItem('splotch-drawer-open', 'true');
    for (const key of keys) localStorage.setItem(key, 'false');
  }, hiddenKeys);
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

for (const configuration of PERSISTED_VISIBILITY_CONFIGURATIONS) {
  test(`${configuration.name} first paint matches hydrated geometry`, async ({ browser, page }) => {
    const viewport = LANDSCAPE_VIEWPORTS[0];
    const firstPaintContext = await browser.newContext({ viewport });
    const firstPaintPage = await firstPaintContext.newPage();
    await seedPersistedHiddenControls(firstPaintPage, configuration.hiddenKeys);
    await firstPaintPage.route('**/_app/immutable/**/*.js', (route) => route.abort());
    await firstPaintPage.goto('/');
    await expect(firstPaintPage.locator('.color-palette')).toBeVisible();
    const firstPaint = await actionPanelGeometry(firstPaintPage);
    await firstPaintContext.close();

    expect(firstPaint.visibleButtonCount).toBe(configuration.visibleButtonCount);

    await seedPersistedHiddenControls(page, configuration.hiddenKeys);
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const hydrated = await actionPanelGeometry(page);

    expect(hydrated.visibleButtonCount).toBe(configuration.visibleButtonCount);
    expect(firstPaint.panelLeft).toBe(hydrated.panelLeft);
    expect(firstPaint.buttonWidth).toBeCloseTo(hydrated.buttonWidth, 2);
  });
}

for (const viewport of NARROW_LANDSCAPE_VIEWPORTS) {
  test(`${viewport.name} six-button row clears the Settings Button`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('splotch-drawer-open', 'true');
      localStorage.setItem('splotch-ai-access-token', 'test-token');
      localStorage.setItem('splotch-ai-image-enabled', 'true');
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
