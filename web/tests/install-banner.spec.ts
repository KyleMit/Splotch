import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { ANDROID_UA, draw, gotoApp } from './helpers';

test.use({
  userAgent: ANDROID_UA,
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

// The banner's exit is mostly a fixed in-app wait, not work: InstallBanner
// spends PARTING_MESSAGE_MS (4s) showing the parting note, then
// BANNER_SHRINK_EXIT_MS (550ms) shrinking the pill into the Settings Button —
// the auto-clear path this test drives sets exitIntoSettingsButton, so it takes
// that exit rather than the shorter plain fly-down. So ~4.6s of any budget here is
// floor that contention cannot compress, and only what is left absorbs
// inflation. Measured at 8 workers this step took up to 5.0s — half of the 10s it
// used to be given, the thinnest headroom ratio in the spec (ADR-0078 §3 names
// that the failure it predicts), against ~20x for every assertion around it.
const PARTING_EXIT_TIMEOUT_MS = 20_000;

// The banner is the LAST of five overlays the idle pump mounts, one per
// requestIdleCallback with no timeout option (boot/bootHiddenOverlays.ts,
// lib/idle.ts), so its mount waits for a genuinely idle frame however long that
// takes. And the third stroke — the one that makes the banner eligible — is also
// what releases the deferred service-worker registration in the same flush
// (routes/+page.svelte), whose offline precache work is exactly what keeps the page
// from going idle. So this wait is thin by construction, not by inflation: under
// full-suite load it exceeded the default 5s, while the same test passes 20/20
// in isolation at 4 workers.
const BANNER_MOUNT_TIMEOUT_MS = 20_000;

test('the install banner parts after five additional strokes', async ({ page }) => {
  // Eight strokes plus that fixed ~4.6s exit measured 17.7s at 8 workers, so the
  // default 30s per-test budget is the tightest bound in the spec once latency
  // inflates (ADR-0078 §2). test.slow() triples it.
  test.slow();
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
  await expect(banner).toContainText('Add Splotch to your home screen', {
    timeout: BANNER_MOUNT_TIMEOUT_MS,
  });

  for (let stroke = 3; stroke < 8; stroke += 1) {
    const y = 120 + stroke * 40;
    await draw(page, [
      { x: 100, y },
      { x: 280, y: y + 20 },
    ]);
  }

  await expect(banner.locator('.install-parting')).toContainText(
    'No rush — these steps are always in Settings.'
  );
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installDismissed))
    .toBe('true');
  await expect(banner).toBeHidden({ timeout: PARTING_EXIT_TIMEOUT_MS });
});

test('the fifth qualifying session re-shows the banner with return-aware copy', async ({
  page,
}) => {
  await page.addInitScript(
    ({ dismissedKey, sessionsKey }) => {
      localStorage.setItem(dismissedKey, 'true');
      localStorage.setItem(sessionsKey, '4');
    },
    {
      dismissedKey: STORAGE_KEYS.installDismissed,
      sessionsKey: STORAGE_KEYS.installRepromptSessionCount,
    }
  );
  await gotoApp(page);
  const banner = page.locator('.install-banner');

  for (let stroke = 0; stroke < 3; stroke += 1) {
    const y = 120 + stroke * 40;
    await draw(page, [
      { x: 100, y },
      { x: 280, y: y + 20 },
    ]);
  }

  await expect(banner).toContainText('Welcome back! Add Splotch to your home screen', {
    timeout: BANNER_MOUNT_TIMEOUT_MS,
  });
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installRepromptSessionCount)
    )
    .toBe('5');

  await banner.getByRole('button', { name: 'Not now' }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.installRepromptsUsed)
    )
    .toBe('1');
  await expect(banner).toBeHidden();
});
