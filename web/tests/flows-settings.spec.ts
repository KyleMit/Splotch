import { expect, test, type Page } from '@playwright/test';

import { TABLET_MIN_SIDE_PX } from '../src/lib/breakpoints';
import { AI_ACCESS_TOKEN_PARAM } from '../src/lib/inviteLink';

import {
  activeNavRowInsideColumn,
  gotoApp,
  headingOffsetFromPaneTop,
  openSettingsModal,
  retryOpen,
  SECTION_LANDED_MAX_PX,
} from './helpers';

// Settings is a section list — a table-of-contents entry on tablet/desktop, a
// hub row on phone. Either way the control carries the section label; activating
// it brings the section's content into view (a scroll on the wide shell, a
// drill-in on phone).
//
// The wide shell mounts every section at once, so the field a caller works on is
// present before anything is clicked; the click is what scrolls it into view,
// and `toBeInViewport` is what proves that happened. Retried rather than clicked
// once: the dialog itself mounts on first open (ADR-0049) and flies in, so a
// click lands on markup that is still arriving — the same hazard
// openSettingsModal rides out.
async function openSettingsSection(page: Page, label: string, expectedField: string) {
  await openSettingsModal(page);
  const field = page.locator(expectedField);
  const entry = page.locator('.settings-nav').getByRole('button', { name: label, exact: true });
  // Clicked on every attempt rather than gated on the field being present: in
  // this shell it always is, and the click is what scrolls it into view.
  await expect(async () => {
    await entry.click({ timeout: 2000 });
    await expect(field).toBeInViewport({ timeout: 2000 });
  }).toPass({ timeout: 10_000 });
}

async function openAiSettings(page: Page, expectedField = '#aiKeyInput') {
  await openSettingsSection(page, 'AI Art', '#aiImageToggle');
  const toggle = page.locator('#aiImageToggle');
  if ((await toggle.getAttribute('aria-checked')) === 'false') await toggle.click();
  const field = page.locator(expectedField);
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeInViewport();
}

