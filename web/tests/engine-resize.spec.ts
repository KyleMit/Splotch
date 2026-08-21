import { count, drawStroke, expect, state, test } from './engine-harness';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';

test('a dense zigzag survives a resize, repainted from tiled history', async ({ page }) => {
  // A resize rebuilds the live tiles from retained history, so the drawing
  // must still be there afterward.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The drawing persists after the resize, repainted from tiled history.
  expect(await count(page)).toBeGreaterThan(0);

  // And it still undoes as a single unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a back-and-forth scribble keeps its full extent after a rebuild (tip fidelity)', async ({
  page,
}) => {
  // The resize repaint rebuilds from retained history, so the scribble's tips must
  // survive exactly (the ADR-0036 simplification era shrank them ~25% until the
  // curve family was fixed; a blit can't shrink anything — this pins that).
  const pts: { x: number; y: number }[] = [{ x: 50, y: 40 }];
  let y = 40;
  let dir = 1;
  for (let s = 0; s < 8; s++) {
    const from = dir > 0 ? 50 : 250;
    const to = dir > 0 ? 250 : 50;
    for (let i = 1; i <= 20; i++) {
      y += 1.4;
      pts.push({ x: from + (to - from) * (i / 20), y });
    }
    dir *= -1;
  }
  await page.evaluate((p) => window.__engine.strokeSync(p), pts);

  const before = await page.evaluate(() => window.__engine.inkBounds());
  if (!before) throw new Error('nothing drawn');

  // Force a repaint of the visible canvas from the paper raster.
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const after = await page.evaluate(() => window.__engine.inkBounds());
  if (!after) throw new Error('rebuild produced an empty canvas');

  // The horizontal span survives — the tips still reach (the old undershoot
  // shrank this by tens of px; allow only a few px of antialiasing slack).
  expect(after.maxX).toBeGreaterThanOrEqual(before.maxX - 4);
  expect(after.minX).toBeLessThanOrEqual(before.minX + 4);
});

test('a sharp corner stays sharp and in place after a rebuild (corner fidelity)', async ({
  page,
}) => {
  // The rebuild replays retained history, so a hook's sharp corner must
  // keep its exact reach (the simplification era could round and displace it by
  // tens of px). Draw the hook, rebuild, and check the corner's reach.
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) pts.push({ x: 40 + i * 3, y: 150 }); // long horizontal arm
  for (let i = 1; i <= 18; i++) pts.push({ x: 220 - i * 2, y: 150 - i * 6 }); // sharp hook up-left
  await page.evaluate((p) => window.__engine.strokeSync(p), pts);

  const before = await page.evaluate(() => window.__engine.inkBounds());
  if (!before) throw new Error('nothing drawn');
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const after = await page.evaluate(() => window.__engine.inkBounds());
  if (!after) throw new Error('rebuild produced an empty canvas');

  // The corner (top of the hook) keeps its reach — a rounded corner would pull
  // the top edge down by tens of px.
  expect(after.minY).toBeLessThanOrEqual(before.minY + 4);
  expect(after.maxX).toBeGreaterThanOrEqual(before.maxX - 4);
});

test('the drawing survives a canvas resize (virtual-canvas preservation)', async ({ page }) => {
  const box = await page.locator('#drawingCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The original paper can become contain-fit in the resized viewport. Sample
  // the same paper point through the engine's published presentation transform.
  expect(await count(page)).toBeGreaterThan(0);
  const alpha = await page.evaluate(() => window.__engine.pixelAt(70, 30)[3]);
  expect(alpha).toBeGreaterThan(0);
});

test('a stroke in progress survives a mid-stroke resize and undoes as one unit', async ({
  page,
}) => {
  // The rebuild replays retained history, but a stroke still being drawn has
  // an uncommitted activeCommand (recorded, not yet folded). The resize must
  // repaint it too, so the in-flight stroke isn't dropped — and the whole
  // stroke remains a single undo unit afterwards.
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, [
    { x: 40, y: 100 },
    { x: 180, y: 100 },
  ]);

  await page.mouse.move(box.x + 80, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 160);

  // Resize while the finger is still down (the stroke is mid-flight).
  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // Sample the in-flight stroke at its distinct paper position so the earlier
  // committed stroke cannot make this survival check pass on its own.
  const inFlightAlpha = await page.evaluate(() => window.__engine.pixelAt(110, 160)[3]);
  expect(inFlightAlpha).toBeGreaterThan(0);

  await page.mouse.move(box.x + 220, box.y + 160);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);

  // Undoing the rebuilt in-flight stroke restores the earlier command instead
  // of a twice-cropped transparent patch.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('a resume that beats the layout pass leaves the canvas drawable', async ({ page }) => {
  // The visibilitychange a re-entry fires can land before the WebView has
  // re-laid out, so the canvas reports a client rect with no area. Adopting one
  // collapsed the paper and every live tile to zero, and nothing re-ran the
  // rebuild afterwards: the app came back fully responsive — colors switched,
  // buttons worked — with a canvas that silently ate every stroke until reload.
  await page.evaluate(() => window.__engine.resumeTo(0, 0));

  // The unmeasured rect is refused outright, so the paper is still the paper.
  expect((await page.evaluate(() => window.__engine.getViewState())).paperCssWidth).toBe(300);

  // Layout settles at a DIFFERENT size, with no event of its own. Restoring the
  // original 300×300 would assert nothing: the guard above already preserved
  // those values, so every check would pass with the deferred re-measure
  // removed. Only a geometry the engine has not seen can distinguish the two.
  await page.evaluate(() => window.__engine.layoutTo(500, 400));
  await expect
    .poll(async () => (await page.evaluate(() => window.__engine.getViewState())).paperCssWidth)
    .toBe(500);

  const box = await page.locator('#drawingCanvas').boundingBox();
  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  await expect.poll(() => count(page)).toBeGreaterThan(0);
});

