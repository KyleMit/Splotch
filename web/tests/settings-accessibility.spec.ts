import { expect, test } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// The Accessibility section (issue #2091): one place a parent finds by name when
// their child needs something different. It is the Button Size slider's only
// home.

test('Accessibility drills in from the phone hub with the Button Size slider', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  await openSettingsModal(page);

  await openHubSection(page, 'accessibility', '#accessibilityButtonScaleLabel');
  await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible();
  await expect(page.getByText('Bigger buttons help small or unsteady hands')).toBeVisible();
});

test('the Button Size slider lives in Accessibility alone', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Accessibility' }).click();

  const slider = page.locator('[aria-labelledby="accessibilityButtonScaleLabel"][role="slider"]');
  await expect(slider).toBeInViewport();
  await expect(page.locator('.button-size-setting')).toHaveCount(1);

  const before = Number(await slider.getAttribute('aria-valuenow'));
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', String(before - 1));
});
