import { expect, test } from '@playwright/test';
import { overrideSafeAreaInsets } from './cdp';

const ENV_INSETS = { top: 48, right: 12, bottom: 24, left: 8 };
const SCENARIOS = [
  {
    name: 'portrait',
    viewport: { width: 412, height: 915 },
    insets: { top: 40, right: 0, bottom: 16, left: 0 },
  },
  {
    name: 'landscape',
    viewport: { width: 915, height: 412 },
    insets: { top: 0, right: 0, bottom: 0, left: 40 },
  },
  {
    name: 'native padding',
    viewport: { width: 412, height: 915 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`Capacitor ${scenario.name} insets take precedence over env()`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await overrideSafeAreaInsets(page, ENV_INSETS);
    await page.goto('/');
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    await page.evaluate((insets) => {
      for (const [edge, value] of Object.entries(insets)) {
        document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
      }
    }, scenario.insets);

    const app = page.locator('.app-container');
    for (const edge of ['top', 'right', 'left'] as const) {
      await expect(app).toHaveCSS(`padding-${edge}`, `${scenario.insets[edge]}px`);
    }
    const bottomProbe = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;visibility:hidden;height:var(--safe-area-bottom)';
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    expect(bottomProbe).toBe(scenario.insets.bottom);
    await expect(page.locator('.notch-band--top')).toHaveCSS('height', `${scenario.insets.top}px`);
    await expect(page.locator('.notch-band--left')).toHaveCSS('width', `${scenario.insets.left}px`);
    await expect(page.locator('.notch-band--right')).toHaveCSS(
      'width',
      `${scenario.insets.right}px`
    );
  });
}

test('removing Capacitor insets restores the web env() fallback', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await overrideSafeAreaInsets(page, ENV_INSETS);
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '0px');
  });
  await expect(page.locator('.app-container')).toHaveCSS('padding-top', '0px');
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--safe-area-inset-top');
  });
  await expect(page.locator('.app-container')).toHaveCSS('padding-top', `${ENV_INSETS.top}px`);
});
