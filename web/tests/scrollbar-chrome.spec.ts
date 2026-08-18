import { expect, test, type Locator, type Page } from '@playwright/test';

import { chromiumLaunchOptions } from '../playwright.shared';
import { settleFlyIn } from './helpers';
import {
  gotoAppWithAllColoringBooksInstalled,
  openColoringBookGrid,
  openDrawer,
} from './flows-harness';

// How the app dresses a classic, space-taking scrollbar (app.css): a transparent
// track, so the gutter shows the scroller's own surface rather than UA chrome
// painted through its rounded corners. The gutter keeps whatever width the
// platform draws, which is why this measures the corner and not the geometry.
//
// Every other spec runs blind to it — Playwright launches Chromium with
// `--hide-scrollbars`, so no scrollbar is drawn at all — hence the separate
// launch here, and hence the gutter measurement below: with nothing taking
// layout space the corner reads as round whatever the app declares.
test.use({
  launchOptions: { ...chromiumLaunchOptions(), ignoreDefaultArgs: ['--hide-scrollbars'] },
  viewport: { width: 1400, height: 800 },
});

// A square this far into a corner sits entirely outside a --radius-lg (16px)
// arc — its innermost pixel is 17px from the arc's center — so it is backdrop
// on a card whose corner is round, and chrome on one squared off by a scrollbar
// painted through it.
const OUTSIDE_CORNER_PX = 4;

// The two corners are mirror images of the same arc over the same dimmed
// backdrop, so their means agree to well under a level; a squared-off corner
// runs ~160 levels brighter (measured 252 against 90 on the white card).
const CORNER_LUMINANCE_TOLERANCE = 8;

async function scrollbarGutterWidth(scroller: Locator) {
  return scroller.evaluate((node) => (node as HTMLElement).offsetWidth - node.clientWidth);
}

/** Mean luminance of a screenshot clip, decoded in the page. */
async function meanLuminance(
  page: Page,
  clip: { x: number; y: number; width: number; height: number }
) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
    }
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

test('the picker keeps its rounded corners under a classic scrollbar', async ({ page }) => {
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringBookGrid(page);

  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  await dialog.getByRole('button', { name: 'Farm coloring book' }).click();
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();

  // A scrollbar taking no layout space is the overlay kind, which paints
  // nothing through the corner and leaves this test with nothing to measure.
  expect(await scrollbarGutterWidth(dialog)).toBeGreaterThan(0);

  const box = (await dialog.boundingBox())!;
  const cornerLuminance = (x: number) =>
    meanLuminance(page, { x, y: box.y, width: OUTSIDE_CORNER_PX, height: OUTSIDE_CORNER_PX });

  const scrollbarCorner = await cornerLuminance(box.x + box.width - OUTSIDE_CORNER_PX);
  const plainCorner = await cornerLuminance(box.x);
  expect(Math.abs(scrollbarCorner - plainCorner)).toBeLessThan(CORNER_LUMINANCE_TOLERANCE);
});
