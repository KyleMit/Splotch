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
