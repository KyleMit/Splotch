import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { draw, gotoApp } from './helpers';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';

test.use({
  userAgent: ANDROID_UA,
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

test('the install banner parts after five additional strokes', async ({ page }) => {
  await gotoApp(page);
  const banner = page.locator('.install-banner');

  for (let stroke = 0; stroke < 2; stroke += 1) {
    const y = 120 + stroke * 40;
    await draw(page, [
      { x: 100, y },
      { x: 280, y: y + 20 },
    ]);
  }
  await expect(banner).toHaveCount(0);

  await draw(page, [
    { x: 100, y: 200 },
    { x: 280, y: 220 },
  ]);
  await expect(banner).toContainText('Add Splotch to your home screen');

  for (let stroke = 3; stroke < 8; stroke += 1) {
    const y = 120 + stroke * 40;
    await draw(page, [
      { x: 100, y },
      { x: 280, y: y + 20 },
    ]);
  }

  await expect(banner.locator('.install-parting')).toContainText(
    'No rush — these steps are always in the Parent Center.'
  );
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installDismissed))
    .toBe('true');
  await expect(banner).toBeHidden({ timeout: 10_000 });
});
