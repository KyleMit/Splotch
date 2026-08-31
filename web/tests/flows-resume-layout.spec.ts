// Resume-before-layout on the real `/` route, where the product's visibility
// lifecycle and tiled renderer meet. The bare engine harness shares the live
// surface but does not reproduce this route integration.
import { expect, test, type Page } from '@playwright/test';

import { LIVE_TILE_COLUMNS, LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';
import { openDrawer } from './flows-harness';
import { draw, gotoApp, renderedCanvasHandle } from './helpers';

// The backing-store size of every production live tile. This is the surface the
// bug destroyed: a rect with no area resized every tile to zero, after which
// ops rendered into nothing.
function tileBackingSizes(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]')).map(
      (tile) => [tile.width, tile.height] as [number, number]
    )
  );
}

// The paper area the tile grid covers, summed off the tiles' own backing
// stores: the row-major grid partitions the paper exactly, so this is the
// geometry the engine last built from — an absolute value rather than a
// "changed since boot" comparison, which a settling boot could satisfy on its
// own.
async function tileGridSpan(page: Page) {
  const sizes = await tileBackingSizes(page);
  return {
    width: sizes.slice(0, LIVE_TILE_COLUMNS).reduce((total, [width]) => total + width, 0),
    height: sizes
      .filter((_, index) => index % LIVE_TILE_COLUMNS === 0)
      .reduce((total, [, height]) => total + height, 0),
  };
}

async function opaquePixelCount(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((element) => {
      if (element.width === 0 || element.height === 0) return 0;
      const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height);
      let count = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count++;
      return count;
    });
  } finally {
    await canvas.dispose();
  }
}

// Drive the engine through a re-entry whose rect has no area yet, then let the
// layout arrive. Hiding the canvas is the cheapest faithful way to make
// getBoundingClientRect() report no area, and the visibilitychange that follows
// is the app's actual resume signal — the one resyncOnReentry rebuilds from,
// synchronously. Restoring the box fires nothing of its own: no resize, no
// scroll, no second visibilitychange, so the engine has to notice on its own.
//
// `layout` gives the canvas a different box than it had, which only the
// deferred re-measure can adopt. It is an inline size the app's own flex layout
// would never produce — the engine reads nothing but the canvas's rect, so it
// is the narrowest way to change the geometry, but it does displace the chrome
// around it. Omit it when the test needs the real layout intact.
async function resumeBeforeLayout(page: Page, layout?: { width: number; height: number }) {
  await page.evaluate(() => {
    document.getElementById('drawingCanvas')!.style.display = 'none';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate((size) => {
    const canvas = document.getElementById('drawingCanvas')!;
    if (size) {
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }
    canvas.style.removeProperty('display');
  }, layout);
}

test('the production live tiles recover a real layout that arrives after the resume', async ({
  page,
}) => {
  await gotoApp(page);
  expect(await tileBackingSizes(page)).toHaveLength(LIVE_TILE_COUNT);

  const recovered = { width: 900, height: 640 };
  await resumeBeforeLayout(page, recovered);

  // Only the deferred re-measure can reconcile the tiles with a box the engine
  // never saw, so the grid arriving at exactly that geometry IS the recovery —
  // the guard alone would leave the tiles on their pre-collapse boot layout,
  // and the collapse itself would have taken them to zero.
  await expect.poll(() => tileGridSpan(page)).toEqual(recovered);
  expect((await tileBackingSizes(page)).every(([w, h]) => w > 0 && h > 0)).toBe(true);

  // And the recovered surface takes production pointer input.
  await draw(page, [
    { x: 60, y: 60 },
    { x: 240, y: 120 },
  ]);
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);
});

test('a drawing and its undo survive a resume that beats the layout pass', async ({ page }) => {
  await gotoApp(page);
  // The undo button lives in the Actions Panel drawer.
  await openDrawer(page);
  await draw(page, [
    { x: 60, y: 80 },
    { x: 260, y: 80 },
  ]);
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);
  const drawn = await opaquePixelCount(page);
  const undo = page.locator('#undoButton');
  await expect(undo).toBeEnabled();

  // The real layout stays intact here so the chrome (the undo button) is
  // reachable, which leaves no changed geometry to observe: this is a survival
  // regression, not a second proof of the re-measure. The test above pins that.
  await resumeBeforeLayout(page);

  // The stroke is still on the tiles.
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);

  // A fresh stroke still paints. This is what the collapsed view broke: it
  // scaled the paper presentation to zero, so pointer coordinates mapped
  // through a degenerate transform and every later stroke landed nowhere.
  await draw(page, [
    { x: 60, y: 200 },
    { x: 260, y: 200 },
  ]);
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(drawn);

  // Both strokes still undo, in order, back to a blank canvas.
  await undo.click();
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);
  await undo.click();
  await expect.poll(() => opaquePixelCount(page)).toBe(0);
  await expect(undo).toBeDisabled();
});
