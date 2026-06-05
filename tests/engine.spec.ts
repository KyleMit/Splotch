import { expect, test, type Page } from '@playwright/test';

// Engine-level tests. These drive the real imperative drawing engine through
// the /dev/engine harness (see src/routes/dev/engine), which mounts a real
// <canvas> via the same initDrawingCanvas() seam the app uses and exposes the
// engine API + pixel readers on window. Strokes are real Playwright pointer
// input on the canvas; undo/clear are invoked the way the app's buttons do.

/** Drag a stroke through the given canvas-space points using real mouse input. */
async function drawStroke(
  page: Page,
  box: { x: number; y: number } | null,
  points: { x: number; y: number }[]
) {
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    await page.mouse.move(box.x + p.x, box.y + p.y);
  }
  await page.mouse.up();
}

const state = (page: Page) => page.evaluate(() => window.__engineState);
const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());

test.beforeEach(async ({ page }) => {
  // Navigate ONCE, then poll for readiness. The harness sets window.__engineReady
  // in onMount; on a cold Vite server the first load triggers a dep-optimize
  // full-reload, so we ride through it by polling (swallowing the brief
  // "execution context destroyed" while the reload is in flight). We must NOT
  // re-navigate while polling — a fresh goto each retry keeps interrupting the
  // reload before onMount can finish, which never converges.
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page
      .evaluate(() => window.__engineReady === true)
      .catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});

test('a stroke paints pixels and flips canvasEmpty false', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  await drawStroke(page, box, [{ x: 60, y: 60 }, { x: 160, y: 120 }]);

  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('undo reverts a stroke back to an empty canvas', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [{ x: 50, y: 50 }, { x: 150, y: 150 }]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // The single pre-stroke snapshot was consumed, so there's nothing left to undo.
  expect(s.canUndo).toBe(false);
});

test('the undo stack caps at 10 — you cannot undo all the way past the cap', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // 12 distinct strokes → 12 pre-stroke snapshots pushed, but only the last 10
  // are retained (MAX_UNDO_STACK_SIZE).
  for (let i = 0; i < 12; i++) {
    const y = 20 + i * 20;
    await drawStroke(page, box, [{ x: 30, y }, { x: 270, y }]);
  }

  let undos = 0;
  while (await page.evaluate(() => window.__engineState.canUndo)) {
    await page.evaluate(() => window.__engine.undo());
    undos++;
    if (undos > 20) break; // safety net against an unbounded stack regression
  }

  expect(undos).toBe(10);
  // Two strokes predate the retained snapshots, so the canvas can't reach blank.
  expect(await count(page)).toBeGreaterThan(0);
});

test('clearing the canvas is itself undoable', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [{ x: 60, y: 60 }, { x: 200, y: 200 }]);
  const drawn = await count(page);
  expect(drawn).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
  expect((await state(page)).canUndo).toBe(true); // clear pushed a snapshot

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0); // the drawing came back
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('the eraser removes pixels and re-scans empty on stroke end', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [{ x: 60, y: 80 }, { x: 140, y: 80 }]);
  expect(await count(page)).toBeGreaterThan(0);

  // Switch to a wide eraser and sweep over the whole stroke with margin.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [{ x: 40, y: 80 }, { x: 160, y: 80 }]);

  // stopDrawing re-scans the bitmap after an erase, so the empty flag tracks it.
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('erasing only part of the drawing leaves the canvas non-empty', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // Two well-separated strokes.
  await drawStroke(page, box, [{ x: 40, y: 50 }, { x: 120, y: 50 }]);
  await drawStroke(page, box, [{ x: 40, y: 230 }, { x: 120, y: 230 }]);
  expect((await state(page)).canvasEmpty).toBe(false);

  // Erase only the top stroke.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [{ x: 30, y: 50 }, { x: 130, y: 50 }]);

  expect(await count(page)).toBeGreaterThan(0); // bottom stroke survives
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('a color change debounces the immediately-following touch/mouse stroke', async ({ page }) => {
  // Same synchronous tick as the color change → < 100ms → the mouse stroke is
  // dropped (prevents color-bleed artifacts right after picking a color).
  const dropped = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync([{ x: 60, y: 60 }, { x: 200, y: 60 }], 'mouse');
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  // Past the 100ms window, the same stroke paints.
  await page.waitForTimeout(150);
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync([{ x: 60, y: 60 }, { x: 200, y: 60 }], 'mouse');
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('a pen pointer bypasses the color-change debounce', async ({ page }) => {
  // pointerType 'pen' has requiredDelay 0 — a stylus stroke right after a color
  // change must paint immediately (a child drawing fast shouldn't drop strokes).
  const painted = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync([{ x: 60, y: 60 }, { x: 200, y: 60 }], 'pen');
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('the drawing survives a canvas resize (virtual-canvas preservation)', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [{ x: 30, y: 30 }, { x: 120, y: 30 }]);
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // Pixels near the origin (where the stroke is) must persist after the resize.
  expect(await count(page)).toBeGreaterThan(0);
  const alpha = await page.evaluate(() => window.__engine.pixelAt(70, 30)[3]);
  expect(alpha).toBeGreaterThan(0);
});
