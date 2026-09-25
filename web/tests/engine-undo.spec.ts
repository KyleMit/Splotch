import { count, drawStroke, expect, state, test } from './engine-harness';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';

// The resize inside undo's paper pre-restore used to trigger a full history
// repaint whose replay runs through the clear being popped, immediately
// overwritten by the snapshot restore (issue 1198). Measured through this exact
// scenario: 48 clearRect / 32 drawImage before the skip, 6 / 6 after, with
// byte-identical pixels — so a canvas-op count within one tile-count bounds the
// skip while any reintroduced replay blows straight past it.
test('undo of a clear after a blank rotation paints once, not once per history replay', async ({
  page,
}) => {
  const counts = await page.evaluate(async () => {
    await window.__engine.resizeTo(400, 300);
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 340, y: 200 },
    ]);
    window.__engine.clearCanvas();
    window.__engine.setScreenAngleOverride(90);
    await window.__engine.resizeTo(300, 400);
    const prototype = CanvasRenderingContext2D.prototype;
    const originalClearRect = prototype.clearRect;
    const originalDrawImage = prototype.drawImage;
    let clears = 0;
    let draws = 0;
    prototype.clearRect = function (...args: Parameters<typeof originalClearRect>) {
      clears++;
      return originalClearRect.apply(this, args);
    };
    prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...args: Parameters<typeof originalDrawImage>
    ) {
      draws++;
      return originalDrawImage.apply(this, args as never);
    } as typeof originalDrawImage;
    try {
      await window.__engine.undo();
    } finally {
      prototype.clearRect = originalClearRect;
      prototype.drawImage = originalDrawImage;
    }
    return { clears, draws, pixels: window.__engine.nonTransparentCount() };
  });

  expect(counts.pixels).toBeGreaterThan(0);
  expect(counts.clears).toBeLessThanOrEqual(LIVE_TILE_COUNT);
  expect(counts.draws).toBeLessThanOrEqual(LIVE_TILE_COUNT);
});

// The repaint skip is only valid for the synchronous call inside undo(). When
// the canvas box is unmeasured at undo time, the deferred rebuild fires after
// the undo's restore has already painted — and its backing wipe needs the
// repaint. Threading the skip flag into that retry left a permanently blank
// canvas that still reported canvasEmpty false (PR 1317's review).
test('undo with an unmeasured canvas box repaints when the box returns', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__engine.resizeTo(400, 300);
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 340, y: 200 },
    ]);
    window.__engine.clearCanvas();
    window.__engine.setScreenAngleOverride(90);
    await window.__engine.resizeTo(300, 400);
    window.__engine.layoutTo(0, 0);
    await window.__engine.undo();
  });

  await page.evaluate(() => window.__engine.layoutTo(300, 400));

  await expect.poll(() => count(page)).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false);
});

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

test('clearing a blank page records no undo step', async ({ page }) => {
  const historyLength = () =>
    page.evaluate(() => window.__engine.getUndoDebug().historyLength ?? 0);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect((await state(page)).canUndo).toBe(false);
  expect(await historyLength()).toBe(0);

  await page.evaluate(() => {
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 200, y: 200 },
    ]);
    window.__engine.clearCanvas();
  });
  const afterInkClear = await historyLength();

  await page.evaluate(() => {
    window.__engine.clearCanvas();
    window.__engine.clearCanvas();
  });
  expect(await historyLength()).toBe(afterInkClear);

  await page.evaluate(() => window.__engine.undo());
  await expect.poll(() => count(page)).toBeGreaterThan(0);
});

// Clearing is how a child asks the magic brush for a new hidden picture, so a
// blank-page clear keeps that even though it records nothing. Each clear pins
// the random pick to an opposite end of the gradient pool; a clear that kept
// the held gradient would paint the same stroke identically both times.
test('clearing a blank page still gives the magic brush a new picture', async ({ page }) => {
  await page.evaluate(() => window.__engine.setMagicMode(true));

  const pixelsAfterBlankClear = async (randomPick: number) => {
    await page.evaluate((pick) => {
      const random = Math.random;
      Math.random = () => pick;
      try {
        window.__engine.clearCanvas();
      } finally {
        Math.random = random;
      }
    }, randomPick);
    expect((await state(page)).canUndo).toBe(false);

    await page.evaluate(() =>
      window.__engine.strokeSync([
        { x: 40, y: 120 },
        { x: 360, y: 120 },
      ])
    );
    const band = () => page.evaluate(() => window.__engine.pixelsIn(40, 116, 320, 8));
    await expect.poll(async () => (await band()).some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    const pixels = await band();

    await page.evaluate(() => window.__engine.undo());
    await expect.poll(() => count(page)).toBe(0);
    return pixels;
  };

  const firstPicture = await pixelsAfterBlankClear(0);
  const secondPicture = await pixelsAfterBlankClear(0.9999);
  expect(secondPicture).not.toEqual(firstPicture);
});

// The eraser settles canvasEmpty on an idle timer, so a clear that lands before
// it fires has to settle it itself.
test('clearing right after erasing to blank records no undo step', async ({ page }) => {
  const result = await page.evaluate(() => {
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 80, y: 60 },
    ]);
    window.__engine.setStrokeWidth(100);
    window.__engine.setEraserMode(true);
    window.__engine.strokeSync([
      { x: 60, y: 60 },
      { x: 80, y: 60 },
    ]);
    const before = window.__engine.getUndoDebug().historyLength;
    window.__engine.clearCanvas();
    return {
      pixels: window.__engine.nonTransparentCount(),
      before,
      after: window.__engine.getUndoDebug().historyLength,
    };
  });

  expect(result.pixels).toBe(0);
  expect(result.after).toBe(result.before);
});

// A magic stroke drawn before its sheet is ready paints nothing yet, so the
// page reads blank to a pixel scan while it still holds ink the sheet will
// reveal. Clearing it must still record the clear, or that ink surfaces later.
test('clearing magic ink that has not revealed yet still clears it', async ({ page }) => {
  const result = await page.evaluate(() => {
    window.__engine.setMagicMode(true);
    window.__engine.strokeSync([
      { x: 40, y: 120 },
      { x: 360, y: 120 },
    ]);
    const unrevealedPixels = window.__engine.nonTransparentCount();
    window.__engine.setMagicMode(false);
    window.__engine.setEraserMode(true);
    window.__engine.strokeSync([
      { x: 40, y: 300 },
      { x: 80, y: 300 },
    ]);
    window.__engine.setEraserMode(false);
    const before = window.__engine.getUndoDebug().historyLength ?? 0;
    window.__engine.clearCanvas();
    return {
      unrevealedPixels,
      before,
      after: window.__engine.getUndoDebug().historyLength ?? 0,
    };
  });
  expect(result.unrevealedPixels).toBe(0);
  expect(result.after).toBe(result.before + 1);

  await page.evaluate(() => {
    window.__engine.setMagicMode(true);
    window.__engine.strokeSync([
      { x: 40, y: 220 },
      { x: 360, y: 220 },
    ]);
  });
  const band = (y: number) => page.evaluate((top) => window.__engine.pixelsIn(40, top, 320, 8), y);
  await expect.poll(async () => (await band(216)).some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  expect((await band(116)).some((v, i) => i % 4 === 3 && v > 0)).toBe(false);
});
