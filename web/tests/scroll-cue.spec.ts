import { expect, test, type Locator, type Page } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// ScrollCue's contract on every surface it was applied to beyond the picker
// (which flows-coloring-scroll-cue.spec.ts covers): the fade is a reading of
// live scroll state, not decoration. It is absent while the content fits,
// present while there is more of it below the fold, and absent again once the
// end is on screen — on a bounded pane inside a dialog and on a whole page
// scrolled by the document alike.

// A phone tall enough to read on and far too short for the four sign-up steps.
const PHONE_PORTRAIT = { width: 390, height: 720 };
// Taller than the whole sign-up page, so the document never scrolls.
const TALLER_THAN_THE_PAGE = { width: 1100, height: 3200 };

// The compact shell exists for a landscape phone; these are the two heights
// either side of the point where its 2x2 of toggles stops fitting. Both are
// under the tablet-class floor that elects the shell in the first place.
const CROPPED_LANDSCAPE = { width: 740, height: 250 };
const ROOMY_LANDSCAPE = { width: 740, height: 320 };

// The narrowest phone in the responsive page inventory. Its portrait Settings
// shell is one scroller — the hub list, or a section drilled into — and the
// eleven-section list runs well past the card there while a short section sits
// in it whole, so both states are reachable on the one real device.
const PHONE_PORTRAIT_SETTINGS = { width: 375, height: 812 };

// A landscape tablet, which elects the two-column shell. There is no "it fits"
// counterpart for that pane: it stacks every section in one scroll under a card
// capped at 85vh, so it overflows at any viewport — the two surfaces above are
// where the fits state is pinned.
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

function cueOpacity(cue: Locator) {
  return cue.evaluate((node) => Number(getComputedStyle(node).opacity));
}

function overflows(scroller: Locator) {
  return scroller.evaluate((node) => node.scrollHeight > node.clientHeight);
}

function scrollToEnd(scroller: Locator) {
  return scroller.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
}

async function openCompactSettings(page: Page) {
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await expect(modal).toHaveClass(/compact/);
  return page.locator('.quick-toggles-scroll');
}

test.describe('the sign-up page cues its own document scroll', () => {
  test.use({ viewport: PHONE_PORTRAIT });

  test('fades the steps that run past the fold, then stands down at the foot', async ({ page }) => {
    await page.goto('/android-beta');
    await expect(page.getByRole('heading', { name: 'Join the Android beta' })).toBeVisible();

    const cue = page.locator('.scroll-cue');
    await expect.poll(() => cueOpacity(cue)).toBe(1);

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
    await expect.poll(() => cueOpacity(cue)).toBe(0);

    // Scrolling back off the end re-arms it, so the cue tracks the reading
    // position rather than latching once.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect.poll(() => cueOpacity(cue)).toBe(1);
  });
});

test.describe('the sign-up page on a viewport that holds all of it', () => {
  test.use({ viewport: TALLER_THAN_THE_PAGE });

  test('leaves an unscrolled page uncued', async ({ page }) => {
    await page.goto('/android-beta');
    await expect(page.getByRole('heading', { name: 'Join the Android beta' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollHeight <= doc.clientHeight;
        })
      )
      .toBe(true);
    await expect.poll(() => cueOpacity(page.locator('.scroll-cue'))).toBe(0);
  });
});

test.describe('the landscape-phone settings shell', () => {
  test.use({ viewport: CROPPED_LANDSCAPE });

  test('cues the toggles it crops, then stands down at the end of them', async ({ page }) => {
    const scroller = await openCompactSettings(page);
    await expect.poll(() => overflows(scroller)).toBe(true);

    const cue = scroller.locator('.scroll-cue');
    await expect.poll(() => cueOpacity(cue)).toBe(1);

    await scrollToEnd(scroller);
    await expect.poll(() => cueOpacity(cue)).toBe(0);
  });
});

test.describe('the landscape-phone settings shell with room for every toggle', () => {
  test.use({ viewport: ROOMY_LANDSCAPE });

  test('leaves a pane that fits uncued', async ({ page }) => {
    const scroller = await openCompactSettings(page);
    await expect.poll(() => overflows(scroller)).toBe(false);
    await expect.poll(() => cueOpacity(scroller.locator('.scroll-cue'))).toBe(0);
  });
});

test.describe('the portrait-phone settings shell', () => {
  test.use({ viewport: PHONE_PORTRAIT_SETTINGS });

  async function openPhoneSettings(page: Page) {
    await gotoApp(page);
    const modal = await openSettingsModal(page);
    await expect(modal).not.toHaveClass(/wide|compact/);
    return modal;
  }

  test('cues the hub sections below the card, then stands down at the last one', async ({
    page,
  }) => {
    const modal = await openPhoneSettings(page);
    const scroller = modal.locator('.settings-scroll');
    await expect.poll(() => overflows(scroller)).toBe(true);

    const cue = scroller.locator('.scroll-cue');
    await expect.poll(() => cueOpacity(cue)).toBe(1);

    await scrollToEnd(scroller);
    await expect.poll(() => cueOpacity(cue)).toBe(0);

    await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
    await expect.poll(() => cueOpacity(cue)).toBe(1);
  });

  // The drilled-in section is the shell's other scroller, and Sound is the one
  // that fits on this phone whole — so it pins the state the hub can't reach.
  test('leaves a drilled-in section that fits uncued', async ({ page }) => {
    const modal = await openPhoneSettings(page);
    await openHubSection(page, 'sound', '#soundToggle');

    const scroller = modal.locator('.settings-scroll');
    await expect.poll(() => overflows(scroller)).toBe(false);
    await expect.poll(() => cueOpacity(scroller.locator('.scroll-cue'))).toBe(0);
  });
});

test.describe('the two-column settings shell', () => {
  test.use({ viewport: TABLET_LANDSCAPE });

  test('cues the content pane and stands down at the last section', async ({ page }) => {
    await gotoApp(page);
    const modal = await openSettingsModal(page);
    await expect(modal).toHaveClass(/wide/);

    const pane = modal.locator('.settings-pane');
    const cue = pane.locator('.scroll-cue');
    await expect.poll(() => cueOpacity(cue)).toBe(1);

    await scrollToEnd(pane);
    await expect.poll(() => cueOpacity(cue)).toBe(0);

    await pane.evaluate((node) => node.scrollTo({ top: 0 }));
    await expect.poll(() => cueOpacity(cue)).toBe(1);
  });

  // The sidebar carries its own two-ended edge shades, painted as `local` and
  // `scroll` backgrounds; a ScrollCue there would stack a second fade on the
  // one edge that already has one.
  test('leaves the sidebar to the edge shades it already paints', async ({ page }) => {
    await gotoApp(page);
    const modal = await openSettingsModal(page);
    await expect(modal.locator('.settings-nav .scroll-cue')).toHaveCount(0);
  });
});
