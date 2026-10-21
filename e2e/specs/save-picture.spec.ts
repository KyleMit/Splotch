import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../fixtures.ts';
import { openDrawer, undoButton } from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// How long a second save gets to arrive after the first, in the burst case's negative half. It
// only has to outlast the window the button coalesces a rapid run of taps in, so it is an idle
// past a known threshold, which is what a fixed wait is right for.
const SECOND_SAVE_WINDOW_MS = 1000;
const RAPID_TAPS = 3;
// The saved page carries the coloring page's black line art, far beyond what one stroke leaves.
const LINE_ART_MIN_PIXELS = 5000;
const BLACK_CHANNEL_MAX = 80;
const RGBA_CHANNELS = 4;

function saveButton(page: Page) {
  return page.getByRole('button', { name: 'Save screenshot', exact: true });
}

async function blackPixels(download: Download): Promise<number> {
  const path = await download.path();
  const raw = await sharp(await readFile(path))
    .ensureAlpha()
    .raw()
    .toBuffer();
  let count = 0;
  for (let offset = 0; offset < raw.length; offset += RGBA_CHANNELS) {
    if (Math.max(raw[offset], raw[offset + 1], raw[offset + 2]) < BLACK_CHANNEL_MAX) count++;
  }
  return count;
}

test.describe('saving the picture', () => {
  test('the camera wakes with the first stroke and sleeps again when Undo empties the page', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openDrawer(page);
    await expect(saveButton(page)).toBeDisabled();

    await drawingScreen.drawStroke();
    await expect(saveButton(page)).toBeEnabled();

    await undoButton(page).click();
    await expect(saveButton(page)).toBeDisabled();
  });

  test('a save downloads a PNG named for Splotch', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.drawStroke();
    await openDrawer(page);

    const downloaded = page.waitForEvent('download');
    await saveButton(page).click();
    const download = await downloaded;

    expect(download.suggestedFilename()).toMatch(/^splotch-.+\.png$/);
    expect(await download.failure()).toBeNull();
    const { format, width, height } = await sharp(await readFile(await download.path())).metadata();
    expect(format).toBe('png');
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  test('a burst of taps shares one save', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.drawStroke();
    await openDrawer(page);
    const saves: string[] = [];
    page.on('download', (download) => saves.push(download.suggestedFilename()));

    for (let tap = 0; tap < RAPID_TAPS; tap++) await saveButton(page).click({ force: true });

    await expect.poll(() => saves.length).toBe(1);
    await page.waitForTimeout(SECOND_SAVE_WINDOW_MS);
    expect(saves).toHaveLength(1);
  });

  test('the coloring page is part of the picture that is saved', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await openDrawer(page);
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Farm' })
      .getByRole('button', { name: 'Cat coloring page', exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Cat ready.' })).toBeVisible();
    await drawingScreen.drawStroke();

    const downloaded = page.waitForEvent('download');
    await saveButton(page).click();

    expect(await blackPixels(await downloaded)).toBeGreaterThan(LINE_ART_MIN_PIXELS);
  });
});
