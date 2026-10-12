import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

// Chrome on Android honors screen.orientation.lock() only in fullscreen, and
// releases the lock when fullscreen ends. Headless Chromium grants it anywhere,
// so the stub below restores the Android rule and records every request.
test.use({ hasTouch: true, viewport: { width: 393, height: 852 } });

interface LockRequest {
  orientation: string;
  granted: boolean;
}

declare global {
  interface Window {
    __orientationLockRequests: LockRequest[];
  }
}

async function gotoAndroidTabWithPortraitLock(page: Page) {
  await page.addInitScript((keys) => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    localStorage.setItem(keys.lockRotation, 'true');
    localStorage.setItem(keys.forceLandscape, 'false');
    window.__orientationLockRequests = [];
    Object.defineProperty(screen.orientation, 'lock', {
      value: (orientation: string) => {
        const granted = document.fullscreenElement !== null;
        window.__orientationLockRequests.push({ orientation, granted });
        return granted
          ? Promise.resolve()
          : Promise.reject(new DOMException('Needs fullscreen', 'NotSupportedError'));
      },
    });
  }, STORAGE_KEYS);
  await gotoApp(page);
}

const lockRequests = (page: Page) => page.evaluate(() => window.__orientationLockRequests);

test('entering fullscreen applies the portrait lock the tab refused', async ({ page }) => {
  await gotoAndroidTabWithPortraitLock(page);
  await expect
    .poll(() => lockRequests(page))
    .toEqual([{ orientation: 'portrait', granted: false }]);

  await page.getByRole('button', { name: 'Enter fullscreen' }).click();

  await expect
    .poll(() => lockRequests(page))
    .toEqual([
      { orientation: 'portrait', granted: false },
      { orientation: 'portrait', granted: true },
    ]);
});

test('re-entering fullscreen locks again after leaving released it', async ({ page }) => {
  await gotoAndroidTabWithPortraitLock(page);
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(async () => (await lockRequests(page)).at(-1)?.granted).toBe(true);

  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();

  await expect
    .poll(async () => (await lockRequests(page)).filter(({ granted }) => granted).length)
    .toBe(2);
});
