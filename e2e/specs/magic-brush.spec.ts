import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import {
  blackInkInCentralBand,
  clearByDragging,
  inkHuesInCentralBand,
  inkInCentralBand,
  openBookShelf,
  openDrawer,
  RED_INK,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// A pen stroke reaches one hue. A reveal crosses at least two of the colours the page is filled
// with, or of the rainbow a blank page holds.
const MAGIC_MIN_HUES = 2;
// The same page's line art measures a few pixels apart from one redraw to the next.
const LINE_ART_TOLERANCE_FRACTION = 0.02;
const SWEEP = [
  { x: 0.2, y: 0.25 },
  { x: 0.4, y: 0.6 },
  { x: 0.6, y: 0.3 },
  { x: 0.8, y: 0.65 },
] as const;

async function pickBrush(page: Page, brush: string) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Brushes', exact: true }).click();
  await page
    .getByRole('group', { name: 'Brush Menu' })
    .getByRole('button', { name: brush })
    .click();
}

async function pickFarmPage(page: Page, name: string) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
  await page.getByRole('dialog', { name: 'Farm' }).getByRole('button', { name: name }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ready.' })).toBeVisible();
}

test.describe('the magic brush', () => {
  test('a pen stroke is one hue, so the hue count tells the brushes apart', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await pickFarmPage(page, 'Cat coloring page');

    await drawingScreen.drawStroke(SWEEP);

    await expect.poll(() => inkInCentralBand(page, () => true)).toBeGreaterThan(0);
    expect(await inkHuesInCentralBand(page)).toBeLessThan(MAGIC_MIN_HUES);
  });

  test('reveals the colours of the coloring page it is drawn over', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await pickFarmPage(page, 'Cat coloring page');
    await pickBrush(page, 'Magic brush');

    await drawingScreen.drawStroke(SWEEP);

    await expect.poll(() => inkHuesInCentralBand(page)).toBeGreaterThanOrEqual(MAGIC_MIN_HUES);
  });

  test('reveals a rainbow on a blank page, and keeps revealing after Clear', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await pickBrush(page, 'Magic brush');

    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkHuesInCentralBand(page)).toBeGreaterThanOrEqual(MAGIC_MIN_HUES);

    await clearByDragging(page);
    await expect.poll(() => inkHuesInCentralBand(page)).toBe(0);

    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkHuesInCentralBand(page)).toBeGreaterThanOrEqual(MAGIC_MIN_HUES);
  });

  test('the eraser removes it, and a colour picked afterwards paints over it', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await pickBrush(page, 'Magic brush');
    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkHuesInCentralBand(page)).toBeGreaterThanOrEqual(MAGIC_MIN_HUES);

    await pickBrush(page, 'Eraser');
    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkHuesInCentralBand(page)).toBeLessThan(MAGIC_MIN_HUES);

    await drawingScreen.pickColor('Red');
    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkInCentralBand(page, RED_INK)).toBeGreaterThan(0);
  });

  test('changing the coloring page recodes the ink, and Undo puts both back', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await pickFarmPage(page, 'Cat coloring page');
    await pickBrush(page, 'Magic brush');
    await drawingScreen.drawStroke(SWEEP);
    await expect.poll(() => inkHuesInCentralBand(page)).toBeGreaterThanOrEqual(MAGIC_MIN_HUES);
    const catInk = await blackInkInCentralBand(page);

    await (await openBookShelf(page)).getByRole('button', { name: 'Farm coloring book' }).click();
    await page
      .getByRole('dialog', { name: 'Farm' })
      .getByRole('button', { name: 'Cow coloring page' })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Cow ready.' })).toBeVisible();
    await expect.poll(() => blackInkInCentralBand(page)).not.toBe(catInk);

    await drawingScreen.undo();
    await expect
      .poll(async () => Math.abs((await blackInkInCentralBand(page)) - catInk) / catInk)
      .toBeLessThan(LINE_ART_TOLERANCE_FRACTION);
  });
});
