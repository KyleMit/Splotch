import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { settledBox } from '../support/group-c.ts';

// A phone held sideways has no room for the palette bar, so the colours fold into one Colors button
// that opens a flyout, and the tools line up in an L along the left and bottom edges. Real layout is
// what these read: the mounted tests of the same chrome stub the measurements.

const TOOL_SIZE_PX = 48;
const EDGE_GAP_PX = 8;
// Each tool above the bottom row sits one tool plus this gap above the next.
const TOOL_PITCH_PX = 58;
const BOTTOM_ROW_OFFSET_PX = 56;

// Two phones held sideways: the shortest the L-shape is drawn for, and a taller one.
const PHONE_HEIGHTS_PX = [328, 412];
const PHONE_WIDTH_PX = 906;
const PHONE = { width: PHONE_WIDTH_PX, height: PHONE_HEIGHTS_PX[0] };
const NARROW_PHONE = { width: 628, height: 368 };
const PORTRAIT_PHONE = { width: 412, height: 906 };
const LANDSCAPE_TABLET = { width: 1133, height: 744 };
// The room the flyout leaves the right-hand edge, so its last swatch is never cut off.
const FLYOUT_RIGHT_MARGIN_PX = 8;
// A short drag in the strip left of the tools, which the paper reclaims from the palette bar.
const LEFT_STRIP_STROKE = { from: { x: 30, y: 24 }, to: { x: 70, y: 40 } };
const TOUCH_MOVES = 6;

const colorsButton = (page: Page) => page.getByRole('button', { name: 'Colors', exact: true });
const flyout = (page: Page) => page.getByRole('group', { name: 'Colors', exact: true });

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The control is not laid out');
  return box;
}

async function openToolDrawer(page: Page) {
  await page.getByRole('button', { name: 'Expand controls' }).click();
  await expect(page.getByRole('button', { name: 'Collapse controls' })).toBeVisible();
  // The tools cascade in one after another, so the last one to settle is the undo button.
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
}

for (const height of PHONE_HEIGHTS_PX) {
  test(`the L-shaped tools fit a ${PHONE_WIDTH_PX} by ${height} phone and leave the paper full width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE_WIDTH_PX, height });
    const { paper } = await openDrawingScreen(page);
    await openToolDrawer(page);
    await expect(page.getByTestId('rsd-palette-paints')).toHaveCount(0);

    const column = ['Colors', 'Brushes', 'Stroke width', 'Coloring books'];
    const columnBoxes = await Promise.all(
      column.map((name) => settledBox(page.getByRole('button', { name, exact: true })))
    );
    expect(columnBoxes.map(({ x, y, width }) => ({ x, y, width }))).toEqual(
      column.map((_, index) => ({
        x: EDGE_GAP_PX,
        y: height - BOTTOM_ROW_OFFSET_PX - TOOL_PITCH_PX * (column.length - 1 - index),
        width: TOOL_SIZE_PX,
      }))
    );
    const bottomRow = await Promise.all(
      ['Save screenshot', 'Undo'].map((name) =>
        settledBox(page.getByRole('button', { name, exact: true }))
      )
    );
    for (const box of bottomRow) {
      expect(box.x).toBeGreaterThan(EDGE_GAP_PX);
      expect(box.y).toBe(height - BOTTOM_ROW_OFFSET_PX);
    }
    expect((await boxOf(paper)).width).toBe(PHONE_WIDTH_PX);
  });
}

test.describe('the Colors flyout on a phone held sideways', () => {
  test.use({ viewport: PHONE });

  test('picking a colour loads it, closes the flyout and returns focus to the Colors button', async ({
    page,
  }) => {
    await openDrawingScreen(page);
    await colorsButton(page).click();
    await expect(flyout(page).getByRole('button')).toHaveCount(12);

    await flyout(page).getByRole('button', { name: 'Red', exact: true }).click();

    await expect(flyout(page)).toBeHidden();
    await expect(colorsButton(page)).toBeFocused();
    await colorsButton(page).press('Enter');
    await expect(flyout(page).getByRole('button', { name: 'Red', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('Escape closes the flyout and returns focus to the Colors button', async ({ page }) => {
    await openDrawingScreen(page);
    await colorsButton(page).click();
    await flyout(page).getByRole('button').first().focus();

    await page.keyboard.press('Escape');

    await expect(flyout(page)).toBeHidden();
    await expect(colorsButton(page)).toBeFocused();
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });

    test('a stroke in the reclaimed left strip commits and dismisses the flyout', async ({
      page,
    }) => {
      await openDrawingScreen(page);
      await colorsButton(page).click();
      await expect(flyout(page)).toBeVisible();

      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: x === undefined || y === undefined ? [] : [{ x, y, id: 0 }],
        });
      const { from, to } = LEFT_STRIP_STROKE;
      await touch('touchStart', from.x, from.y);
      for (let step = 1; step <= TOUCH_MOVES; step++)
        await touch(
          'touchMove',
          from.x + ((to.x - from.x) * step) / TOUCH_MOVES,
          from.y + ((to.y - from.y) * step) / TOUCH_MOVES
        );
      await touch('touchEnd');

      await expect(flyout(page)).toBeHidden();
      await openToolDrawer(page);
      await expect(page.getByRole('button', { name: 'Save screenshot' })).toBeEnabled();
    });
  });

  test('one flyout is open at a time and Custom Color opens the full picker', async ({ page }) => {
    await openDrawingScreen(page);
    await openToolDrawer(page);
    await colorsButton(page).click();
    await expect(flyout(page)).toBeVisible();

    await page.getByRole('button', { name: 'Stroke width', exact: true }).click();

    await expect(flyout(page)).toBeHidden();
    await colorsButton(page).click();
    await expect(flyout(page)).toBeVisible();
    await flyout(page).getByRole('button', { name: 'Custom Color' }).click();
    await expect(flyout(page)).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Color Picker' })).toBeVisible();
  });
});

test('a narrow phone shows only whole swatches and keeps Custom Color in view', async ({
  page,
}) => {
  await page.setViewportSize(NARROW_PHONE);
  await openDrawingScreen(page);
  await colorsButton(page).click();
  await expect(flyout(page)).toBeVisible();

  const swatches = flyout(page).getByRole('button');
  const boxes = await Promise.all((await swatches.all()).map((swatch) => settledBox(swatch)));
  expect(boxes.length).toBeGreaterThan(1);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(NARROW_PHONE.width - FLYOUT_RIGHT_MARGIN_PX);
  }
  const custom = flyout(page).getByRole('button', { name: 'Custom Color' });
  await custom.click();
  await expect(page.getByRole('dialog', { name: 'Color Picker' })).toBeVisible();
});

test('turning the phone upright restores the palette and closes the flyout', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openDrawingScreen(page);
  await colorsButton(page).click();
  await expect(flyout(page)).toBeVisible();

  await page.setViewportSize(PORTRAIT_PHONE);

  await expect(page.getByTestId('rsd-palette-paints')).toBeVisible();
  await expect(colorsButton(page)).toHaveCount(0);
  await expect(flyout(page)).toHaveCount(0);
});

test('a landscape tablet keeps the palette and has no Colors button', async ({ page }) => {
  await page.setViewportSize(LANDSCAPE_TABLET);
  await openDrawingScreen(page);

  await expect(page.getByTestId('rsd-palette-paints')).toBeVisible();
  await expect(colorsButton(page)).toHaveCount(0);
});
