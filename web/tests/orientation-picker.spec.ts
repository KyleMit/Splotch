import { expect, test, type Locator, type Page } from '@playwright/test';

import { gotoApp, openSettingsModal } from './helpers';

// The picker renders only where the browser can actually turn the screen
// (supportsOrientationLock), which on the web needs a coarse primary pointer.
// Touch emulation supplies one, the same way a browser's mobile-device mode
// does — and every viewport below is a phone or tablet, so it is also the
// honest input for them.
test.use({ hasTouch: true });

// Portrait phone widths across the device range, plus the pair of widths whose
// tracks land on either side of OrientationPicker's stacking threshold (the
// portrait shell spends 104px of the viewport on gutters and padding, so 433px
// and 434px give 329px and 330px tracks).
const PORTRAIT_WIDTHS_PX = [360, 375, 393, 412, 430, 433, 434];
const PORTRAIT_HEIGHT_PX = 852;

async function openPortraitOrientationPicker(page: Page, width: number) {
  await page.setViewportSize({ width, height: PORTRAIT_HEIGHT_PX });
  await gotoApp(page);
  await openSettingsModal(page);
  await page.getByRole('button', { name: 'Appearance' }).click();
  return page.getByRole('radiogroup', { name: 'Orientation' });
}

async function optionLayout(picker: Locator) {
  return picker.locator('.option').evaluateAll((options) =>
    options.map((option) => ({
      label: option.textContent?.trim(),
      clipped: option.scrollWidth > option.clientWidth || option.scrollHeight > option.clientHeight,
      direction: getComputedStyle(option).flexDirection,
    }))
  );
}

for (const width of PORTRAIT_WIDTHS_PX) {
  test(`every Orientation label fits a ${width}px portrait phone`, async ({ page }) => {
    const picker = await openPortraitOrientationPicker(page, width);
    const layout = await optionLayout(picker);

    expect(layout.map(({ label }) => label)).toEqual(['Portrait', 'Landscape', 'Auto']);
    expect(layout.filter(({ clipped }) => clipped)).toEqual([]);
    // One layout for the whole track: a mixed row would put icons at two heights.
    expect(new Set(layout.map(({ direction }) => direction)).size).toBe(1);
  });
}

test('the Orientation picker stacks only when its track is too narrow', async ({ page }) => {
  const narrow = await openPortraitOrientationPicker(page, 433);
  expect((await optionLayout(narrow))[0].direction).toBe('column');

  const wide = await openPortraitOrientationPicker(page, 434);
  expect((await optionLayout(wide))[0].direction).toBe('row');
});

test('the tablet pane keeps each icon beside its label', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);
  const picker = page.getByRole('radiogroup', { name: 'Orientation' });
  await picker.scrollIntoViewIfNeeded();

  const layout = await optionLayout(picker);
  expect(layout.every(({ direction }) => direction === 'row')).toBe(true);
  expect(layout.filter(({ clipped }) => clipped)).toEqual([]);
});

test('the compact Orientation picker fills its quick-toggle cell', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await gotoApp(page);
  await openSettingsModal(page);

  const cell = page.locator('.quick-toggles > .orientation-cell');
  const picker = cell.getByRole('radiogroup', { name: 'Orientation' });
  const [cellBox, pickerBox] = await Promise.all([cell.boundingBox(), picker.boundingBox()]);
  expect(pickerBox).toEqual(cellBox);

  const layout = await optionLayout(picker);
  expect(layout.every(({ direction }) => direction === 'column')).toBe(true);
  expect(layout.filter(({ clipped }) => clipped)).toEqual([]);
});
