import { count, drawStroke, expect, state, test } from './engine-harness';

test('the eraser removes pixels and re-scans empty on stroke end', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 80 },
    { x: 140, y: 80 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  // Switch to a wide eraser and sweep over the whole stroke with margin.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 40, y: 80 },
    { x: 160, y: 80 },
  ]);

  // stopDrawing re-scans the bitmap after an erase, so the empty flag tracks it.
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('erasing only part of the drawing leaves the canvas non-empty', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // Two well-separated strokes.
  await drawStroke(page, box, [
    { x: 40, y: 50 },
    { x: 120, y: 50 },
  ]);
  await drawStroke(page, box, [
    { x: 40, y: 230 },
    { x: 120, y: 230 },
  ]);
  expect((await state(page)).canvasEmpty).toBe(false);

  // Erase only the top stroke.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 30, y: 50 },
    { x: 130, y: 50 },
  ]);

  expect(await count(page)).toBeGreaterThan(0); // bottom stroke survives
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('undoing an eraser stroke replays the erased pixels back', async ({ page }) => {
  // Undo must revert a destination-out stroke like any other: the pre-erase
  // snapshot (ADR-0066) still holds the pen stroke's pixels, so restoring it
  // brings the erased pixels back and the canvas is non-empty again.
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 80 },
    { x: 200, y: 80 },
  ]);
  const drawn = await count(page);
  expect(drawn).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 40, y: 80 },
    { x: 220, y: 80 },
  ]);
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  // The erase is reverted — the original pen stroke is back, pixel-for-pixel.
  expect(await count(page)).toBe(drawn);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true); // the pen stroke remains undoable
});
