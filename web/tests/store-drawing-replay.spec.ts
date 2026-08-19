import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

import {
  drawInstructionScene,
  type InstructionScene,
} from '../../tools/store-drawings/lib/drawing-instructions.mjs';
import { softColorMetrics } from '../../tools/store-drawings/evaluate-drawing-fidelity.mjs';
import { gotoApp, renderedCanvasHandle } from './helpers';

const EQUIVALENCE_SCENE: InstructionScene = {
  width: 300,
  height: 180,
  colors: [
    { kind: 'picker', hex: '#E63946' },
    { kind: 'picker', hex: '#2196F3' },
  ],
  strokes: [
    { color: 0, size: 2, points: [20, 30, 90, 80, 150, 35] },
    { color: 1, size: 4, points: [45, 145, 120, 105, 220, 150, 275, 95] },
    { color: 0, size: 3, points: [230, 25, 265, 50] },
  ],
};
// Separate canvases can differ at anti-aliased edges without changing visible ink.
const MIN_REPLAY_SOFT_FIDELITY = 0.9998;

async function renderedCanvasPixels(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    const dataUrl = await canvas.evaluate((element) => element.toDataURL('image/png'));
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { rgba: data, width: info.width, height: info.height };
  } finally {
    await canvas.dispose();
  }
}

test('the store replay seam commits an engine-rendered stroke without a live pointer', async ({
  page,
}) => {
  await gotoApp(page);
  const before = await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots ?? -1);

  await page.evaluate(() => {
    if (!window.__replayStroke) throw new Error('Store drawing replay seam is unavailable');
    window.__replayStroke({
      color: { kind: 'picker', hex: '#E63946' },
      points: [
        { x: 100, y: 100 },
        { x: 140, y: 140 },
        { x: 180, y: 100 },
      ],
      size: 3,
    });
  });

  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots ?? -1))
    .toBe(before + 1);
  const command = await page.evaluate(
    () => window.__drawingDebug?.getDrawingWorkDebug()?.lastCommand ?? null
  );
  expect(command?.inputOps).toBe(3);
  await expect(page.locator('.brush-ring')).toHaveCount(0);
});

test('pointer and engine replay render the same compiled scene', async ({ context, page }) => {
  const enginePage = await context.newPage();
  await Promise.all([gotoApp(page), gotoApp(enginePage)]);
  await page.locator('.drawer-toggle').click();
  await expect(page.locator('#strokeWidthButton')).toBeVisible();
  const [pointerBox, engineBox] = await Promise.all([
    page.locator('#drawingCanvas').boundingBox(),
    enginePage.locator('#drawingCanvas').boundingBox(),
  ]);
  if (!pointerBox || !engineBox) throw new Error('Drawing canvas is unavailable');

  await Promise.all([
    drawInstructionScene(page, pointerBox, EQUIVALENCE_SCENE),
    drawInstructionScene(enginePage, engineBox, EQUIVALENCE_SCENE, { replay: 'engine' }),
  ]);
  const [pointer, engine] = await Promise.all([
    renderedCanvasPixels(page),
    renderedCanvasPixels(enginePage),
  ]);
  const fidelity = softColorMetrics(pointer, engine);

  expect(fidelity.iou).toBeGreaterThan(MIN_REPLAY_SOFT_FIDELITY);
  expect(fidelity.recall).toBeGreaterThan(MIN_REPLAY_SOFT_FIDELITY);
  expect(fidelity.precision).toBeGreaterThan(MIN_REPLAY_SOFT_FIDELITY);
});
