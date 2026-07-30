import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';

import { gotoApp, openParentCenter } from './helpers';
import { retryOpen } from './retry';

async function openAiSettings(page: Page, expectedField = '#aiKeyInput') {
  await openParentCenter(page);
  // The Parent Center is a section list — a sidebar item on tablet/desktop, a
  // hub row on phone. Either way the control carries the section label; opening
  // it (sidebar select or phone drill-in) reveals the section content.
  //
  // Retried rather than clicked once: the dialog itself mounts on first open
  // (ADR-0049) and flies in, so this click lands on markup that is still
  // arriving, and a lost one would leave the section closed with nothing to
  // re-open it — the same hazard openParentCenter above rides out.
  await retryOpen(page.locator(expectedField), () =>
    page.getByRole('button', { name: 'AI Art' }).click({ timeout: 3000 })
  );
}

async function submitAiKey(page: Page, value: string) {
  const save = page.getByRole('button', { name: 'Save' });
  await expect(async () => {
    await page.locator('#aiKeyInput').fill(value);
    await expect(save).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
  await save.click();
}

test('parent center sidebar switches the content pane (tablet layout)', async ({ page }) => {
  await gotoApp(page);

  const modal = await openParentCenter(page);
  // The default Playwright viewport is desktop-width, so the two-pane shell with
  // a persistent sidebar renders and the first section is selected.
  await expect(modal).toHaveClass(/wide/);
  await expect(page.getByRole('button', { name: 'Appearance & Display' })).toHaveClass(/active/);

  // Selecting a section highlights it in the sidebar and swaps the pane content.
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.getByRole('button', { name: 'Controls & Buttons' })).toHaveClass(/active/);
  await expect(page.locator('#advancedControlsToggle')).toBeVisible();

  // The Setup section keeps its own <details> accordions inside the pane.
  await page.getByRole('button', { name: 'Setup Guide' }).click();
  const setupDetails = page.locator('.help-section').first();
  await expect(setupDetails.locator('summary')).toBeVisible();

  // About holds the identity block — the mascot renders in full color.
  await page.getByRole('button', { name: 'About' }).click();
  const aboutMascot = page.locator('.about-brand [data-icon="splotchy"]');
  const aboutMascotImage = aboutMascot.locator('img');
  await expect(aboutMascotImage).toBeVisible();
  await expect
    .poll(() => aboutMascotImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(aboutMascot).toHaveClass(/icon-color/);
});

test('setting card spacing only applies to direct section siblings', async ({ page }) => {
  await page.addInitScript(
    (aiAccessToken) => localStorage.setItem(aiAccessToken, 'test-access-code'),
    STORAGE_KEYS.aiAccessToken
  );
  await gotoApp(page);

  const modal = await openParentCenter(page);
  const directCards = page.locator('.pc-pane .setting-group > .setting');
  await expect(directCards).toHaveCount(3);
  await expect(directCards.nth(1)).toHaveCSS('margin-top', '6px');
  await expect(directCards.nth(2)).toHaveCSS('margin-top', '6px');

  await page.getByRole('button', { name: 'AI Art' }).click();
  await expect(page.locator('#aiCodeActive')).toBeVisible();
  const aiFeatureCards = page.locator('.pc-pane .ai-controls > .setting');
  await expect(aiFeatureCards).toHaveCount(3);
  await expect(aiFeatureCards.nth(1)).toHaveCSS('margin-top', '0px');
  await expect(aiFeatureCards.nth(2)).toHaveCSS('margin-top', '0px');

  await page.setViewportSize({ width: 852, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  const quickToggleCells = page.locator('.quick-toggles > .setting');
  await expect(quickToggleCells).toHaveCount(4);
  await expect(quickToggleCells.nth(1)).toHaveCSS('margin-top', '0px');
  await expect(quickToggleCells.nth(2)).toHaveCSS('margin-top', '0px');
  await expect(quickToggleCells.nth(3)).toHaveCSS('margin-top', '0px');
});

test('parent center hub drills into a section and back (phone layout)', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);

  const modal = await openParentCenter(page);
  // Below the breakpoint the hub renders instead of the sidebar.
  await expect(modal).not.toHaveClass(/wide/);
  await expect(page.locator('.hub-list')).toBeVisible();
  // Nothing is drilled in yet, so a section's own controls aren't mounted.
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);

  // Tapping a row opens the full-page section.
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.locator('#advancedControlsToggle')).toBeVisible();
  await expect(page.locator('.hub-list')).toHaveCount(0);

  // The back arrow returns to the hub.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);
});

async function openParentCenterCompact(page: Page) {
  await page.setViewportSize({ width: 852, height: 390 });
  await gotoApp(page);
  return openParentCenter(page);
}

