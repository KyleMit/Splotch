import { expect, test } from '@playwright/test';
import { APP_HOME_SCREEN_NAME } from '../src/lib/appIdentity';
import { type InstallMode, type InstallPromptStage } from '../src/lib/state/install.svelte';
import {
  ANDROID_UA,
  IPAD_UA,
  earnInstallBanner,
  gotoApp,
  registerServiceWorkerAndControl,
} from './helpers';
import { captureMockInstallPrompt, seedInstallStage } from './install-preview-harness';

const PREVIEW_ICON_SIZE_PX = 52;
const PREVIEW_WIDTH_PX = 60;
const SHORT_PHONE = { width: 320, height: 568 };
const STAGES: Record<InstallPromptStage, string> = {
  initial: 'Add Splotch to your home screen',
  returning: 'Welcome back! Add Splotch to your home screen',
  final: 'One last reminder — install Splotch',
};
const MODES: Record<Exclude<InstallMode, 'none'>, { userAgent: string; cta: string }> = {
  ios: { userAgent: IPAD_UA, cta: 'How?' },
  android: { userAgent: ANDROID_UA, cta: 'How?' },
  oneTap: { userAgent: ANDROID_UA, cta: 'Install' },
};

for (const viewport of [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const mode of ['ios', 'android', 'oneTap'] as const) {
      for (const stage of ['initial', 'returning', 'final'] as const) {
        test.describe(`${mode} ${stage} ${colorScheme} ${viewport.width}`, () => {
          test.use({ viewport, colorScheme, userAgent: MODES[mode].userAgent, hasTouch: true });
          test('shows the decorative home-screen preview beside the unchanged prompt', async ({
            page,
          }) => {
            await seedInstallStage(page, stage);
            await gotoApp(page);
            await earnInstallBanner(page);
            if (mode === 'oneTap') await captureMockInstallPrompt(page);
            const banner = page.locator('.install-banner');
            const preview = banner.locator('.install-preview');
            const icon = preview.locator('img');
            await expect(preview).toHaveAttribute('aria-hidden', 'true');
            await expect(preview).toHaveCSS('width', `${PREVIEW_WIDTH_PX}px`);
            await expect(preview.locator('.install-preview-label')).toHaveText(
              APP_HOME_SCREEN_NAME
            );
            await expect(icon).toHaveAttribute('src', '/apple-touch-icon.png');
            await expect(icon).toHaveAttribute('alt', '');
            await expect(icon).toHaveAttribute('decoding', 'async');
            await expect(icon).not.toHaveAttribute('loading');
            await expect(icon).toHaveCSS('width', `${PREVIEW_ICON_SIZE_PX}px`);
            await expect(icon).toHaveCSS('height', `${PREVIEW_ICON_SIZE_PX}px`);
            await expect
              .poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
              .toBeGreaterThan(0);
            await expect(banner.locator('.install-copy strong')).toHaveText(STAGES[stage]);
            await expect(banner.locator('.install-cta')).toHaveText(MODES[mode].cta);
            await expect(banner.locator('.install-main [data-icon="splotchy"]')).toHaveCount(0);
            await expect(banner).toHaveJSProperty(
              'scrollWidth',
              await banner.evaluate((node) => node.clientWidth)
            );
          });
        });
      }
    }
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`short phone ${colorScheme}`, () => {
    test.use({
      viewport: SHORT_PHONE,
      userAgent: IPAD_UA,
      colorScheme,
      hasTouch: true,
      isMobile: true,
    });
    test('the returning preview and expanded help clear the palette and leave corner controls reachable', async ({
      page,
    }) => {
      await seedInstallStage(page, 'returning');
      await gotoApp(page);
      await earnInstallBanner(page);
      const banner = page.locator('.install-banner');
      await banner.getByRole('button', { name: 'How?' }).click();
      await expect(banner.locator('.install-hint')).toHaveCSS('opacity', '1');
      const clearance = await banner.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const palette = document.querySelector('.color-palette')?.getBoundingClientRect();
        return {
          top: bounds.top,
          paletteBottom: palette?.bottom ?? 0,
          bottom: bounds.bottom,
          height: innerHeight,
        };
      });
      expect(clearance.top).toBeGreaterThanOrEqual(clearance.paletteBottom);
      expect(clearance.bottom).toBeLessThan(clearance.height);
      await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
      await expect(banner).toBeHidden();
      await page.getByRole('button', { name: 'Collapse controls', exact: true }).click();
      await expect(banner.getByRole('button', { name: 'Hide' })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click({ trial: true });
    });
  });
}

test.describe('system accommodations', () => {
  test.use({
    viewport: SHORT_PHONE,
    userAgent: IPAD_UA,
    reducedMotion: 'reduce',
    forcedColors: 'active',
  });
  test('the preview remains decoded and its label uses system text ink', async ({ page }) => {
    await gotoApp(page);
    await earnInstallBanner(page);
    const preview = page.locator('.install-preview');
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(preview.locator('.install-preview-label')).toHaveText(APP_HOME_SCREEN_NAME);
    const ink = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(preview.locator('.install-preview-label')).toHaveCSS('color', ink);
  });
});

test('the actual service-worker precache serves the preview icon offline', async ({
  page,
  context,
}) => {
  test.skip(!!process.env.DEV_SERVER, 'the dev server does not emit a service worker');
  await gotoApp(page);
  await registerServiceWorkerAndControl(page);
  const cached = await page.evaluate(async () => {
    const response = await caches.match('/apple-touch-icon.png', { ignoreSearch: true });
    return response?.headers.get('content-type');
  });
  expect(cached).toBe('image/png');
  await context.setOffline(true);
  const icon = await page.evaluate(async () => {
    const response = await fetch('/apple-touch-icon.png');
    const bitmap = await createImageBitmap(await response.blob());
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { ok: response.ok, ...dimensions };
  });
  expect(icon).toEqual({ ok: true, width: 180, height: 180 });
});
