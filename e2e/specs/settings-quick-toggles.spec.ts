import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { enterFullscreen, exitFullscreen, openSettings, settledBox } from '../support/group-c.ts';

// A landscape phone has the width of the tablet shell and almost none of its height, so Settings
// collapses to a strip of quick toggles plus a pointer to portrait; a landscape tablet keeps the
// two-pane shell. The Orientation picker holds the device-varying last cell, and renders only where
// a lock would be honoured: a coarse pointer, supplied by touch emulation, in fullscreen.

const LANDSCAPE_PHONE = { width: 852, height: 390 };
const PORTRAIT_PHONE = { width: 390, height: 852 };
const TARGET_MIN_PX = 48;
const ORIENTATION = ['Portrait', 'Landscape', 'Auto'] as const;

const orientationOption = (page: Page, name: (typeof ORIENTATION)[number]) =>
  page.getByRole('radiogroup', { name: 'Orientation' }).getByRole('radio', { name, exact: true });

// Chromium will not resize a fullscreen window, so a case that changes the window leaves
// fullscreen, resizes, and re-enters it to restore the state the picker renders in.
async function resizeInFullscreen(page: Page, size: { width: number; height: number }) {
  await exitFullscreen(page);
  await page.setViewportSize(size);
  await enterFullscreen(page);
}

test.describe('Settings on a rotatable device', () => {
  test.use({ hasTouch: true });

  async function openCompactSettings(page: Page) {
    await page.setViewportSize(LANDSCAPE_PHONE);
    await openDrawingScreen(page);
    await enterFullscreen(page);
    return openSettings(page);
  }

  test('a landscape phone shows the quick toggles and the Orientation picker', async ({ page }) => {
    const settings = await openCompactSettings(page);

    await expect(settings.getByRole('switch', { name: 'Sound' })).toBeVisible();
    await expect(settings.getByRole('switch', { name: 'Night Mode' })).toBeVisible();
    await expect(settings.getByRole('switch', { name: 'Tool drawer' })).toBeVisible();
    await expect(settings.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
    for (const name of ORIENTATION) {
      const box = await settledBox(orientationOption(page, name));
      expect(box.width, `${name} width`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
    }
    await expect(settings.getByText('Switch to portrait for the full settings.')).toBeVisible();
  });

  test('the compact Orientation picker locks either side or releases to Auto', async ({ page }) => {
    await openCompactSettings(page);

    // A phone-sized screen defaults to a portrait lock, so Portrait starts selected.
    await expect(orientationOption(page, 'Portrait')).toBeChecked();

    await orientationOption(page, 'Landscape').click();
    await expect(orientationOption(page, 'Landscape')).toBeChecked();
    await expect(orientationOption(page, 'Portrait')).not.toBeChecked();

    // Auto is its own option, so tapping the selected side again keeps it locked.
    await orientationOption(page, 'Landscape').click();
    await expect(orientationOption(page, 'Landscape')).toBeChecked();

    await orientationOption(page, 'Auto').click();
    await expect(orientationOption(page, 'Auto')).toBeChecked();
    await expect(orientationOption(page, 'Landscape')).not.toBeChecked();
  });

  test('quick-toggle changes persist into the full portrait Settings', async ({ page }) => {
    const settings = await openCompactSettings(page);

    // A quick toggle drives the same persisted setting as the full section.
    const quickDrawer = settings.getByRole('switch', { name: 'Tool drawer' });
    await quickDrawer.click();
    await expect(quickDrawer).not.toBeChecked();
    // Set a landscape lock, away from the phone's portrait default, so the full shell below can
    // only show it if the quick picker persisted it.
    await orientationOption(page, 'Landscape').click();
    await expect(orientationOption(page, 'Landscape')).toBeChecked();

    // Rotating to portrait swaps in the phone hub live, where the Tool Drawer section reflects the
    // change made from the quick toggle.
    await resizeInFullscreen(page, PORTRAIT_PHONE);
    const hub = page.getByRole('dialog', { name: 'Settings' });
    await hub.getByRole('button', { name: /^Tool Drawer/ }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Tool Drawer' })
        .getByRole('switch', { name: 'Enable tool drawer' })
    ).not.toBeChecked();

    // The Appearance section's Orientation picker shows the lock that was set.
    await page.getByRole('button', { name: 'Back' }).click();
    await hub.getByRole('button', { name: /^Appearance/ }).click();
    await expect(orientationOption(page, 'Landscape')).toBeChecked();
  });
});

// The default context is a desktop browser: a fine pointer on a screen that cannot turn, so the
// picker would be a control the app can never honour. A window short enough to reach the compact
// shell, which a desktop window can be, shows the version in the cell the picker would hold.
test('a desktop browser offers no Orientation picker in either shell', async ({ page }) => {
  await openDrawingScreen(page);

  const settings = await openSettings(page);
  await expect(settings.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Orientation' })).toHaveCount(0);

  await page.setViewportSize(LANDSCAPE_PHONE);
  await expect(settings.getByRole('switch', { name: 'Night Mode' })).toBeVisible();
  await expect(settings.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Orientation' })).toHaveCount(0);
  await expect(settings.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
});
