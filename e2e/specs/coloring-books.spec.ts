import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import {
  blackInkInCentralBand,
  closeDialog,
  goToSettingsSection,
  openDrawer,
  openSettings,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// Line art is black on the light paper; a drawn page crosses the central band with far more ink
// than a stroke leaves, and a blank paper leaves none.
const LINE_ART_MIN_PIXELS = 500;
const FARM_PAGE_COUNT = 6;

async function openColoringBooks(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
}

function statusSaying(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text });
}

test.describe('coloring books', () => {
  test('a first visit opens the Farm book, and a page picked from it lands on the paper', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    expect(await blackInkInCentralBand(page)).toBe(0);

    await openColoringBooks(page);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm.getByRole('button', { name: /coloring page$/ })).toHaveCount(FARM_PAGE_COUNT);
    await farm.getByRole('button', { name: 'Cat coloring page', exact: true }).click();

    await expect(farm).toBeHidden();
    await expect(statusSaying(page, 'Cat ready.')).toBeVisible();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);
  });

  test('the next visit lists the books, and another book offers its own pages', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openColoringBooks(page);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await closeDialog(farm);

    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    const books = page.getByRole('dialog', { name: 'Coloring Books' });
    await expect(books.getByRole('button', { name: 'Farm coloring book' })).toBeVisible();
    await books.getByRole('button', { name: 'Dinosaurs coloring book', exact: true }).click();

    const dinosaurs = page.getByRole('dialog', { name: 'Dinosaurs' });
    await dinosaurs.getByRole('button', { name: 'T. Rex coloring page', exact: true }).click();
    await expect(dinosaurs).toBeHidden();
    await expect(statusSaying(page, 'T. Rex ready.')).toBeVisible();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);
  });

  test('the active page shows as a chip in the picker, and the chip takes the page off', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openColoringBooks(page);
    await page
      .getByRole('dialog', { name: 'Farm' })
      .getByRole('button', { name: 'Cat coloring page', exact: true })
      .click();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);

    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    const books = page.getByRole('dialog', { name: 'Coloring Books' });
    await books.getByRole('button', { name: 'Clear active coloring page: Cat' }).click();

    await expect(books).toBeHidden();
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
  });

  test('switching Coloring book off in Settings takes its button out of the drawer', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openDrawer(page);
    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toBeVisible();

    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Coloring');
    await settings.getByRole('switch', { name: 'Coloring book', exact: true }).click();
    await closeDialog(settings);

    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toHaveCount(0);
  });
});
