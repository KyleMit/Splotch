import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { blackInkInCentralBand, openDrawer, undoButton } from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// A browser that refuses the page every kind of storage: private windows and locked-down policies
// both do, and the app has to open all the same.
test('a browser that denies storage still leaves drawing and Undo working', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    Storage.prototype.getItem = denied;
    Storage.prototype.setItem = denied;
    Storage.prototype.removeItem = denied;
    IDBFactory.prototype.open = denied;
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const drawingScreen = await openDrawingScreen(page);
  await drawingScreen.pickColor('Black');
  await drawingScreen.drawStroke();
  await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
  await openDrawer(page);
  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();

  await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
  await expect(undoButton(page)).toBeDisabled();
  expect(pageErrors).toEqual([]);
});
