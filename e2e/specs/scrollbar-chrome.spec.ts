import type { Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../../tools/lib/playwright.mjs';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { settledBox } from '../support/group-c.ts';

// How the app dresses a classic, space-taking scrollbar: the gutter keeps whatever width the
// platform draws, so a card's rounded corner has to stay round around it.
//
// Playwright launches Chromium with `--hide-scrollbars`, so every other spec runs blind to this.
// The launch here keeps the scrollbars, and each case first proves one is taking layout space:
// with none, the corner reads as round whatever the app declares.
test.use({
  launchOptions: {
    executablePath: chromiumExecutablePath(chromium),
    ignoreDefaultArgs: ['--hide-scrollbars'],
  },
  viewport: { width: 1400, height: 800 },
});

// A square this far into a corner sits entirely outside a card's rounded arc, so it is backdrop on a
// card whose corner is round and scrollbar chrome on one squared off by a scrollbar painted
// through it.
const OUTSIDE_CORNER_PX = 4;
// The two top corners are mirror images of the same arc over the same dimmed backdrop, so their
// means agree to well under a level; a squared-off corner runs far brighter.
const CORNER_LUMINANCE_TOLERANCE = 8;

/** Mean luminance of a screenshot clip, decoded in the page. */
async function meanLuminance(
  page: Page,
  clip: { x: number; y: number; width: number; height: number }
) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext('2d');
    if (!context) throw new Error('No 2D context');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4)
      sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

test('the page picker keeps its rounded corners under a classic scrollbar', async ({ page }) => {
  await openDrawingScreen(page);
  await page.getByRole('button', { name: 'Expand controls' }).click();
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Farm' });
  await expect(dialog.getByRole('button', { name: 'Cat coloring page' })).toBeVisible();

  const scroller = await dialog.evaluateHandle((node) => {
    const found = [...node.querySelectorAll('*')].find((element) =>
      /(auto|scroll)/.test(getComputedStyle(element).overflowY)
    );
    if (!found) throw new Error('The picker has no scroller');
    return found;
  });
  expect(
    await scroller.evaluate((node) => (node as HTMLElement).offsetWidth - node.clientWidth)
  ).toBeGreaterThan(0);

  const box = await settledBox(dialog.getByTestId('modal-card'));
  const cornerLuminance = (x: number) =>
    meanLuminance(page, { x, y: box.y, width: OUTSIDE_CORNER_PX, height: OUTSIDE_CORNER_PX });
  const scrollbarCorner = await cornerLuminance(box.x + box.width - OUTSIDE_CORNER_PX);
  const plainCorner = await cornerLuminance(box.x);

  expect(Math.abs(scrollbarCorner - plainCorner)).toBeLessThan(CORNER_LUMINANCE_TOLERANCE);
});
