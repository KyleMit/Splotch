import { count, drawStroke, expect, state, test } from './engine-harness';

test('a stroke paints pixels and flips canvasEmpty false', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 160, y: 120 },
  ]);

  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('undo reverts a stroke back to an empty canvas', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 50, y: 50 },
    { x: 150, y: 150 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // The only stroke was undone back to the blank paper — nothing left to undo.
  expect(s.canUndo).toBe(false);
});

test('undo preserves and rebases a stroke that is still in progress', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
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

  let s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('the undo stack caps at 20 — you cannot undo all the way past the cap', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // 22 distinct strokes → 22 snapshots pushed, but only the last 20 are
  // retained (MAX_UNDO_DEPTH); the older two drop off the stack while
  // their ink stays on the paper.
  for (let i = 0; i < 22; i++) {
    const y = 14 + i * 12;
    await drawStroke(page, box, [
      { x: 30, y },
      { x: 270, y },
    ]);
  }

  let undos = 0;
  while (await page.evaluate(() => window.__engineState.canUndo)) {
    await page.evaluate(() => window.__engine.undo());
    undos++;
    if (undos > 30) break; // safety net against an unbounded stack regression
  }

  expect(undos).toBe(20);
  // The two overflow strokes stay on the paper, so the canvas can't reach blank.
  expect(await count(page)).toBeGreaterThan(0);
});

test('clearing the canvas is itself undoable', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  const drawn = await count(page);
  expect(drawn).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
  expect((await state(page)).canUndo).toBe(true); // clear pushed an undo command

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0); // the drawing came back
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('a clear during an in-flight stroke does not resurrect the wiped ink on rebuild', async ({
  page,
}) => {
  // Reachable in the app: drag-to-clear releases pointers at drag *start* but
  // fires onClear at drag *end*, so a second finger can be mid-stroke when the
  // clear lands. The stroke's pre-clear ops must not survive into the command
  // that commits after the clear, or the fold (and any repaint of the still-
  // uncommitted stroke) would repaint ink the user saw erased.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Stroke along the top edge, held down...
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40);

  // ...clear fires mid-gesture and wipes it...
  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);

  // ...and the same stroke continues elsewhere before lifting.
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.move(box.x + 260, box.y + 200);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false); // post-clear ink counts as content

  // Undoing a later stroke restores the snapshot taken after the clear + the
  // straddling stroke.
  await drawStroke(page, box, [
    { x: 200, y: 260 },
    { x: 260, y: 260 },
  ]);
  await page.evaluate(() => window.__engine.undo());

  const preClearPixel = await page.evaluate(() => window.__engine.pixelAt(60, 40));
  expect(preClearPixel[3]).toBe(0); // the wiped top-edge ink stayed gone
  expect(await count(page)).toBeGreaterThan(0); // the post-clear segment survived

  // Undoing the straddling stroke lands back on the cleared (empty) canvas.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a moderate stroke is one snapshot and undoes cleanly', async ({ page }) => {
  // One gesture → one snapshot on the undo stack, whatever the op volume.
  // strokeSync gives a deterministic one-seg-per-move op stream.
  const points = Array.from({ length: 120 }, (_, i) => ({
    x: 20 + i * 2,
    y: 150 + Math.round(60 * Math.sin(i / 40)),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.snapshots).toBe(1);

  // Still one undo unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a pathological all-corners gesture is still one snapshot and one undo step', async ({
  page,
}) => {
  // A gesture that is genuinely all direction changes produces hundreds of raw
  // ops. The stack must stay one snapshot per gesture (this exact shape used to
  // trigger the ADR-0035 keyframe safety net; snapshots make it the same cost
  // as any other stroke) and undo must revert it in one blit.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.snapshots).toBe(1);

  // Undo still reverts the whole gesture in one step, back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a multi-touch gesture undoes as a single unit', async ({ page }) => {
  // Two fingers drawing together form one stroke group → one command, so a
  // single undo must remove both strokes (not just the last finger's).
  await page.evaluate(() => {
    window.__engine.multiStrokeSync([
      {
        pointerId: 1,
        points: [
          { x: 40, y: 60 },
          { x: 240, y: 60 },
        ],
      },
      {
        pointerId: 2,
        points: [
          { x: 40, y: 200 },
          { x: 240, y: 200 },
        ],
      },
    ]);
  });
  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false); // the whole group was one undo step
});

test('undo still works after a canvas resize (restore onto the grown paper)', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));
  expect(await count(page)).toBeGreaterThan(0); // survived the resize

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});
