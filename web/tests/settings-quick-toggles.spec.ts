import { expect, test, type Page } from '@playwright/test';

import { AI_ACCESS_TOKEN_PARAM } from '../src/lib/inviteLink';

import { enterFullscreen, gotoApp, openSettingsModal, resizeInFullscreen } from './helpers';

// The Orientation picker renders only where a lock would be honored
// (orientationLockApplies): a coarse pointer, supplied by touch emulation as a
// browser's mobile-device mode does, plus a state Chromium accepts a lock in,
// supplied by enterFullscreen. Missing either, a desktop tab gets the About cell
// and the Appearance section is one card shorter.
test.describe('settings on a rotatable device', () => {
  test.use({ hasTouch: true });

  test('setting groups space their cards without affecting the compact grid', async ({ page }) => {
    await gotoApp(page, `/?${AI_ACCESS_TOKEN_PARAM}=test-access-code`);
    await enterFullscreen(page);

    const modal = await openSettingsModal(page);
    // Scoped to one section: the wide pane stacks every section at once, so an
    // unscoped selector would sweep up the whole modal's cards.
    const directCards = page.locator(
      '.settings-section[data-section="appearance"] .setting-group > .setting'
    );
    await expect(directCards).toHaveCount(3);
    await expect(directCards.nth(1)).toHaveCSS('margin-top', '8px');
    await expect(directCards.nth(2)).toHaveCSS('margin-top', '8px');

    await modal.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
    const aiToggle = page.locator('#aiImageToggle');
    await expect(aiToggle).toBeInViewport();
    await aiToggle.click();
    await expect(page.locator('#aiCodeActive')).toBeVisible();
    const aiPrimaryCards = page.locator(
      '.settings-section[data-section="ai"] .setting-group:has(#aiImageToggle) > .setting'
    );
    await expect(aiPrimaryCards).toHaveCount(1);
    const aiFeatureCards = page.locator(
      '.settings-section[data-section="ai"] .setting-group:has(#aiCustomizationToggle) > .setting'
    );
    await expect(aiFeatureCards).toHaveCount(2);
    await expect(aiFeatureCards.nth(1)).toHaveCSS('margin-top', '8px');

    // Chromium will not resize a fullscreen window; re-entering restores the
    // state the Orientation cell renders in.
    await resizeInFullscreen(page, { width: 852, height: 390 });
    await expect(modal).toHaveClass(/compact/);
    const quickToggleCells = page.locator('.quick-toggles > .setting');
    await expect(quickToggleCells).toHaveCount(4);
    await expect(quickToggleCells.nth(1)).toHaveCSS('margin-top', '0px');
    await expect(quickToggleCells.nth(2)).toHaveCSS('margin-top', '0px');
    await expect(quickToggleCells.nth(3)).toHaveCSS('margin-top', '0px');
  });

  // Fullscreen, or the quick grid's fourth cell is the About cell rather than
  // the Orientation picker.
  async function openSettingsModalCompact(page: Page) {
    await page.setViewportSize({ width: 852, height: 390 });
    await gotoApp(page);
    await enterFullscreen(page);
    return openSettingsModal(page);
  }

  // A landscape phone has the width of the tablet shell but almost none of its
  // height, so the full section list is unusably cramped there. Settings
  // collapses to a strip of quick toggles plus a pointer to portrait; a landscape
  // tablet (height ≥ 600px, e.g. the default desktop viewport) keeps the
  // two-pane shell.
  test('landscape phone renders compact quick toggles', async ({ page }) => {
    const modal = await openSettingsModalCompact(page);
    await expect(modal).toHaveClass(/compact/);

    // Quick toggles render instead of the hub list or the sidebar.
    await expect(page.locator('.hub-list')).toHaveCount(0);
    await expect(page.locator('.settings-nav')).toHaveCount(0);
    await expect(page.locator('#quickSoundToggle')).toBeVisible();
    await expect(page.locator('#quickNightToggle')).toBeVisible();
    await expect(page.locator('#quickToolDrawerToggle')).toBeVisible();
    // The Orientation picker holds the device-varying bottom-right (last) slot, so
    // the other three toggles sit in the same place on lock-incapable devices too.
    const orientationCell = page.locator('.quick-toggles > .setting').nth(3);
    for (const choice of ['portrait', 'landscape', 'auto']) {
      await expect(orientationCell.locator(`#orientationOption-${choice}`)).toBeVisible();
    }
    await expect(page.getByText('Switch to portrait for the full settings')).toBeVisible();
  });

  test('the compact Orientation picker locks either side or releases to Auto', async ({ page }) => {
    await openSettingsModalCompact(page);
    const option = (choice: string) => page.locator(`#orientationOption-${choice}`);

    // A phone-sized screen defaults to a portrait lock, so Portrait starts selected.
    await expect(option('portrait')).toHaveAttribute('aria-checked', 'true');

    await option('landscape').click();
    await expect(option('landscape')).toHaveAttribute('aria-checked', 'true');
    await expect(option('portrait')).toHaveAttribute('aria-checked', 'false');

    // Auto is its own option, so tapping the selected side again keeps it locked.
    await option('landscape').click();
    await expect(option('landscape')).toHaveAttribute('aria-checked', 'true');

    await option('auto').click();
    await expect(option('auto')).toHaveAttribute('aria-checked', 'true');
    await expect(option('landscape')).toHaveAttribute('aria-checked', 'false');
  });

  test('quick-toggle changes persist into the full portrait Settings', async ({ page }) => {
    await openSettingsModalCompact(page);

    // A quick toggle drives the same persisted setting as the full section...
    await page.locator('#quickToolDrawerToggle').click();
    await expect(page.locator('#quickToolDrawerToggle')).toHaveAttribute('aria-checked', 'false');

    // Set a landscape lock, away from the phone's portrait default, so the full
    // shell below can only show it if the quick picker persisted it.
    await expect(page.locator('#orientationOption-portrait')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await page.locator('#orientationOption-landscape').click();
    await expect(page.locator('#orientationOption-landscape')).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // ...and rotating to portrait swaps in the full hub shell live, where the
    // Controls section reflects the change made from the quick toggle. The
    // fullscreen round trip is what lets Chromium resize the window at all.
    await resizeInFullscreen(page, { width: 390, height: 852 });
    await expect(page.locator('.hub-list')).toBeVisible();
    await expect(page.locator('#quickSoundToggle')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tool Drawer' }).click();
    await expect(page.locator('#toolDrawerToggle')).toHaveAttribute('aria-checked', 'false');

    // The Appearance section's Orientation picker shows the lock we set.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await expect(page.locator('#orientationOption-landscape')).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});

// The default context is a desktop browser: a fine pointer on a screen that
// cannot turn, so the picker would be a control the app can never honor. This
// test deliberately sits outside the touch-emulated describe in this file, and
// the two together are the whole web gate — one viewport short enough to reach
// the compact shell, which a desktop window can be, proves the About cell fills
// the slot there too rather than leaving a hole.
test('a desktop browser offers no Orientation picker in either shell', async ({ page }) => {
  await gotoApp(page);

  const modal = await openSettingsModal(page);
  await expect(modal).toHaveClass(/wide/);
  await expect(page.locator('[id^="orientationOption-"]')).toHaveCount(0);
  await expect(
    page.locator('.settings-section[data-section="appearance"] .setting-group > .setting')
  ).toHaveCount(2);

  await page.setViewportSize({ width: 852, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  await expect(page.locator('[id^="orientationOption-"]')).toHaveCount(0);
  await expect(page.locator('.quick-toggles > .setting.about-cell')).toBeVisible();
});

// A lock-incapable device (tablet-class native — supportsOrientationLock) hides
// the Orientation quick picker, which used to leave a 3-cell hole in the
// compact 2×2; a mini About cell (Splotch icon + version) fills the bottom-right
// slot instead — the one device-varying cell, so the other three toggles sit in
// the same place on every device. supportsOrientationLock reads the *physical
// screen's* smaller side while PHONE_LANDSCAPE_QUERY reads the window, so the stubbed
// screen stays tablet-sized (min side ≥ 600) while the window height drops
// under 600 — the small-tablet-in-landscape combination from the report. (The
// screen getters are stubbed directly because Playwright's `screen` context
// option only takes effect in mobile emulation, where Chromium honors
// screen-size overrides.)
test('a lock-incapable device fills the empty quick-toggle slot with a mini About cell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 560 });
  // The web build never loads Capacitor plugins (__IS_CAPACITOR__ is false),
  // so a stub global is enough to flip isNative() without breaking anything.
  await page.addInitScript(() => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
    Object.defineProperty(Screen.prototype, 'width', { get: () => 1133 });
    Object.defineProperty(Screen.prototype, 'height', { get: () => 744 });
  });
  await gotoApp(page);

  const modal = await openSettingsModal(page);
  await expect(modal).toHaveClass(/compact/);

  // The Orientation picker is gone, and the About cell keeps the grid at four
  // cells, sitting in the bottom-right (last) slot where it would be.
  await expect(page.locator('[id^="orientationOption-"]')).toHaveCount(0);
  const cells = page.locator('.quick-toggles > .setting');
  await expect(cells).toHaveCount(4);
  const aboutCell = cells.nth(3);
  await expect(aboutCell).toHaveClass(/about-cell/);
  await expect(aboutCell).toBeVisible();
  await expect(aboutCell).toContainText(/Version \d+\.\d+\.\d+/);
});