async function submitAiKey(page: Page, value: string) {
  const save = page.getByRole('button', { name: 'Save' });
  await expect(async () => {
    await page.locator('#aiKeyInput').fill(value);
    await expect(save).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
  await save.click();
}

function scrollPaneToTop(page: Page) {
  return page.locator('.settings-pane').evaluate((el) => el.scrollTo({ top: 0 }));
}

test('the Settings table of contents drives one continuous pane (tablet layout)', async ({
  page,
}) => {
  await gotoApp(page);

  const modal = await openSettingsModal(page);
  // The default Playwright viewport is desktop-width, so the two-pane shell with
  // a persistent sidebar renders and the pane opens at the first section.
  await expect(modal).toHaveClass(/wide/);
  // Scoped to the nav: the short section labels also read as ordinary words
  // inside the sections they point at ("Install Splotch" in the Setup section).
  const nav = page.locator('.settings-nav');
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveClass(/active/);
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await expect(
    nav.getByRole('button', { name: 'Parent Center' }).locator('[data-icon="parent-center"]')
  ).toHaveClass(/icon-color/);

  // Every section is mounted at once — the nav moves the scroll position, it
  // does not choose what is rendered. Counted off the nav so neither side
  // restates how many sections there are.
  await expect(page.locator('.settings-section')).toHaveCount(
    await nav.locator('.toc-row').count()
  );

  // Clicking an entry scrolls its heading to just below the pane's top edge and
  // moves the highlight — while the first section stays mounted behind it.
  await nav.getByRole('button', { name: 'Tool Drawer' }).click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'controls'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  expect(await headingOffsetFromPaneTop(page, 'controls')).toBeGreaterThanOrEqual(0);
  await expect(nav.getByRole('button', { name: 'Tool Drawer' })).toHaveClass(/active/);
  await expect(nav.getByRole('button', { name: 'Appearance' })).not.toHaveAttribute('aria-current');
  // In viewport, not merely visible: every section is mounted at all times, and
  // `toBeVisible` ignores the pane's scroll clipping — it would pass without the
  // scroll ever happening.
  await expect(page.locator('#advancedControlsToggle')).toBeInViewport();
  await expect(page.locator('#themeOption-light')).toHaveCount(1);

  // The Setup section keeps its own <details> accordions inside the pane.
  await nav.getByRole('button', { name: 'Install' }).click();
  const setupDetails = page.locator('.help-section').first();
  await expect(setupDetails.locator('summary')).toBeInViewport();

  // About holds the identity block — the mascot renders in full color.
  await nav.getByRole('button', { name: 'About' }).click();
  const aboutMascot = page.locator('.about-brand [data-icon="splotchy"]');
  const aboutMascotImage = aboutMascot.locator('img');
  await expect(aboutMascotImage).toBeInViewport();
  await expect
    .poll(() => aboutMascotImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(aboutMascot).toHaveClass(/icon-color/);

  // Scrolling the pane back by hand moves the highlight with it: the sidebar
  // tracks the reading position rather than the last thing clicked.
  await scrollPaneToTop(page);
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveClass(/active/);
  await expect(nav.getByRole('button', { name: 'Tool Drawer' })).not.toHaveClass(/active/);
});

// Whether every option in a picker encloses the hidden radio it is the skin for
// — the geometric statement of "the option is the input's containing block".
function optionsContainTheirInputs(page: Page, picker: string) {
  return page.locator(picker).evaluate((track) =>
    [...track.querySelectorAll('label.option')].every((option) => {
      const input = option.querySelector('input');
      if (!input) return false;
      const box = option.getBoundingClientRect();
      const hidden = input.getBoundingClientRect();
      return (
        hidden.top >= box.top &&
        hidden.left >= box.left &&
        hidden.bottom <= box.bottom &&
        hidden.right <= box.right
      );
    })
  );
}

test('choosing a feedback kind leaves the settings panel where it was', async ({ page }) => {
  // A picker rendered as real radios hides its inputs off-view. Left
  // unpositioned, an option is not their containing block, so an input's static
  // position resolves against a distant ancestor — a full pane scrollTop away
  // from the option a parent just tapped, deep in this shell's one long pane.
  // Focusing it on click then scrolled it into view and took the whole card with
  // it, leaving the settings modal blank.
  await gotoApp(page);
  await openSettingsSection(page, 'Feedback', '.report-kind');

  const nav = page.locator('.settings-nav');
  const idea = page.locator('.report-kind label.option').filter({ hasText: 'I have an idea' });
  await idea.click();

  await expect(page.getByRole('radio', { name: 'I have an idea' })).toBeChecked();
  await expect(page.getByText("What's your idea?")).toBeVisible();
  // The panel and the picker the parent tapped are both still on screen — the
  // one thing the displacement destroyed.
  await expect(nav).toBeInViewport();
  await expect(page.locator('.report-kind')).toBeInViewport();

  // And the invariant underneath, which the two assertions above only observe
  // through this shell's scroll depth: every hidden input sits inside the option
  // it belongs to, wherever the picker is rendered.
  expect(await optionsContainTheirInputs(page, '.report-kind')).toBe(true);
});

test('the theme picker is one tab stop and the arrow keys move the selection', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const light = page.locator('#themeOption-light');
  const dark = page.locator('#themeOption-dark');
  const system = page.locator('#themeOption-system');

  // APG radio-group pattern: the checked option is the group's only tab stop.
  await expect(system).toHaveAttribute('aria-checked', 'true');
  await expect(system).toHaveAttribute('tabindex', '0');
  await expect(light).toHaveAttribute('tabindex', '-1');
  await expect(dark).toHaveAttribute('tabindex', '-1');

  // Arrows move focus and selection together, wrapping past either end —
  // System is the last option, so ArrowRight lands on Light.
  await system.press('ArrowRight');
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await expect(light).toBeFocused();
  await expect(light).toHaveAttribute('tabindex', '0');
  await expect(system).toHaveAttribute('tabindex', '-1');

  await light.press('ArrowLeft');
  await expect(system).toHaveAttribute('aria-checked', 'true');
  await expect(system).toBeFocused();

  // The vertical pair works the same, for screen-reader users navigating by
  // the other axis.
  await system.press('ArrowDown');
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await light.press('ArrowUp');
  await expect(system).toHaveAttribute('aria-checked', 'true');
});

test('the shortest sidebar viewport can still reach every section', async ({ page }) => {
  // One pixel shorter and the compact shell takes over, so this is the least
  // vertical room the sidebar column ever gets — and the section icons are
  // sized such that nine rows no longer fit inside it.
  await page.setViewportSize({ width: 1024, height: TABLET_MIN_SIDE_PX });
  await gotoApp(page);
  await openSettingsModal(page);

  const nav = page.locator('.settings-nav');
  const column = await nav.evaluate((el) => ({
    overflowing: el.scrollHeight > el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  // Reachable means the rows either all fit or the parent can scroll to the
  // ones that don't. A clipping `overflow: hidden` column hides the tail with
  // no gesture that brings it back — and Playwright's own scroll-into-view
  // would sail past that, so the check is on the computed overflow.
  expect(column.overflowing ? column.overflowY : 'auto').toMatch(/auto|scroll/);

  // The last entry jumps for real once scrolled to.
  await nav.getByRole('button').last().click();
  await expect(nav.locator('.toc-row').last()).toHaveClass(/active/);
  await expect(page.locator('.about-brand')).toBeInViewport();
});

test('reopening a scrolled sidebar lands back on the active row', async ({ page }) => {
  // The dialog is closed, not unmounted, so the nav and the pane both keep the
  // scroll offsets the parent left them at while the highlight resets to the
  // first section — which would reopen with the selected row scrolled off the
  // top and no highlight in view, over a pane still showing the last section.
  await page.setViewportSize({ width: 1024, height: TABLET_MIN_SIDE_PX });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  const nav = page.locator('.settings-nav');
  const pane = page.locator('.settings-pane');

  await retryOpen(nav.locator('[data-section="about"].active'), () =>
    nav.locator('[data-section="about"]').click({ timeout: 3000 })
  );
  expect(await nav.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(async () => {
    await page.locator('#settingsButton').click({ timeout: 1000 });
    await expect(page.locator('.settings-nav')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 5000 });

  // Reopening returns the pane to the top, so the first row is the highlighted
  // one and it has to be in view — read off the nav rather than restating which
  // section that is.
  await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(nav.locator('.toc-row').first()).toHaveClass(/active/);
  await expect.poll(() => activeNavRowInsideColumn(page)).toBe(true);
});

test("What's New formats the current release date without runtime locale initialization", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
      apply() {
        throw new Error('runtime Intl date formatting is disabled');
      },
      construct() {
        throw new Error('runtime Intl date formatting is disabled');
      },
    });
    Date.prototype.toLocaleDateString = () => {
      throw new Error('runtime locale formatting is disabled');
    };
    Date.prototype.toLocaleString = () => {
      throw new Error('runtime locale formatting is disabled');
    };
  });
  await gotoApp(page);

  await openSettingsModal(page);
  await page.getByRole('button', { name: "What's New" }).click();

  const dates = page.locator('.whats-new-date');
  await expect(dates).toHaveCount(1);
  for (const date of await dates.all()) {
    await expect(date).toHaveText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  }
});

test("What's New opens the internal changelog without a parental gate", async ({ page }) => {
  await gotoApp(page, '/', { gates: 'always' });

  await openSettingsModal(page);
  await retryOpen(page.getByRole('link', { name: 'See all releases' }), () =>
    page.getByRole('button', { name: "What's New" }).click({ timeout: 3000 })
  );
  await page.getByRole('link', { name: 'See all releases' }).click();

  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole('heading', { name: 'Changelog', level: 1 })).toBeVisible();
  await expect(page.locator('#parentalGate')).not.toBeVisible();
});

test('About opens the bundled privacy policy without a parental gate', async ({ page }) => {
  await gotoApp(page, '/', { gates: 'always' });

  await openSettingsModal(page);
  await retryOpen(page.getByRole('link', { name: 'Privacy Policy' }), () =>
    page.getByRole('button', { name: 'About' }).click({ timeout: 3000 })
  );
  await page.getByRole('link', { name: 'Privacy Policy' }).click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(page.locator('#parentalGate')).not.toBeVisible();
});

test('setting groups space their cards without affecting the compact grid', async ({ page }) => {
  await gotoApp(page, `/?${AI_ACCESS_TOKEN_PARAM}=test-access-code`);

  const modal = await openSettingsModal(page);
  // Scoped to one section: the wide pane stacks every section at once, so an
  // unscoped selector would sweep up the whole modal's cards.
  const directCards = page.locator(
    '.settings-section[data-section="appearance"] .setting-group > .setting'
  );
  await expect(directCards).toHaveCount(3);
  await expect(directCards.nth(1)).toHaveCSS('margin-top', '6px');
  await expect(directCards.nth(2)).toHaveCSS('margin-top', '6px');

  await modal.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  await expect(page.locator('#aiCodeActive')).toBeInViewport();
  const aiPrimaryCards = page.locator(
    '.settings-section[data-section="ai"] .setting-group:has(#aiImageToggle) > .setting'
  );
  await expect(aiPrimaryCards).toHaveCount(1);
  const aiFeatureCards = page.locator(
    '.settings-section[data-section="ai"] .setting-group:has(#aiCustomizationToggle) > .setting'
  );
  await expect(aiFeatureCards).toHaveCount(2);
  await expect(aiFeatureCards.nth(1)).toHaveCSS('margin-top', '6px');

  await page.setViewportSize({ width: 852, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  const quickToggleCells = page.locator('.quick-toggles > .setting');
  await expect(quickToggleCells).toHaveCount(4);
  await expect(quickToggleCells.nth(1)).toHaveCSS('margin-top', '0px');
  await expect(quickToggleCells.nth(2)).toHaveCSS('margin-top', '0px');
  await expect(quickToggleCells.nth(3)).toHaveCSS('margin-top', '0px');
});

async function openSettingsModalCompact(page: Page) {
  await page.setViewportSize({ width: 852, height: 390 });
  await gotoApp(page);
  return openSettingsModal(page);
}

// A landscape phone has the width of the tablet shell but almost none of its
// height, so the full section list is unusably cramped there. Settings
// collapses to a strip of quick toggles plus a pointer to portrait; a landscape
// tablet (height ≥ 600px, e.g. the default desktop viewport above) keeps the
// two-pane shell.
test('landscape phone renders compact quick toggles', async ({ page }) => {
  const modal = await openSettingsModalCompact(page);
  await expect(modal).toHaveClass(/compact/);

  // Quick toggles render instead of the hub list or the sidebar.
  await expect(page.locator('.hub-list')).toHaveCount(0);
  await expect(page.locator('.settings-nav')).toHaveCount(0);
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
  await openSettingsModalCompact(page);

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

test('quick-toggle changes persist into the full portrait Settings', async ({ page }) => {
  await openSettingsModalCompact(page);

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
  await page.getByRole('button', { name: 'Tool Drawer' }).click();
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'false');

  // The Appearance section shows the lock we set, now forced to portrait.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Appearance' }).click();
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

  const modal = await openSettingsModal(page);
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

  await submitAiKey(page, 'sk-storage-failure');

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

  await submitAiKey(page, 'sk-credential-AAAA');
  await expect.poll(() => requestCount).toBe(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openAiSettings(page);
  await submitAiKey(page, 'sk-credential-BBBB');

  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
  releaseFirst();
  await page.waitForTimeout(300);
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await openAiSettings(page, '#aiKeyActive');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
});

// Settings' ReportForm posts JSON to /api/report directly (no <form>, unlike
// /feedback's plain post) and sends `device` from its own `ensureDevice`-bound
// state rather than the hidden field ReportFields also renders — a binding
// that silently failed to propagate would strip device info from every
// Settings bug report with feedback.spec.ts (which never binds it) still
// green. Intercepted rather than posted for real: the report bucket is
// 5 requests/minute per IP and feedback.spec.ts already spends the one real
// submission that budget affords in a run.
test('Settings sends the collected device info with a bug report', async ({ page }) => {
  let reportBody: { device?: unknown } | undefined;
  await page.route('**/api/report', async (route) => {
    reportBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  await gotoApp(page);

  await openSettingsSection(page, 'Feedback', '#reportMessage');

  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('checkbox', { name: /Include device info/ }).check();
  // Same hidden field /feedback reads (ReportFields renders it for both
  // hosts): wait for the preview's collection to resolve before sending, so
  // the assertion below tells apart "never collected" from "collected but not
  // sent".
  const devicePayload = page.locator('input[name="device"]');
  await expect
    .poll(async () => JSON.parse((await devicePayload.inputValue()) || '{}').platform)
    .toBe('Web');

  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.getByText('Thanks for your feedback.')).toBeVisible();
  expect(reportBody?.device).toMatchObject({ platform: 'Web' });
});

test('reopening Settings mid-submit leaves the sent report to land', async ({ page }) => {
  // The counterpart of the AI-key case above, and deliberately its opposite:
  // verifying a key is idempotent so AiKeyManager aborts it, but this POST
  // files an issue, so closing and reopening must not cancel a report already
  // sent.
  const reportOutcomes: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/report')) {
      reportOutcomes.push(request.failure()?.errorText ?? 'unknown');
    }
  });
  page.on('requestfinished', (request) => {
    if (request.url().includes('/api/report')) reportOutcomes.push('finished');
  });

  let requestCount = 0;
  let releaseReport!: () => void;
  const heldReport = new Promise<void>((resolve) => {
    releaseReport = resolve;
  });
  await page.route('**/api/report', async (route) => {
    requestCount += 1;
    await heldReport;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
      .catch(() => undefined);
  });

  await gotoApp(page);
  await openSettingsSection(page, 'Feedback', '#reportMessage');
  await page.locator('#reportMessage').fill('The paint brush disappeared.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect.poll(() => requestCount).toBe(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openSettingsModal(page);

  // The server answers only now — after the reopen that used to abort it.
  releaseReport();
  await expect.poll(() => reportOutcomes).toEqual(['finished']);
});
