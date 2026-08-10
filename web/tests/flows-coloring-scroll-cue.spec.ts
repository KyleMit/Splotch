import { expect, test, type Locator, type Page } from '@playwright/test';

import { settleFlyIn } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  openColoringDialog,
  openDrawer,
  settleTapGuard,
} from './flows-harness';

// The picker's scroll affordances on a phone (issue #907): whenever the catalog
// outgrows the opening viewport, the fold cuts a tile in half and a fade sits
// over the cut, and both retire together once the last row is reached.

const IPHONE_13_MINI_PORTRAIT = { width: 375, height: 812 };

function dialogOf(page: Page) {
  return page.locator('#coloring-book-dialog');
}

function fadeOpacity(fade: Locator) {
  return fade.evaluate((node) => Number(getComputedStyle(node).opacity));
}

// How far a tile has to straddle the fold before it reads as deliberately cut
// rather than as a hairline the layout happened to leave behind.
const MEANINGFUL_CUT_PX = 16;

async function tileStraddlingTheFold(dialog: Locator) {
  return dialog.evaluate((node) => {
    const fold = node.getBoundingClientRect().bottom;
    return [...node.querySelectorAll('.coloring-tile')]
      .map((tile) => tile.getBoundingClientRect())
      .filter((box) => box.top < fold && box.bottom > fold)
      .map((box) => ({ shown: fold - box.top, hidden: box.bottom - fold }))
      .at(0);
  });
}

test.describe('coloring picker scroll cues on a phone', () => {
  test.use({ viewport: IPHONE_13_MINI_PORTRAIT });

  test('cuts the trailing row and fades it, then retires both at the bottom', async ({ page }) => {
    await gotoAppWithAllColoringBooksInstalled(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = dialogOf(page);
    await settleFlyIn(dialog);
    const fade = dialog.locator('.coloring-scroll-fade');

    await expect
      .poll(() => dialog.evaluate((node) => node.scrollHeight > node.clientHeight))
      .toBe(true);

    // The fold lands inside a book tile, with enough of it left to see.
    const cut = await tileStraddlingTheFold(dialog);
    expect(cut).toBeDefined();
    expect(cut!.shown).toBeGreaterThan(MEANINGFUL_CUT_PX);
    expect(cut!.hidden).toBeGreaterThan(MEANINGFUL_CUT_PX);

    await expect.poll(() => fadeOpacity(fade)).toBe(1);

    await dialog.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    await expect.poll(() => fadeOpacity(fade)).toBe(0);

    // Scrolling back off the boundary re-arms it.
    await dialog.evaluate((node) => node.scrollTo({ top: 0 }));
    await expect.poll(() => fadeOpacity(fade)).toBe(1);
  });

  test('re-evaluates the cues when the page grid replaces the book grid', async ({ page }) => {
    await gotoAppWithAllColoringBooksInstalled(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = dialogOf(page);
    await settleFlyIn(dialog);
    const fade = dialog.locator('.coloring-scroll-fade');
    await expect.poll(() => fadeOpacity(fade)).toBe(1);

    await dialog.getByRole('button', { name: 'Farm coloring book' }).click();
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await settleTapGuard(page);

    // Six landscape page tiles over three rows still overflow this viewport, so
    // the cut and the fade carry over to the grid that replaced the books.
    const cut = await tileStraddlingTheFold(dialog);
    expect(cut).toBeDefined();
    expect(cut!.shown).toBeGreaterThan(MEANINGFUL_CUT_PX);
    await expect.poll(() => fadeOpacity(fade)).toBe(1);

    await dialog.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    await expect.poll(() => fadeOpacity(fade)).toBe(0);
  });
});

test.describe('coloring picker with room for the whole catalog', () => {
  test.use({ viewport: { width: 900, height: 1600 } });

  test('leaves a grid that fits uncut and uncued', async ({ page }) => {
    await gotoAppWithAllColoringBooksInstalled(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = dialogOf(page);
    await settleFlyIn(dialog);
    await dialog.getByRole('button', { name: 'Farm coloring book' }).click();
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();

    await expect
      .poll(() => dialog.evaluate((node) => node.scrollHeight <= node.clientHeight))
      .toBe(true);
    await expect.poll(() => fadeOpacity(dialog.locator('.coloring-scroll-fade'))).toBe(0);
    expect(await tileStraddlingTheFold(dialog)).toBeUndefined();
  });
});
