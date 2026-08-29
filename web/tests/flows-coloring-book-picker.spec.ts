import { expect, test, type Page } from '@playwright/test';

import { gotoApp, settleFlyIn } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  gotoAppWithInstalledColoringBook,
  openColoringBookGrid,
  openDrawer,
  openFarmPageGrid,
  settleTapGuard,
} from './flows-harness';

// ── cover grid geometry ─────────────────────────────────────────────────────

// A tall viewport swaps the four cover columns for two and caps the grid by the
// dialog's height. That cap is what turns the height into cover art, and on a
// viewport only slightly taller than it is wide it is *tighter* than the width
// four columns already had — so the swap only ever helps above a crossover, and
// the gate has to sit above it. These viewports walk both sides of that
// crossover, including the barely-portrait windows a desktop resize or Stage
// Manager can produce.
const COVER_GRID_VIEWPORTS = [
  { width: 741, height: 745 },
  { width: 741, height: 800 },
  { width: 741, height: 926 },
  { width: 760, height: 800 },
  { width: 800, height: 900 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 1366 },
];

// The cover as drawn, beside the cover the four-column layout would have drawn
// in the same row. Both come off the live grid — the row it is laid in, and its
// own gap — so the comparison tracks the dialog's padding and gap instead of
// carrying a copy of them.
async function coverGeometry(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  return page.evaluate(() => {
    const grid = document.querySelector('.coloring-books-grid') as HTMLElement;
    const row = grid.parentElement as HTMLElement;
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    return {
      coverWidth: (grid.querySelector('.coloring-tile') as HTMLElement).offsetWidth,
      fourColumnCoverWidth: (row.clientWidth - 3 * gap) / 4,
    };
  });
}

async function openCoverGrid(page: Page) {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);
}

test('no viewport draws a cover smaller than four columns would', async ({ page }) => {
  test.slow();
  for (const viewport of COVER_GRID_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openCoverGrid(page);
    const { coverWidth, fourColumnCoverWidth } = await coverGeometry(page);
    expect(
      coverWidth,
      `cover width at ${viewport.width}x${viewport.height}`
    ).toBeGreaterThanOrEqual(Math.floor(fourColumnCoverWidth));
  }
});

test('a tablet held upright spends its height on bigger covers', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openCoverGrid(page);
  const { coverWidth, fourColumnCoverWidth } = await coverGeometry(page);
  expect(coverWidth).toBeGreaterThan(fourColumnCoverWidth);
});

// A toddler mashes a launch button several times before noticing the modal
// opened; the follow-up taps land on the fresh backdrop right where the button
// was and would dismiss it. modalDialog arms a short-lived dead zone around the
// launching button (launchGuard) that swallows those taps without dismissing,
// while a tap elsewhere on the backdrop still closes as usual.
test('a repeat tap where the launch button sat does not dismiss the just-opened modal', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const btn = page.locator('#coloringBookButton');
  const box = (await btn.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await btn.click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // Repeat tap on the vacated button spot (now backdrop) — swallowed, stays open.
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeVisible();

  // A backdrop tap away from the launch point still dismisses; only the
  // button's own region is guarded.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 10, 10);
  await expect(dialog).toBeHidden();
});

// The same tap burst, one level into the picker. Tapping a book cover swaps the
// grid for that book's pages, so the follow-up taps land on whichever page tile
// painted where the cover was and apply it — the picker closes on a page nobody
// chose, before the child ever saw the pages. ColoringBook arms the same
// short-lived dead zone at the tap point (launchGuard.guardTapZone).
test('a repeat tap on a book cover does not pick the page that lands under it', async ({
  page,
}) => {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  // This spec dispatches raw input at a remembered coordinate, so the fly-in has
  // to land before the tile is measured — mid-animation the whole grid sits
  // scaled down onto the launcher and the box belongs to a different book.
  await settleFlyIn(dialog);
  const coverBox = (await dialog
    .getByRole('button', { name: 'Farm coloring book' })
    .boundingBox())!;
  const cx = coverBox.x + coverBox.width / 2;
  const cy = coverBox.y + coverBox.height / 2;

  // Establish the hazard before testing the guard: drill in once and confirm a
  // page tile really does occupy the spot the cover just vacated, so the
  // guarded taps below can't pass by landing on nothing.
  const pageTiles = await openFarmPageGrid(page);
  const tileBoxes = await pageTiles.evaluateAll((tiles) =>
    tiles.map((tile) => {
      const { left, top, right, bottom } = tile.getBoundingClientRect();
      return { left, top, right, bottom };
    })
  );
  expect(
    tileBoxes.filter(
      (box) => cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom
    )
  ).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
  await settleTapGuard(page);

  // The double tap. The second click has the whole guard window to land in, and
  // back-to-back CDP input is orders of magnitude inside it.
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx, cy);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();

  // Once the guard lapses that same spot picks the page as usual.
  await settleTapGuard(page);
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();
});

// A touch tap activates the launcher on pointerup (scribbleTap), so the dialog
// is already open and painted when the tap's trailing synthesized click
// dispatches — and that click is hit-tested at dispatch time, landing on
// whatever book tile sits under the finger. Unless the launch dead zone also
// guards dialog *content*, the picker opens pre-drilled into a "random" book
// (issue #308). Mouse clicks can't reproduce this (a click targets the common
// ancestor of its down/up targets, which is never inside the dialog), so this
// spec taps with a real touchscreen.
test.describe('coloring book picker via touch', () => {
  test.use({ hasTouch: true });

  test('a touch tap on the launcher opens the picker at the root book list', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);

    await page.locator('#coloringBookButton').tap();

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog).toBeVisible();
    // A book tile paints exactly where the finger was (that's what makes the
    // ghost click land); the picker must still show the root book list, not a
    // drilled-in page grid.
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});
