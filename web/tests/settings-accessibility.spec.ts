import { expect, test } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// The Accessibility section (issue #2091): one place a parent finds by name when
// their child needs something different. It carries the Button Size slider —
// the same stored scale the Tool Drawer section edits.

test('Accessibility drills in from the phone hub with the Button Size slider', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  await openSettingsModal(page);

  await openHubSection(page, 'accessibility', '#accessibilityButtonScaleLabel');
  await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible();
  await expect(page.getByText('Bigger buttons help small or unsteady hands')).toBeVisible();
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
