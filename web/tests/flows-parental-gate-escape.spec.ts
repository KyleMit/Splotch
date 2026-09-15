import { expect, test } from '@playwright/test';

import { openParentalGate, solveParentalGate } from './flows-harness';
import { gotoApp, seedAiEnabled } from './helpers';

// Chromium's CloseWatcher makes a dialog's `cancel` non-cancelable once the
// previous preventDefault spent the page's user activation, and Escape itself
// grants none — so a second Escape closes the dialog natively.
test('the success card survives repeated Escape presses', async ({ page }) => {
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  const gate = await openParentalGate(page);
  await solveParentalGate(page);
  await expect(gate.getByText('Unlocked!')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await expect(page.locator('dialog.ai-prompt-modal')).toBeVisible({ timeout: 5000 });
});