// A landscape phone has the width of the tablet shell but almost none of its
// height, so the full section list is unusably cramped there. The Parent Center
// collapses to a strip of quick toggles plus a pointer to portrait; a landscape
// tablet (height ≥ 600px, e.g. the default desktop viewport above) keeps the
// two-pane shell.
test('landscape phone renders compact quick toggles', async ({ page }) => {
  const modal = await openParentCenterCompact(page);
  await expect(modal).toHaveClass(/compact/);

  // Quick toggles render instead of the hub list or the sidebar.
  await expect(page.locator('.hub-list')).toHaveCount(0);
  await expect(page.locator('.pc-nav')).toHaveCount(0);
  await expect(page.locator('#quickSoundToggle')).toBeVisible();
  await expect(page.locator('#quickNightToggle')).toBeVisible();
  await expect(page.locator('#quickAdvancedControlsToggle')).toBeVisible();
  // The orientation lock selector holds the device-varying bottom-right (last)
  // slot, so the other three toggles sit in the same place on lock-incapable
  // devices too.
  const orientationCell = page.locator('.quick-toggles > .setting').nth(3);
  await expect(orientationCell.locator('#quickLockPortrait')).toBeVisible();
  await expect(orientationCell.locator('#quickLockLandscape')).toBeVisible();
  await expect(page.getByText('Switch to portrait for the full settings')).toBeVisible();
});

test('the orientation lock selector cycles portrait, landscape, and off', async ({ page }) => {
  await openParentCenterCompact(page);

  // A phone-sized screen defaults to a portrait lock, so Portrait starts active.
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'false');

  // Choosing the other side moves the lock to it.
  await page.locator('#quickLockLandscape').click();
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'false');

  // Tapping the active side again releases the lock — neither side stays active,
  // so the phone is free to rotate again.
  await page.locator('#quickLockLandscape').click();
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'false');

  // A released selector accepts a fresh pick.
  await page.locator('#quickLockPortrait').click();
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');
});

test('quick-toggle changes persist into the full portrait Parent Center', async ({ page }) => {
  await openParentCenterCompact(page);

  // A quick toggle drives the same persisted setting as the full section...
  await page.locator('#quickAdvancedControlsToggle').click();
  await expect(page.locator('#quickAdvancedControlsToggle')).toHaveAttribute(
    'aria-checked',
    'false'
  );

  // Set a portrait lock through the off state, proving each click acts.
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#quickLockPortrait').click();
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#quickLockPortrait').click();
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');

  // ...and rotating to portrait swaps in the full hub shell live, where the
  // Controls section reflects the change made from the quick toggle.
  await page.setViewportSize({ width: 390, height: 852 });
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#quickSoundToggle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'false');

  // The Appearance section shows the lock we set, now forced to portrait.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Appearance & Display' }).click();
  await expect(page.locator('#lockRotationToggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#forceLandscapeToggle')).toHaveAttribute('aria-checked', 'false');
});

// A lock-incapable device (tablet-class native — supportsOrientationLock) hides
// the Lock Rotation quick toggle, which used to leave a 3-cell hole in the
// compact 2×2; a mini About cell (Splotch icon + version) fills the bottom-right
// slot instead — the one device-varying cell, so the other three toggles sit in
// the same place on every device. supportsOrientationLock reads the *physical
// screen's* smaller side while COMPACT_QUERY reads the window, so the stubbed
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

  const modal = await openParentCenter(page);
  await expect(modal).toHaveClass(/compact/);

  // The orientation lock selector is gone, and the About cell keeps the grid at
  // four cells, sitting in the bottom-right (last) slot where it would be.
  await expect(page.locator('#quickLockPortrait')).toHaveCount(0);
  await expect(page.locator('#quickLockLandscape')).toHaveCount(0);
  const cells = page.locator('.quick-toggles > .setting');
  await expect(cells).toHaveCount(4);
  const aboutCell = cells.nth(3);
  await expect(aboutCell).toHaveClass(/about-cell/);
  await expect(aboutCell).toBeVisible();
  await expect(aboutCell).toContainText(/Version \d+\.\d+\.\d+/);
});

test('an API key stays locked with storage-specific feedback when secure saving fails', async ({
  page,
}) => {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await gotoApp(page);
  await openAiSettings(page);

  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      if (this.name === 'splotch-secure') throw new Error('forced secure storage failure');
      return transaction.call(this, storeNames, mode, options);
    };
  });

  await submitAiKey(page, 'AIza-storage-failure');

  await expect(page.getByRole('alert')).toContainText('could not be saved securely');
  await expect(page.locator('#aiKeyInput')).toBeVisible();
  await expect(page.locator('#aiKeyActive')).toHaveCount(0);
});

test('only the current API key verification can persist across a close and reopen', async ({
  page,
}) => {
  let requestCount = 0;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route('**/api/verify-key', async (route) => {
    requestCount += 1;
    if (requestCount === 1) await firstResponse;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
      .catch(() => undefined);
  });
  await gotoApp(page);
  await openAiSettings(page);

  await submitAiKey(page, 'AIza-credential-AAAA');
  await expect.poll(() => requestCount).toBe(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#parentHelpModal')).toBeHidden();
  await openAiSettings(page);
  await submitAiKey(page, 'AIza-credential-BBBB');

  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
  releaseFirst();
  await page.waitForTimeout(300);
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await openAiSettings(page, '#aiKeyActive');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
});
