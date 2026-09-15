import { expect, test } from '@playwright/test';

import { draw, firstOpaquePixel, gotoApp } from './helpers';
import { openSettingsSection } from './flows-harness';

test('Ctrl/Cmd+Z edits report text without undoing the drawing behind the dialog', async ({
  page,
}) => {
  await gotoApp(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await openSettingsSection(page, 'Feedback', '#reportMessage');
  const message = page.locator('#reportMessage');
  await message.fill('The brush is');
  await message.pressSequentially(' missing');
  await expect(message).toHaveValue('The brush is missing');

  await message.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');

  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await expect(message).toHaveValue('The brush is');
});