test('a drawing survives a resume that beats the layout pass', async ({ page }) => {
  // Same unmeasured rect, but with ink on the canvas: the paper is kept and
  // presented through the reported viewport, so a zero box scaled the view to
  // nothing and mapped every later stroke through a degenerate transform.
  await page.evaluate(() =>
    window.__engine.strokeSync([
      { x: 40, y: 100 },
      { x: 180, y: 100 },
    ])
  );
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resumeTo(0, 0));
  await page.evaluate(() => window.__engine.layoutTo(500, 400));

  // The 300×300 paper is kept and contain-fit into the larger box, so the
  // recovered view scales it up — a value that only the deferred re-measure can
  // produce, where the collapsed view scaled it to nothing.
  await expect
    .poll(async () => (await page.evaluate(() => window.__engine.getViewState())).scale)
    .toBeGreaterThan(1);
  expect((await page.evaluate(() => window.__engine.getViewState())).paperCssWidth).toBe(300);

  // The stroke came through the rebuild, and the recovered transform still maps
  // new input onto the paper.
  await expect.poll(() => count(page)).toBeGreaterThan(0);
  const box = await page.locator('#drawingCanvas').boundingBox();
  await drawStroke(page, box, [
    { x: 80, y: 220 },
    { x: 220, y: 220 },
  ]);
  await expect.poll(() => count(page)).toBeGreaterThan(before);
});

test('a resume rebuilds live tiles whose canvas state was reset while hidden', async ({ page }) => {
  await page.evaluate(() =>
    window.__engine.strokeSync([
      { x: 40, y: 70 },
      { x: 260, y: 70 },
    ])
  );
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => {
    for (const tile of document.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]')) {
      const currentWidth = tile.width;
      tile.width = currentWidth;
    }
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect.poll(() => count(page)).toBe(before);
  const transforms = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]'), (tile) => {
      const transform = tile.getContext('2d')!.getTransform();
      return [transform.e, transform.f];
    })
  );
  expect(transforms).toEqual([
    [0, 0],
    [-75, 0],
    [-150, 0],
    [-225, 0],
    [0, -75],
    [-75, -75],
    [-150, -75],
    [-225, -75],
    [0, -150],
    [-75, -150],
    [-150, -150],
    [-225, -150],
    [0, -225],
    [-75, -225],
    [-150, -225],
    [-225, -225],
  ]);
});

test('a reset context plus stale resume geometry replays retained history once', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.__engine.strokeSync([
      { x: 40, y: 70 },
      { x: 260, y: 70 },
    ])
  );
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  const clearCalls = await page.evaluate(() => {
    for (const tile of document.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]')) {
      const currentWidth = tile.width;
      tile.width = currentWidth;
    }
    const prototype = CanvasRenderingContext2D.prototype;
    const originalClearRect = prototype.clearRect;
    let calls = 0;
    prototype.clearRect = function (...args) {
      calls++;
      return originalClearRect.apply(this, args);
    };
    try {
      window.__engine.resumeTo(500, 400);
      return calls;
    } finally {
      prototype.clearRect = originalClearRect;
    }
  });

  expect(clearCalls).toBe(LIVE_TILE_COUNT);
  expect(await count(page)).toBe(before);
});
