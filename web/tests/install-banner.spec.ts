import { expect, test, type Page } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import {
  ANDROID_UA,
  BANNER_MOUNT_TIMEOUT_MS,
  INSTALL_BANNER_AUTO_CLEAR_STROKES,
  INSTALL_BANNER_EARNING_STROKES,
  drawInstallBannerStrokes,
  gotoApp,
  readDrawingHistory,
} from './helpers';

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

const STROKE_COMMIT_TIMEOUT_MS = 10_000;
// The idle overlay pump mounts one resident per interaction-quiet slice, spaced
// by lib/idle.ts, so draining it is a multi-second floor before contention
// stretches it.
const OVERLAY_PUMP_DRAIN_TIMEOUT_MS = 30_000;

async function committedStrokeRevision(page: Page): Promise<number> {
  const history = await readDrawingHistory(page);
  if (history?.strokeRevision === undefined) {
    throw new Error('drawing stroke revision is unavailable');
  }
  return history.strokeRevision;
}

// Whether the banner is earned is decided synchronously from two inputs: the
// committed stroke count (canvasState.strokeCount ticks in the same engine
// commit that advances the drawing history's strokeRevision) and a mounted
// InstallBanner, whose `visible` derives from it. Below the threshold nothing
// demands the banner, so it mounts in the idle overlay pump's slice before
// Settings; bootHiddenOverlays.test.ts pins that order. A closed #settingsModal
// in the DOM therefore means the banner component is live and has already
// evaluated the stroke count, so its absence is a decision, not a race.
async function waitForBannerEarningDecision(page: Page, strokeRevision: number) {
  await expect
    .poll(
      async () => {
        const history = await readDrawingHistory(page);
        return history
          ? { strokeRevision: history.strokeRevision, pendingCommands: history.pendingCommands }
          : null;
      },
      { timeout: STROKE_COMMIT_TIMEOUT_MS }
    )
    .toEqual({ strokeRevision, pendingCommands: 0 });
  await expect(page.locator('#settingsModal')).toBeAttached({
    timeout: OVERLAY_PUMP_DRAIN_TIMEOUT_MS,
  });
}

test('the install banner parts after five additional strokes', async ({ page }) => {
  // Eight strokes, the overlay pump's drain, and that fixed ~4.6s exit make the
  // default 30s per-test budget the tightest bound in the spec once latency
  // inflates (ADR-0078 §2). test.slow() triples it.
  test.slow();
  await gotoApp(page);
  const banner = page.locator('.install-banner');
  const baseline = await committedStrokeRevision(page);

  await drawInstallBannerStrokes(page, INSTALL_BANNER_EARNING_STROKES - 1);
  await waitForBannerEarningDecision(page, baseline + INSTALL_BANNER_EARNING_STROKES - 1);
  await expect(banner).toHaveCount(0);

  await drawInstallBannerStrokes(page, 1);
  await expect(banner).toContainText('Add Splotch to your home screen', {
    timeout: BANNER_MOUNT_TIMEOUT_MS,
  });

  await drawInstallBannerStrokes(page, INSTALL_BANNER_AUTO_CLEAR_STROKES);

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

  await drawInstallBannerStrokes(page);

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

test('the final re-prompt points parents back to Settings', async ({ page }) => {
  await page.addInitScript(
    ({ dismissedKey, sessionsKey, repromptsUsedKey }) => {
      localStorage.setItem(dismissedKey, 'true');
      localStorage.setItem(sessionsKey, '10');
      localStorage.setItem(repromptsUsedKey, '1');
    },
    {
      dismissedKey: STORAGE_KEYS.installDismissed,
      sessionsKey: STORAGE_KEYS.installRepromptSessionCount,
      repromptsUsedKey: STORAGE_KEYS.installRepromptsUsed,
    }
  );
  await gotoApp(page);
  const banner = page.locator('.install-banner');

  await drawInstallBannerStrokes(page);

  await expect(banner).toContainText('One last reminder — install Splotch', {
    timeout: BANNER_MOUNT_TIMEOUT_MS,
  });
  await expect(banner).toContainText("We won't ask again — it's always in Settings");
});
