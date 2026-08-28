import { expect, test, type Page } from '@playwright/test';
import { draw, firstOpaquePixel, gotoApp, openSettingsModal, PICKER_GREEN } from './helpers';
import { ENGINE_SMOKE_TAG } from './tags';

// Cross-engine critical-path smoke. ENGINE_SMOKE_TAG routes this spec to the
// Firefox and WebKit projects and out of Chromium. The tag, not the filename,
// declares the routing beside the tests it affects.
//
// Keep it small and cross-engine portable: no CDP sessions (the viewport-rotation
// coverage in flows-coloring-book.spec.ts and flows-magic-brush.spec.ts is
// Chromium-only), no synthetic-touch cases from flows-palette-brush.spec.ts,
// no dev-harness routes, no pixel-perfect assertions that depend on Chromium's
// rasterizer. The shared helpers imported above are held to the same bar.

interface PalettePanelGeometry {
  paletteRight: number;
  panelLeft: number;
  buttonWidth: number;
}

function palettePanelGeometry(page: Page): Promise<PalettePanelGeometry> {
  return page.evaluate(() => {
    const palette = document.querySelector('.color-palette');
    const panel = document.querySelector('.actions-panel');
    const button = document.querySelector('.action-button:not([hidden])');
    if (
      !(palette instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(button instanceof HTMLElement)
    ) {
      throw new Error('Actions Panel geometry is unavailable');
    }
    return {
      paletteRight: palette.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
      buttonWidth: button.getBoundingClientRect().width,
    };
  });
}

test.describe('Cross-engine critical-path smoke', { tag: ENGINE_SMOKE_TAG }, () => {
  test('the app boots: canvas, palette, and Settings Button render', async ({ page }) => {
    await gotoApp(page);
    const settingsButton = page.getByRole('button', { name: 'Settings' });
    await expect(settingsButton).toBeVisible();
    await expect(settingsButton.locator('[data-icon="settings"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Custom Color' })).toBeVisible();
  });

  for (const viewport of [
    { name: 'two-column', width: 667, height: 375, paletteWidth: 156 },
    { name: 'single-column iPad', width: 1024, height: 768, paletteWidth: 84 },
  ] as const) {
    test(`${viewport.name} Actions Panel first paint matches hydration`, async ({
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
      const preHydration = await palettePanelGeometry(preHydrationPage);
      await preHydrationContext.close();

      await page.setViewportSize(viewport);
      await gotoApp(page);
      await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
      const hydrated = await palettePanelGeometry(page);

      expect(preHydration.paletteRight).toBe(viewport.paletteWidth);
      expect(hydrated.paletteRight).toBe(viewport.paletteWidth);
      expect(preHydration.panelLeft).toBe(hydrated.panelLeft);
      expect(preHydration.buttonWidth).toBeCloseTo(hydrated.buttonWidth, 2);
    });
  }

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

  test('Settings dialog opens and closes', async ({ page }) => {
    await gotoApp(page);
    const modal = await openSettingsModal(page);
    await expect(modal.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });

  test('the Color Picker dialog opens and commits a color', async ({ page }) => {
    await gotoApp(page);
    await page.getByRole('button', { name: 'Custom Color' }).click();
    const dialog = page.locator('#color-picker');
    await expect(dialog).toBeVisible();
    const green = dialog.locator(`.grid.landscape .hexagon[data-color="${PICKER_GREEN}"]`);
    await green.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Custom Color' })).toHaveClass(/active/);
  });
});
