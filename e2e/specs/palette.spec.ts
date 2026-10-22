import { COLOR_CHANGE_DEBOUNCE_MS } from '../../src/lib/drawing/strokeMath.ts';
import { expect, test } from '../fixtures.ts';
import {
  BLACK_INK,
  BLUE_INK,
  closeDialog,
  GREEN_INK,
  inkInCentralBand,
  openDrawer,
  openSettings,
  pressWhereItSettles,
  RED_INK,
  WHITE_INK,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const PICKED_GREEN_HEX = '#2ECC71';
const LOWER_STROKE = [
  { x: 0.3, y: 0.62 },
  { x: 0.62, y: 0.7 },
] as const;

test.describe('the palette and its colour picker', () => {
  test('swatches take focus in order, and a key picks the colour the next stroke paints', async ({
    drawingScreen,
    page,
  }) => {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Purple', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Blue', exact: true })).toBeFocused();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_MS);
    await drawingScreen.drawStroke();
    await expect.poll(() => inkInCentralBand(page, BLUE_INK)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Red', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_MS);
    await drawingScreen.drawStroke(LOWER_STROKE);
    await expect.poll(() => inkInCentralBand(page, RED_INK)).toBeGreaterThan(0);
  });

  test('a hexagon in the colour picker commits its colour and closes the picker', async ({
    drawingScreen,
    page,
  }) => {
    await page.getByRole('button', { name: 'Custom Color', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Color Picker' });
    await expect(picker).toBeVisible();

    await pressWhereItSettles(
      page,
      picker.getByRole('button', { name: PICKED_GREEN_HEX, exact: true })
    );
    await expect(picker).toBeHidden();

    await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_MS);
    await drawingScreen.drawStroke();
    await expect.poll(() => inkInCentralBand(page, GREEN_INK)).toBeGreaterThan(0);
  });

  test('Black ink follows the theme as it changes, white on dark paper and black on light', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');

    const settings = await openSettings(page);
    await settings.getByRole('radio', { name: 'Dark', exact: true }).click();
    await closeDialog(settings);
    await drawingScreen.drawStroke();
    await expect.poll(() => inkInCentralBand(page, WHITE_INK)).toBeGreaterThan(0);

    const reopened = await openSettings(page);
    await reopened.getByRole('radio', { name: 'Light', exact: true }).click();
    await closeDialog(reopened);
    await drawingScreen.drawStroke(LOWER_STROKE);
    await expect.poll(() => inkInCentralBand(page, BLACK_INK)).toBeGreaterThan(0);
  });

  test('picking a colour while erasing returns to drawing in that colour', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => inkInCentralBand(page, BLACK_INK)).toBeGreaterThan(0);

    await openDrawer(page);
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();
    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await drawingScreen.pickColor('Red');
    await drawingScreen.drawStroke();

    await expect.poll(() => inkInCentralBand(page, RED_INK)).toBeGreaterThan(0);
  });
});
