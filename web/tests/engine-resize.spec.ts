import { count, drawStroke, expect, state, test } from './engine-harness';

test('a dense zigzag survives a resize, repainted from the paper raster', async ({ page }) => {
  // A resize wipes the visible backing store; the repaint is one blit of the
  // committed paper — the drawing must still be there afterward.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The drawing persists after the resize, repainted from the paper.
  expect(await count(page)).toBeGreaterThan(0);

  // And it still undoes as a single unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a back-and-forth scribble keeps its full extent after a rebuild (tip fidelity)', async ({
  page,
}) => {
  // The resize repaint blits the committed paper, so the scribble's tips must
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
  // The rebuild is a blit of the committed paper, so a hook's sharp corner must
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
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // Pixels near the origin (where the stroke is) must persist after the resize.
  expect(await count(page)).toBeGreaterThan(0);
  const alpha = await page.evaluate(() => window.__engine.pixelAt(70, 30)[3]);
  expect(alpha).toBeGreaterThan(0);
});

test('a stroke in progress survives a mid-stroke resize and undoes as one unit', async ({
  page,
}) => {
  // The rebuild blits the committed paper, but a stroke still being drawn has
  // an uncommitted activeCommand (recorded, not yet folded). The resize must
  // repaint it too, so the in-flight stroke isn't dropped — and the whole
  // stroke remains a single undo unit afterwards.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100);

  // Resize while the finger is still down (the stroke is mid-flight).
  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The portion drawn before the resize is still on the canvas.
  expect(await page.evaluate(() => window.__engine.pixelAt(40, 40)[3])).toBeGreaterThan(0);

  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);

  // One stroke → one command: a single undo clears it back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});
