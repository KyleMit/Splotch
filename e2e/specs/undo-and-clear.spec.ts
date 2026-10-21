import { expect, test } from '../fixtures.ts';
import {
  blackInkInCentralBand,
  clearByDragging,
  openDrawer,
  undoButton,
} from '../support/group-b.ts';

// Black ink is read as near-black pixels, so these specs pin the light theme.
test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

test.describe('Undo and Clear on the drawing screen', () => {
  test('Undo wakes with the first stroke and takes it back', async ({ drawingScreen, page }) => {
    await openDrawer(page);
    await expect(undoButton(page)).toBeDisabled();

    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
    await expect(undoButton(page)).toBeEnabled();

    await undoButton(page).click();
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
    await expect(undoButton(page)).toBeDisabled();
  });

  test('Ctrl+Z takes back the last stroke with the drawer closed', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Expand controls' })).toBeVisible();

    await page.keyboard.press('Control+Z');

    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
  });

  test('clearing the page is itself an undo step that brings the drawing back', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);

    await clearByDragging(page);
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);

    await drawingScreen.undo();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
  });

  test('clearing a blank page leaves nothing to undo', async ({ page, drawingScreen }) => {
    await clearByDragging(page);

    await openDrawer(page);
    await expect(undoButton(page)).toBeDisabled();
    expect(await blackInkInCentralBand(page)).toBe(0);

    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect(undoButton(page)).toBeEnabled();
    await undoButton(page).click();
    await expect(undoButton(page)).toBeDisabled();
  });
});
