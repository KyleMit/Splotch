import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { ANDROID_UA, drawRowStroke } from '../support/group-c.ts';

// The Add to Home Screen banner on an Android browser: earned by a few strokes, handed off to
// Settings if it is ignored for a few more, and brought back for a returning visitor twice at most
// (install/installPolicy.ts). The storage keys are the shipping keys, so a visitor who dismissed the
// banner before this app replaced the old one stays dismissed.

test.use({
  userAgent: ANDROID_UA,
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

const INSTALL_DISMISSED = 'splotch-install-dismissed';
const REPROMPT_SESSION_COUNT = 'splotch-install-reprompt-session-count';
const REPROMPTS_USED = 'splotch-install-reprompts-used';

// The tile beside the banner's copy previews the icon a parent will find on the home screen.
const HOME_SCREEN_ICON = '/apple-touch-icon.png';

const EARNING_STROKES = 3;
const AUTO_CLEAR_STROKES = 5;

// The banner loads on demand once a stroke count asks for it, and a starved CI runner stretches
// that import.
const BANNER_TIMEOUT_MS = 20_000;
// The parting note shows for four seconds and the pill then shrinks into Settings, so most of this
// is a fixed in-app wait rather than work.
const PARTING_EXIT_TIMEOUT_MS = 20_000;
// Long enough for a banner that was wrongly earned to have mounted.
const NOT_EARNED_WINDOW_MS = 1_000;

function storedValue(page: Page, key: string) {
  return page.evaluate((name) => localStorage.getItem(name), key);
}

async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, entries);
}

test('the banner appears after three strokes and parts after five more', async ({ page }) => {
  test.slow();
  const { paper } = await openDrawingScreen(page);
  const banner = page.getByText('Add Splotch to your home screen');

  for (let row = 0; row < EARNING_STROKES - 1; row++) await drawRowStroke(page, paper, row);
  await page.waitForTimeout(NOT_EARNED_WINDOW_MS);
  await expect(banner).toHaveCount(0);

  await drawRowStroke(page, paper, EARNING_STROKES - 1);
  await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT_MS });
  await expect(page.getByRole('button', { name: 'How?' })).toBeVisible();
  const previewIcon = page.locator(`img[src="${HOME_SCREEN_ICON}"]`);
  await expect(previewIcon).toHaveAttribute('alt', '');
  await expect
    .poll(() => previewIcon.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  for (let row = 0; row < AUTO_CLEAR_STROKES; row++)
    await drawRowStroke(page, paper, EARNING_STROKES + row);

  await expect(page.getByText('No rush — these steps are always in')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => storedValue(page, INSTALL_DISMISSED)).toBe('true');
  await expect(page.getByText('No rush — these steps are always in')).toBeHidden({
    timeout: PARTING_EXIT_TIMEOUT_MS,
  });
});

test('the fifth qualifying session brings the banner back with return-aware copy', async ({
  page,
}) => {
  await seedStorage(page, { [INSTALL_DISMISSED]: 'true', [REPROMPT_SESSION_COUNT]: '4' });
  const { paper } = await openDrawingScreen(page);

  for (let row = 0; row < EARNING_STROKES; row++) await drawRowStroke(page, paper, row);

  const banner = page.getByText('Welcome back! Add Splotch to your home screen');
  await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT_MS });
  await expect.poll(() => storedValue(page, REPROMPT_SESSION_COUNT)).toBe('5');

  await page.getByRole('button', { name: 'Not now' }).click();

  await expect.poll(() => storedValue(page, REPROMPTS_USED)).toBe('1');
  await expect(banner).toBeHidden();
});

test('the final reminder points parents back to Settings', async ({ page }) => {
  await seedStorage(page, {
    [INSTALL_DISMISSED]: 'true',
    [REPROMPT_SESSION_COUNT]: '10',
    [REPROMPTS_USED]: '1',
  });
  const { paper } = await openDrawingScreen(page);

  for (let row = 0; row < EARNING_STROKES; row++) await drawRowStroke(page, paper, row);

  await expect(page.getByText('One last reminder — install Splotch')).toBeVisible({
    timeout: BANNER_TIMEOUT_MS,
  });
  await expect(page.getByText("We won't ask again — it's always in Settings")).toBeVisible();
});
