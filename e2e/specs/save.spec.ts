import type { Download, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../fixtures.ts';
import { expectPaperCleared, openDrawer } from '../support/group-a.ts';

const PICTURE_FILENAME = /^splotch-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/;
const RGB_CHANNELS = 3;
// A pixel this dark is the black stroke the spec drew, never the paper's grain.
const INK_MAX_CHANNEL = 60;
const DOWNLOAD_TIMEOUT_MS = 15_000;

function saveButton(page: Page) {
  return page.getByRole('button', { name: 'Save screenshot', exact: true });
}

async function inkInSavedPicture(download: Download): Promise<number> {
  const { data } = await sharp(await download.path())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let offset = 0; offset < data.length; offset += RGB_CHANNELS)
    if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < INK_MAX_CHANNEL) inked++;
  return inked;
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
    await openDrawer(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
      saveButton(page).click(),
    ]);

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
    await openDrawer(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
      saveButton(page).click(),
    ]);

    await page.getByRole('button', { name: 'Clear drawing', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expectPaperCleared(drawingScreen, stroke);
    expect(await inkInSavedPicture(download)).toBeGreaterThan(stroke.lengthPx);
  });
});
