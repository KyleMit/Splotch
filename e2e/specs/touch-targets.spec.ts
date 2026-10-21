import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings, settledBox } from '../support/group-c.ts';

// Every control a child's hand or a parent's thumb has to hit keeps a 48px target on both axes, in
// the narrowest windows Settings is drawn for. The boxes are read once the dialog has landed, since
// it flies in and a box read on its way would be smaller than the place it settles in.

const TARGET_MIN_PX = 48;
const COMPACT_WINDOWS = [
  { name: 'portrait', width: 320, height: 740 },
  { name: 'landscape', width: 740, height: 320 },
] as const;
const PHONE = { width: 390, height: 844 };
const NARROW_PORTRAIT = COMPACT_WINDOWS[0];

async function expectTargetsMeetFloor(targets: Locator) {
  const count = await targets.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const target = targets.nth(index);
    const [box, label] = await Promise.all([
      settledBox(target),
      target.evaluate((node) => node.getAttribute('aria-label') ?? node.textContent ?? ''),
    ]);
    expect(box.width, `${label} width`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
    expect(box.height, `${label} height`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
  }
}

test('the hub switches sit on separate rows and stay keyboard operable', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  const night = settings.getByRole('switch', { name: 'Night Mode' });
  const sound = settings.getByRole('switch', { name: 'Sound' });
  await expectTargetsMeetFloor(settings.getByRole('switch'));
  const [nightBox, soundBox] = await Promise.all([settledBox(night), settledBox(sound)]);
  expect(nightBox.y + nightBox.height).toBeLessThan(soundBox.y);

  await night.focus();
  await page.keyboard.press('Space');
  await expect(night).toBeChecked();
  await expect(night).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(night).not.toBeChecked();
  await expect(night).toBeFocused();
});

for (const size of COMPACT_WINDOWS) {
  test(`Settings close and switches fit the compact ${size.name} window`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openDrawingScreen(page);
    const settings = await openSettings(page);

    await expectTargetsMeetFloor(
      settings.getByRole('button', { name: 'Close' }).or(settings.getByRole('switch'))
    );
    expect(await settings.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
  });
}

test('the portrait Appearance choices keep both target axes', async ({ page }) => {
  await page.setViewportSize({ width: NARROW_PORTRAIT.width, height: NARROW_PORTRAIT.height });
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^Appearance/ }).click();
  const appearance = page.getByRole('dialog', { name: 'Appearance' });
  await expect(appearance.getByRole('radio', { name: 'Dark' })).toBeVisible();

  await expectTargetsMeetFloor(appearance.getByRole('radio'));
});
