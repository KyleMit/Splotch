import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawer, openSettingsSection } from '../support/group-a.ts';

const STROKES_THAT_SETTLE_IN = 3;
const STROKE_ROW_SPACING_PX = 60;
const ALL_BOOKS_STORED_TIMEOUT_MS = 30_000;
const COLORING_FILES = '**/coloring/**';

function picker(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Farm|Coloring Books)$/ });
}

function activePageChip(page: Page): Locator {
  return page.getByRole('button', { name: /^Clear active coloring page: / });
}

async function openPicker(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
  await expect(picker(page)).toBeVisible();
}

// Three strokes settle a child in, which is what starts the downloads (coloring-downloads.spec.ts).
async function settleIn(page: Page, paper: Locator) {
  const box = await paper.boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  for (let stroke = 0; stroke < STROKES_THAT_SETTLE_IN; stroke++) {
    const y = box.y + box.height * 0.3 + stroke * STROKE_ROW_SPACING_PX;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, y + 30, { steps: 6 });
    await page.mouse.up();
  }
}

async function waitForAllBooks(page: Page): Promise<{ section: Locator; summary: Locator }> {
  const section = await openSettingsSection(page, 'Coloring');
  const summary = section.getByText(/ extra books/);
  await expect(summary).toHaveText(/^(\d+) of \1 extra books/, {
    timeout: ALL_BOOKS_STORED_TIMEOUT_MS,
  });
  return { section, summary };
}

test.describe('the coloring picker', () => {
  test('opens straight to the Farm pages while no other book has arrived', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.route(COLORING_FILES, (route) => route.abort());
    await openPicker(page);

    const dialog = picker(page);
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: / coloring book$/ })).toHaveCount(0);
    const pages = dialog.getByRole('button', { name: / coloring page$/ });
    await expect(pages).toHaveCount(6);

    await pages.first().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: / ready\.$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    await activePageChip(page).click();
    await expect(picker(page)).toBeHidden();
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    await expect(activePageChip(page)).toHaveCount(0);
  });

  test('goes back to the starter book alone when the downloaded pictures are removed', async ({
    drawingScreen,
  }) => {
    const { page, paper } = drawingScreen;
    await settleIn(page, paper);
    const { section } = await waitForAllBooks(page);
    await section.getByRole('button', { name: 'Close', exact: true }).click();
    await openPicker(page);
    await expect(picker(page).getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await picker(page).getByRole('button', { name: 'Close' }).click();

    const reopened = await openSettingsSection(page, 'Coloring');
    await reopened.getByRole('button', { name: 'Remove downloaded pictures' }).click();
    await expect(
      reopened.getByRole('button', { name: 'Remove downloaded pictures' })
    ).toBeDisabled();
    await expect(reopened.getByText(/ extra books/)).toHaveText(/^0 of \d+ extra books/);
    await reopened.getByRole('button', { name: 'Close', exact: true }).click();

    await openPicker(page);
    await expect(picker(page).getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(picker(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('is switched off and on from Settings without losing the downloaded books, and starts without a page', async ({
    drawingScreen,
  }) => {
    const { page, paper } = drawingScreen;
    await settleIn(page, paper);
    const { section, summary } = await waitForAllBooks(page);
    const stored = await summary.textContent();
    await section.getByRole('button', { name: 'Close', exact: true }).click();
    await openPicker(page);
    await picker(page).getByRole('button', { name: 'Farm coloring book' }).click();
    await picker(page).getByRole('button', { name: 'Cat coloring page' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cat ready.' })).toBeVisible();

    const settings = await openSettingsSection(page, 'Coloring');
    const toggle = settings.getByRole('switch', { name: 'Coloring book', exact: true });
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(
      settings.getByRole('button', { name: 'Remove downloaded pictures' })
    ).toBeEnabled();
    await expect(settings.getByText(/ extra books/)).toHaveText(stored ?? '');
    await toggle.click();
    await expect(toggle).toBeChecked();
    await settings.getByRole('button', { name: 'Close', exact: true }).click();

    await openPicker(page);
    await expect(activePageChip(page)).toHaveCount(0);
    await expect(
      picker(page).getByRole('button', { name: 'Dinosaurs coloring book' })
    ).toBeVisible();
  });
});
