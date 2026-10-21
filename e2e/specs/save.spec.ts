import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../fixtures.ts';
import {
  expectPaperCleared,
  inkInSavedPicture,
  openDrawer,
  savePicture,
} from '../support/group-a.ts';

const PICTURE_FILENAME = /^splotch-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/;

function saveButton(page: Page) {
  return page.getByRole('button', { name: 'Save screenshot', exact: true });
}

test.describe('saving the picture', () => {
  test('is unavailable until something is drawn', async ({ drawingScreen }) => {
    await openDrawer(drawingScreen.page);
    await expect(saveButton(drawingScreen.page)).toBeDisabled();

    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();

    await expect(saveButton(drawingScreen.page)).toBeEnabled();
  });

  test('downloads a PNG named for the moment it was saved, holding the drawing', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();

    const download = await savePicture(page);

    expect(download.suggestedFilename()).toMatch(PICTURE_FILENAME);
    expect((await sharp(await download.path()).metadata()).format).toBe('png');
    expect(await inkInSavedPicture(download)).toBeGreaterThan(stroke.lengthPx);
  });

  test('keeps the saved picture whole when the page is cleared afterwards', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    const download = await savePicture(page);

    await page.getByRole('button', { name: 'Clear drawing', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expectPaperCleared(drawingScreen, stroke);
    expect(await inkInSavedPicture(download)).toBeGreaterThan(stroke.lengthPx);
  });
});
