import { expect, test } from '@playwright/test';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';
import { TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE } from '../src/lib/drawing/tiledRenderer';
import { openDrawer } from './flows-harness';
import { draw, firstOpaquePixel, gotoApp, renderedCanvasHandle } from './helpers';

test('tiled history folds its old prefix and retains twenty undo steps', async ({ page }) => {
  await gotoApp(page);
  const strokeCount = 23;
  for (let index = 0; index < strokeCount; index++) {
    const y = 80 + index * 20;
    await draw(page, [
      { x: 120, y },
      { x: 240, y },
    ]);
  }

  expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots)).toBe(20);
  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().baseRasters), {
      timeout: 4_000,
    })
    .toBe(LIVE_TILE_COUNT);

  await openDrawer(page);
  for (let index = 0; index < 20; index++) {
    await page.locator('#undoButton').click();
  }
  await expect(page.locator('#undoButton')).toBeDisabled();

  const rendered = await renderedCanvasHandle(page);
  try {
    const alphaByStroke = await rendered.evaluate((canvas, count) => {
      const input = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      const scale = canvas.width / input.getBoundingClientRect().width;
      const g = canvas.getContext('2d')!;
      return Array.from(
        { length: count },
        (_, index) => g.getImageData(180 * scale, (80 + index * 20) * scale, 1, 1).data[3]
      );
    }, strokeCount);
    expect(alphaByStroke.slice(0, 3).every((alpha) => alpha > 0)).toBe(true);
    expect(alphaByStroke.slice(3).every((alpha) => alpha === 0)).toBe(true);
  } finally {
    await rendered.dispose();
  }
});

test('tiled undo patches rebuild after the live canvas resizes', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 280, y: 180 },
  ]);
  await draw(page, [
    { x: 180, y: 240 },
    { x: 340, y: 300 },
  ]);

  const originalBytes = await page.evaluate(
    () => window.__drawingDebug?.getUndoDebug().rasterBytes
  );
  // A rotation CSS-presents the locked paper without resizing its tile
  // backings (ADR-0089). Use a material same-orientation resize to exercise the
  // backing and undo-patch rebuild path itself.
  await page.setViewportSize({ width: 800, height: 500 });
  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().rasterBytes))
    .not.toBe(originalBytes);

  await openDrawer(page);
  await page.locator('#undoButton').click();
  expect(await firstOpaquePixel(page)).not.toBeNull();
  await page.locator('#undoButton').click();
  expect(await firstOpaquePixel(page)).toBeNull();
});

test('canvas-spanning strokes shorten undo depth before exceeding the patch budget', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');

  for (let index = 0; index < 20; index++) {
    const forward = index % 2 === 0;
    await draw(page, [
      { x: box.width / 2, y: box.height / 2 },
      { x: forward ? 100 : box.width - 100, y: 100 },
      { x: forward ? box.width - 100 : 100, y: box.height - 100 },
    ]);
  }

  const debug = await page.evaluate(() => window.__drawingDebug?.getUndoDebug());
  const paperBytes = await page
    .locator('canvas[data-live-tile]')
    .evaluateAll((tiles: HTMLCanvasElement[]) =>
      tiles.reduce((bytes, canvas) => bytes + canvas.width * canvas.height * 4, 0)
    );
  expect(debug?.snapshots).toBeGreaterThanOrEqual(2);
  expect(debug?.snapshots).toBeLessThan(20);
  expect(debug?.rasterBytes).toBeLessThanOrEqual(
    paperBytes * TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE
  );

  await openDrawer(page);
  for (let index = 0; index < debug!.snapshots; index++) {
    await page.locator('#undoButton').click();
  }
  await expect(page.locator('#undoButton')).toBeDisabled();
  expect(await firstOpaquePixel(page)).not.toBeNull();
});
