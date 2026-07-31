import { expect, test } from '@playwright/test';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';
import { openDrawer } from './flows-harness';
import { draw, gotoApp, renderedCanvasHandle } from './helpers';

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
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().liveRasters), {
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
