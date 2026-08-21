import { count, drawStroke, expect, state, test } from './engine-harness';

test('undo preserves a stroke that is still in progress', async ({ page }) => {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, [
    { x: 40, y: 120 },
    { x: 200, y: 120 },
  ]);

  await page.mouse.move(box.x + 80, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120);

  await page.evaluate(() => window.__engine.undo());

  expect(await page.evaluate(() => window.__engine.pixelAt(60, 120)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(120, 120)[3])).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false);

  await page.mouse.up();
  expect((await state(page)).canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  await expect.poll(() => count(page)).toBe(0);
  await expect.poll(async () => (await state(page)).canvasEmpty).toBe(true);
  expect((await state(page)).canUndo).toBe(false);
});

test('clearing the canvas is itself undoable', async ({ page }) => {
  const box = await page.locator('#drawingCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
  expect((await state(page)).canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('undo on an unchanged paper skips the resize path', async ({ page }) => {
  await page.evaluate(() => {
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 200, y: 200 },
    ]);
    window.__engine.clearCanvas();
  });

  const resizeMeasurements = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#drawingCanvas');
    if (!canvas) throw new Error('canvas not found');
    const original = canvas.getBoundingClientRect;
    let measurements = 0;
    canvas.getBoundingClientRect = () => {
      measurements++;
      return original.call(canvas);
    };
    await window.__engine.undo();
    canvas.getBoundingClientRect = original;
    return measurements;
  });

  expect(resizeMeasurements).toBe(0);
  await expect.poll(() => count(page)).toBeGreaterThan(0);
});

test('undo restores the recorded paper after a blank rotation', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__engine.resizeTo(400, 300);
    window.__engine.strokeSync([
      { x: 330, y: 150 },
      { x: 380, y: 150 },
    ]);
    window.__engine.clearCanvas();
    window.__engine.setScreenAngleOverride(90);
    await window.__engine.resizeTo(300, 400);
  });

  expect((await state(page)).canvasEmpty).toBe(true);
  expect(await count(page)).toBe(0);

  await page.evaluate(() => window.__engine.undo());

  await expect.poll(() => count(page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.getViewState())).toMatchObject({
    active: true,
    scale: 0.75,
    paperCssWidth: 400,
    paperCssHeight: 300,
    paperOrientation: 'landscape',
  });
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('undo does not reveal stale pixels after an erase-to-empty command', async ({ page }) => {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, [
    { x: 16, y: 16 },
    { x: 34, y: 16 },
  ]);

  await page.evaluate(() => {
    window.__engine.setStrokeWidth(20);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 8, y: 16 },
    { x: 42, y: 16 },
  ]);
  await expect.poll(async () => (await state(page)).canvasEmpty).toBe(true);

  await page.evaluate(() => {
    window.__engine.setEraserMode(false);
    window.__engine.setStrokeWidth(8);
  });
  await drawStroke(page, box, [
    { x: 48, y: 60 },
    { x: 66, y: 60 },
  ]);

  await page.evaluate(() => window.__engine.undo());
  await page.evaluate(() => window.__engine.undo());

  expect(await page.evaluate(() => window.__engine.pixelAt(57, 60)[3])).toBe(0);
});

test('a clear during an in-flight stroke does not resurrect wiped ink', async ({ page }) => {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);

  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.move(box.x + 260, box.y + 200);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);

  await drawStroke(page, box, [
    { x: 200, y: 260 },
    { x: 260, y: 260 },
  ]);
  await page.evaluate(() => window.__engine.undo());

  expect(await page.evaluate(() => window.__engine.pixelAt(60, 40)[3])).toBe(0);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());
  await expect.poll(() => count(page)).toBe(0);
  await expect.poll(async () => (await state(page)).canvasEmpty).toBe(true);
});
