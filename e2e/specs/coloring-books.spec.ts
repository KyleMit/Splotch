import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import {
  blackInkInCentralBand,
  closeDialog,
  goToSettingsSection,
  openDrawer,
  openSettings,
  waitUntilSettled,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// Line art is black on the light paper; a drawn page crosses the central band with far more ink
// than a stroke leaves, and a blank paper leaves none.
const LINE_ART_MIN_PIXELS = 500;
const FARM_PAGE_COUNT = 6;
// A tap that lands soon after a dialog opens is swallowed, so a toddler mashing a button does not
// dismiss or answer what it just opened. A mashing child's second tap lands a couple of tenths of a
// second after the first; the observation then idles past the repeat tap's effect.
const REPEAT_TAP_DELAY_MS = 250;
const TAP_GUARD_OBSERVATION_MS = 300;
const BACKDROP_CORNER_INSET_PX = 10;

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

  test('a repeat tap where the launch button sat does not dismiss the picker just opened', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openDrawer(page);
    const launcher = page.getByRole('button', { name: 'Coloring books', exact: true });
    const spot = await launcher.boundingBox();
    if (!spot) throw new Error('The Coloring books button is not laid out');
    await launcher.click();
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();

    await page.waitForTimeout(REPEAT_TAP_DELAY_MS);
    await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await page.waitForTimeout(TAP_GUARD_OBSERVATION_MS);
    await expect(farm).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('The window has no size');
    await page.mouse.click(viewport.width - BACKDROP_CORNER_INSET_PX, BACKDROP_CORNER_INSET_PX);
    await expect(farm).toBeHidden();
  });

  test('a repeat tap on a book cover does not pick the page that lands under it', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openColoringBooks(page);
    await closeDialog(page.getByRole('dialog', { name: 'Farm' }));
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    const books = page.getByRole('dialog', { name: 'Coloring Books' });
    const cover = books.getByRole('button', { name: 'Farm coloring book', exact: true });
    await waitUntilSettled(cover);
    const spot = await cover.boundingBox();
    if (!spot) throw new Error('The Farm cover is not laid out');
    const [x, y] = [spot.x + spot.width / 2, spot.y + spot.height / 2];

    await page.mouse.click(x, y);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();
    await page.waitForTimeout(REPEAT_TAP_DELAY_MS);
    await page.mouse.click(x, y);
    await page.waitForTimeout(TAP_GUARD_OBSERVATION_MS);

    await expect(farm).toBeVisible();
    await expect(statusSaying(page, 'Cat ready.')).toBeHidden();
  });
});
