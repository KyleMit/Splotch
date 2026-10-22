import type { Page, Route } from '@playwright/test';
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
  PAPER_INPUT_TEST_ID,
} from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import { inkedPixelsSince, openDrawer, regionBetween, regionPixels } from '../support/group-a.ts';

// The app's script bundles, which a slow connection delivers after the prerendered first frame has
// painted. Holding them keeps the page where a child's first touch can land: on a paper whose
// engine is not listening yet.
const SCRIPT_BUNDLES = '**/_expo/static/js/**';
const STEPS = 6;
const EARLY_STRETCH = 0.4;

type Spot = { x: number; y: number };

// Where the early stroke goes: down at the first spot, on to the second while the engine is not
// listening, and on to the third once it has taken over.
const PRESS_AT: Spot = { x: 0.3, y: 0.4 };
const MOVED_TO_BEFORE_LIVE: Spot = { x: 0.45, y: 0.45 };
const MOVED_TO_AFTER_LIVE: Spot = { x: 0.65, y: 0.55 };

async function holdScripts(page: Page) {
  const held: Route[] = [];
  let holding = true;
  await page.route(SCRIPT_BUNDLES, (route) => (holding ? held.push(route) : route.continue()));
  return {
    held,
    async release() {
      holding = false;
      for (const route of held.splice(0)) await route.continue();
    },
  };
}

test.describe('a touch that lands before the drawing engine is listening', () => {
  async function pressBeforeLive(page: Page) {
    const bundles = await holdScripts(page);
    await page.goto('/', { waitUntil: 'commit' });
    const paper = page.getByTestId(PAPER_INPUT_TEST_ID);
    await expect(paper).toBeVisible();
    await expect(page.locator(`html[${DRAWING_LIVE_ATTRIBUTE}]`)).toHaveCount(0);
    await expect(page.locator(`html[${CONTROLS_LIVE_ATTRIBUTE}]`)).toHaveCount(0);
    const box = await paper.boundingBox();
    if (!box) throw new Error('the prerendered paper is not laid out');
    const at = ({ x, y }: Spot) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
    const [press, early, late] = [PRESS_AT, MOVED_TO_BEFORE_LIVE, MOVED_TO_AFTER_LIVE].map(at);
    // The first stretch only: the adopted stroke's first dab sits at the other end of the segment.
    const beforeLive = regionBetween(press, {
      x: press.x + (early.x - press.x) * EARLY_STRETCH,
      y: press.y + (early.y - press.y) * EARLY_STRETCH,
    });
    const afterLive = regionBetween(early, late);
    const blank = {
      beforeLive: await regionPixels(page, beforeLive),
      afterLive: await regionPixels(page, afterLive),
    };
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(early.x, early.y, { steps: STEPS });
    return { bundles, press, early, late, beforeLive, afterLive, blank };
  }

  test('carries its stroke on from where the finger is once the engine takes over', async ({
    page,
  }) => {
    const early = await pressBeforeLive(page);

    await early.bundles.release();
    await waitForDrawingScreen(page);
    await page.mouse.move(early.late.x, early.late.y, { steps: STEPS });
    await page.mouse.up();

    await expect
      .poll(() => inkedPixelsSince(page, early.afterLive, early.blank.afterLive))
      .toBeGreaterThan(0);
    expect(await inkedPixelsSince(page, early.beforeLive, early.blank.beforeLive)).toBe(0);
  });

  test('lets Undo take that stroke back as one step', async ({ page }) => {
    const early = await pressBeforeLive(page);
    await early.bundles.release();
    await waitForDrawingScreen(page);
    await page.mouse.move(early.late.x, early.late.y, { steps: STEPS });
    await page.mouse.up();
    await expect
      .poll(() => inkedPixelsSince(page, early.afterLive, early.blank.afterLive))
      .toBeGreaterThan(0);

    await openDrawer(page);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    await expect.poll(() => inkedPixelsSince(page, early.afterLive, early.blank.afterLive)).toBe(0);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });
});
