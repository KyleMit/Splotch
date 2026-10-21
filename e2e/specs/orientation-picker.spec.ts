import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { enterFullscreen, exitFullscreen, openSettings } from '../support/group-c.ts';

// The Orientation picker renders only where the browser can turn the screen: a coarse primary
// pointer, which touch emulation supplies the way a browser's mobile-device mode does, in a state
// Chromium honours a lock in, which fullscreen supplies (platform/deviceOrientation.web.ts). Every
// layout case below runs in both; the absent case at the end runs in neither.

test.use({ hasTouch: true });

// Portrait phone widths across the device range, plus the pair whose tracks land on either side of
// the picker's stacking width: the portrait shell spends 104px of the viewport on gutters and
// padding, so 433px and 434px give 329px and 330px tracks.
const PORTRAIT_WIDTHS_PX = [360, 375, 393, 412, 430, 433, 434];
const NARROWEST_STACKED_WIDTH_PX = 433;
const WIDEST_ROW_WIDTH_PX = 434;
const PORTRAIT_HEIGHT_PX = 852;
const COMPACT_VIEWPORT = { width: 667, height: 375 };
const OPTION_LABELS = ['Portrait', 'Landscape', 'Auto'];

async function openOrientationPicker(page: Page, width: number): Promise<Locator> {
  await exitFullscreen(page);
  await page.setViewportSize({ width, height: PORTRAIT_HEIGHT_PX });
  await openDrawingScreen(page);
  await enterFullscreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^Appearance/ }).click();
  return page.getByRole('radiogroup', { name: 'Orientation' });
}

// The options sit side by side until the track has been measured, so a reading taken at once can
// predate the layout the width calls for; each case waits for the direction it expects.
async function expectDirection(picker: Locator, direction: 'row' | 'column') {
  await expect
    .poll(async () => (await optionLayout(picker)).map((option) => option.direction))
    .toEqual(Array(OPTION_LABELS.length).fill(direction));
}

async function optionLayout(picker: Locator) {
  return picker.getByRole('radio').evaluateAll((options) =>
    options.map((option) => ({
      label: option.textContent?.trim(),
      clipped: option.scrollWidth > option.clientWidth || option.scrollHeight > option.clientHeight,
      direction: getComputedStyle(option).flexDirection,
    }))
  );
}

for (const width of PORTRAIT_WIDTHS_PX) {
  test(`every Orientation label fits a ${width}px portrait phone`, async ({ page }) => {
    const picker = await openOrientationPicker(page, width);
    await expect(picker).toBeVisible();
    // One layout for the whole track: a mixed row would put icons at two heights.
    await expectDirection(picker, width <= NARROWEST_STACKED_WIDTH_PX ? 'column' : 'row');
    const layout = await optionLayout(picker);

    expect(layout.map(({ label }) => label)).toEqual(OPTION_LABELS);
    expect(layout.filter(({ clipped }) => clipped)).toEqual([]);
  });
}

test('the Orientation picker stacks only when its track is too narrow', async ({ page }) => {
  const narrow = await openOrientationPicker(page, NARROWEST_STACKED_WIDTH_PX);
  await expect(narrow).toBeVisible();
  await expectDirection(narrow, 'column');

  const wide = await openOrientationPicker(page, WIDEST_ROW_WIDTH_PX);
  await expect(wide).toBeVisible();
  await expectDirection(wide, 'row');
});

test('the tablet pane keeps each icon beside its label', async ({ page }) => {
  await openDrawingScreen(page);
  await enterFullscreen(page);
  await openSettings(page);
  const picker = page.getByRole('radiogroup', { name: 'Orientation' });
  await picker.scrollIntoViewIfNeeded();

  await expectDirection(picker, 'row');
  expect((await optionLayout(picker)).filter(({ clipped }) => clipped)).toEqual([]);
});

test('the compact Orientation picker fills its track and stacks each icon over its label', async ({
  page,
}) => {
  await page.setViewportSize(COMPACT_VIEWPORT);
  await openDrawingScreen(page);
  await enterFullscreen(page);
  await openSettings(page);
  const picker = page.getByRole('radiogroup', { name: 'Orientation' });
  await expect(picker).toBeVisible();

  const [trackBox, pickerBox] = await Promise.all([
    page.getByTestId('orientation-picker').boundingBox(),
    picker.boundingBox(),
  ]);
  expect(pickerBox?.width).toBe(trackBox?.width);
  await expectDirection(picker, 'column');
  expect((await optionLayout(picker)).filter(({ clipped }) => clipped)).toEqual([]);
});

// Chromium rejects lock() in a plain tab, so a picker here would take a choice and never turn
// anything. Theme proves the section rendered, so the absence is the gate and not a race.
test.describe('a plain browser tab', () => {
  test.use({ hasTouch: false });

  test('offers no Orientation picker', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: PORTRAIT_HEIGHT_PX });
    await openDrawingScreen(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /^Appearance/ }).click();

    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Orientation' })).toHaveCount(0);
  });
});

// On the web Auto maps to unlock(), which defers to the device's own rotation setting, and nothing
// reports whether that setting is on, so the picker states the dependency instead of guessing.
test('the web picker says Auto follows the device rotation setting', async ({ page }) => {
  const picker = await openOrientationPicker(page, 393);

  await expect(picker).toBeVisible();
  await expect(page.getByText("Auto follows your device's rotation setting.")).toBeVisible();
});
