import type { Page, Route } from '@playwright/test';
import sharp from 'sharp';
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
  PAPER_INPUT_TEST_ID,
} from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import { openDrawer } from '../support/group-a.ts';

// The app's script bundles, which a slow connection delivers after the prerendered first frame has
// painted. Holding them keeps the page where a child's first touch can land: on a paper whose
// engine is not listening yet.
const SCRIPT_BUNDLES = '**/_expo/static/js/**';
const RGB_CHANNELS = 3;
const INK_CHANNEL_DELTA = 48;
const STEPS = 6;
const REGION_PADDING_PX = 24;
const EARLY_STRETCH = 0.4;

type Spot = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };

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

async function pixelsOf(page: Page, region: Region) {
  return sharp(await page.screenshot({ clip: region }))
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function inkedPixelsIn(page: Page, region: Region, before: Buffer) {
  const after = await pixelsOf(page, region);
  let inked = 0;
  for (let offset = 0; offset < before.length; offset += RGB_CHANNELS) {
    const delta = Math.max(
      Math.abs(before[offset] - after[offset]),
      Math.abs(before[offset + 1] - after[offset + 1]),
      Math.abs(before[offset + 2] - after[offset + 2])
    );
    if (delta > INK_CHANNEL_DELTA) inked++;
  }
  return inked;
}

function regionAround(from: Spot, to: Spot): Region {
  const left = Math.min(from.x, to.x) - REGION_PADDING_PX;
  const top = Math.min(from.y, to.y) - REGION_PADDING_PX;
  return {
    x: left,
    y: top,
    width: Math.abs(from.x - to.x) + 2 * REGION_PADDING_PX,
    height: Math.abs(from.y - to.y) + 2 * REGION_PADDING_PX,
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
    const beforeLive = regionAround(press, {
      x: press.x + (early.x - press.x) * EARLY_STRETCH,
      y: press.y + (early.y - press.y) * EARLY_STRETCH,
    });
    const afterLive = regionAround(early, late);
    const blank = {
      beforeLive: await pixelsOf(page, beforeLive),
      afterLive: await pixelsOf(page, afterLive),
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
      .poll(() => inkedPixelsIn(page, early.afterLive, early.blank.afterLive))
      .toBeGreaterThan(0);
    expect(await inkedPixelsIn(page, early.beforeLive, early.blank.beforeLive)).toBe(0);
  });

  test('lets Undo take that stroke back as one step', async ({ page }) => {
    const early = await pressBeforeLive(page);
    await early.bundles.release();
    await waitForDrawingScreen(page);
    await page.mouse.move(early.late.x, early.late.y, { steps: STEPS });
    await page.mouse.up();
    await expect
      .poll(() => inkedPixelsIn(page, early.afterLive, early.blank.afterLive))
      .toBeGreaterThan(0);

    await openDrawer(page);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    await expect.poll(() => inkedPixelsIn(page, early.afterLive, early.blank.afterLive)).toBe(0);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });
});
