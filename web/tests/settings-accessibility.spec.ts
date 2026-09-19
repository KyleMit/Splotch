import { expect, test } from '@playwright/test';

import {
  gotoApp,
  headingOffsetFromPaneTop,
  openHubSection,
  openSettingsModal,
  SECTION_LANDED_MAX_PX,
} from './helpers';
import { solveParentalGate } from './flows-harness';

// The design system's floor for anything interactive.
const MIN_TAP_TARGET_PX = 44;

// The Accessibility section (issue #2091): one place a parent finds by name when
// their child needs something different. It carries the Button Size slider —
// the same stored scale the Tool Drawer section edits — and cross-links to the
// controls other sections own, through the deep link every other surface uses,
// so a link lands the right way in either shell.

test('Accessibility drills into the linked sections from the phone hub', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  await openSettingsModal(page);

  await openHubSection(page, 'accessibility', '#accessibilityButtonScaleLabel');
  await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible();

  await page.getByRole('button', { name: 'Drawing Tools' }).click();
  await expect(page.getByRole('heading', { name: 'Tool Drawer' })).toBeVisible();
  await expect(page.locator('#toolDrawerToggle')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await openHubSection(page, 'accessibility', '#accessibilitySoundLink');
  // The whole card is the tap target, help line included — a tap on the
  // sentence under the name goes where the name goes.
  const soundLink = page.locator('#accessibilitySoundLink');
  expect((await soundLink.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  await soundLink.locator('.section-link-help').click();
  await expect(page.getByRole('heading', { name: 'Sound', exact: true })).toBeVisible();
  await expect(page.locator('#soundToggle')).toBeVisible();
});

test('Accessibility links scroll the wide pane to the linked section, every time', async ({
  page,
}) => {
  await gotoApp(page);
  await openSettingsModal(page);
  const nav = page.locator('.settings-nav');

  await nav.getByRole('button', { name: 'Accessibility' }).click();
  await expect(page.locator('#accessibilityDrawingToolsLink')).toBeInViewport();

  await page.locator('#accessibilityDrawingToolsLink').click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'controls'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  await expect(nav.getByRole('button', { name: 'Tool Drawer' })).toHaveClass(/active/);

  // The landing is counted, not compared: scrolling back and tapping the same
  // link again still scrolls, even though the landed-on section has not changed.
  await nav.getByRole('button', { name: 'Accessibility' }).click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'accessibility'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  await page.locator('#accessibilityDrawingToolsLink').click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'controls'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);

  await nav.getByRole('button', { name: 'Accessibility' }).click();
  await page.locator('#accessibilitySoundLink').click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'sound'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  await expect(nav.getByRole('button', { name: 'Sound' })).toHaveClass(/active/);
});

test('both Button Size sliders edit the one stored scale', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Accessibility' }).click();

  const accessibilitySlider = page.locator(
    '[aria-labelledby="accessibilityButtonScaleLabel"][role="slider"]'
  );
  const toolDrawerSlider = page.locator(
    '[aria-labelledby="actionButtonScaleLabel"][role="slider"]'
  );
  await expect(accessibilitySlider).toBeInViewport();
  const before = Number(await toolDrawerSlider.getAttribute('aria-valuenow'));

  await accessibilitySlider.focus();
  await page.keyboard.press('ArrowLeft');

  await expect(toolDrawerSlider).toHaveAttribute('aria-valuenow', String(before - 1));
  await expect(accessibilitySlider).toHaveAttribute('aria-valuenow', String(before - 1));
});

test('a cross-link keeps the Parent Center unlock earned on this open', async ({ page }) => {
  // The lock resets on the open edge, never on a landing inside one visit: a
  // parent who solved the challenge and then followed a cross-link is still
  // the parent who solved it.
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  const nav = settings.locator('.settings-nav');
  await nav.getByRole('button', { name: 'Parent Center' }).click();
  await expect(page.locator('#parentalGate')).toBeVisible();
  await solveParentalGate(page);
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });

  await nav.getByRole('button', { name: 'Accessibility' }).click();
  await page.locator('#accessibilitySoundLink').click();
  await expect
    .poll(() => headingOffsetFromPaneTop(page, 'sound'))
    .toBeLessThan(SECTION_LANDED_MAX_PX);

  await expect(settings.getByRole('button', { name: 'Unlock these settings' })).toHaveCount(0);
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeAttached();
});
