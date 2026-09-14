import { expect, test } from '@playwright/test';

import { policyPicker } from './flows-harness';
import { gotoApp, openSettingsModal } from './helpers';

test('a check armed in one tab guards the same action in a tab already open', async ({ page }) => {
  await page.route('**/api/report', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );
  await gotoApp(page);

  const parentTab = await page.context().newPage();
  await gotoApp(parentTab);
  const parentSettings = await openSettingsModal(parentTab);
  await parentSettings.getByRole('button', { name: 'Parent Center' }).click();
  const feedbackPolicy = policyPicker(parentSettings, 'Sending feedback');
  await feedbackPolicy.getByRole('radio', { name: 'Every time' }).click();
  await expect(feedbackPolicy.getByRole('radio', { name: 'Every time' })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Feedback' }).click();
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.locator('#parentalGate')).toBeVisible();
});
