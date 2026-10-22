import type { Page } from '@playwright/test';
import { ACCEPT_RADIUS_FACTOR } from '../../src/lib/actions/dragToClearGeometry.ts';
import { expect, test } from '../fixtures.ts';
import { expectPaperCleared, openDrawer } from '../support/group-a.ts';

// A release this far along the way to the accept ring has not reached it; this far past its edge
// has, with margin so sub-pixel geometry cannot land it short.
const SHORT_OF_RING = 0.6;
const PAST_RING = 1.1;
const DRAG_STEPS = 12;
// The Clear button is a puck docked in the top-right corner and drags toward the paper's middle.
const TOWARD_THE_PAPER = { x: -1, y: 1 };
const COACHMARK = 'rsd-clear-coachmark';
const ACCEPT_RING = 'rsd-clear-accept-ring';
// Three presses inside the gesture's multi-press window reveal the coachmark; a starved worker can
// straddle the window between presses, so the burst is retried whole.
const COACHMARK_BURST_TIMEOUT_MS = 15_000;
const COACHMARK_BURST_PRESSES = 3;

function clearButton(page: Page) {
  return page.getByRole('button', { name: 'Clear drawing', exact: true });
}

async function dragClear(page: Page, fractionOfRing: number, release = true) {
  const box = await clearButton(page).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('the Clear button or the viewport is not laid out');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reach =
    (Math.min(viewport.width, viewport.height) * ACCEPT_RADIUS_FACTOR * fractionOfRing) /
    Math.SQRT2;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + TOWARD_THE_PAPER.x * reach,
    start.y + TOWARD_THE_PAPER.y * reach,
    { steps: DRAG_STEPS }
  );
  if (release) await page.mouse.up();
}

test.describe('clearing the page', () => {
  test('leaves the drawing alone when a drag is released short of the accept ring', async ({
    drawingScreen,
  }) => {
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await dragClear(drawingScreen.page, SHORT_OF_RING);

    await expect(drawingScreen.page.getByTestId(ACCEPT_RING)).toBeHidden();
    await expect(clearButton(drawingScreen.page)).toBeVisible();
    expect(await drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  });

  test('wipes the page when a drag is released past the accept ring', async ({ drawingScreen }) => {
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await dragClear(drawingScreen.page, PAST_RING, false);
    await expect(drawingScreen.page.getByTestId(ACCEPT_RING)).toBeVisible();
    await drawingScreen.page.mouse.up();

    await expectPaperCleared(drawingScreen, stroke);
  });

  test('is taken back by Undo', async ({ drawingScreen }) => {
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
    await dragClear(drawingScreen.page, PAST_RING);
    await expectPaperCleared(drawingScreen, stroke);

    await openDrawer(drawingScreen.page);
    await drawingScreen.undo();

    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  });

  test('is done from the keyboard too, as a screen reader or a switch would', async ({
    drawingScreen,
  }) => {
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await clearButton(drawingScreen.page).focus();
    await drawingScreen.page.keyboard.press('Enter');

    await expectPaperCleared(drawingScreen, stroke);
  });

  test('shows the coachmark when the button is tapped repeatedly instead of dragged, and keeps it up', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const coachmark = page.getByTestId(COACHMARK);
    await expect(coachmark).toHaveCount(0);

    await expect(async () => {
      for (let press = 0; press < COACHMARK_BURST_PRESSES; press++) await clearButton(page).click();
      await expect(coachmark).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: COACHMARK_BURST_TIMEOUT_MS });

    await expect
      .poll(() => coachmark.evaluate((element) => Number(getComputedStyle(element).opacity)))
      .toBeGreaterThan(0);
    // A pause past a known threshold, to prove the coachmark is not torn down a tick later.
    await page.waitForTimeout(300);
    await expect(coachmark).toBeVisible();
  });
});
