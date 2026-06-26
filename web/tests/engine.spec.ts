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
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});

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
  // The only command was undone back to the empty baseline — nothing left to undo.
  expect(s.canUndo).toBe(false);
});

test('the undo stack caps at 10 — you cannot undo all the way past the cap', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // 12 distinct strokes → 12 commands, but only the last 10 are retained
  // (MAX_UNDO_STACK_SIZE); the older two fold into the baseline.
  for (let i = 0; i < 12; i++) {
    const y = 20 + i * 20;
    await drawStroke(page, box, [
      { x: 30, y },
      { x: 270, y },
    ]);
  }

  let undos = 0;
  while (await page.evaluate(() => window.__engineState.canUndo)) {
    await page.evaluate(() => window.__engine.undo());
    undos++;
    if (undos > 20) break; // safety net against an unbounded stack regression
  }

  expect(undos).toBe(10);
  // Two strokes folded into the baseline, so the canvas can't reach blank.
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

test('a pointer resumed far away after an idle gap does not draw a connecting line', async ({
  page,
}) => {
  // iOS/WebKit can merge a fast tap-then-drag into one pointer stream, dropping
  // the pointerup + pointerdown and resuming the SAME pointer at a new spot.
  // Reproduce it directly: press, idle past the resume gap, then move far away
  // WITHOUT lifting — the engine must restart the stroke instead of bridging
  // the two spots with a stray line.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(box.x + 260, box.y + 260);
  await page.mouse.up();

  // The diagonal midpoint between the two spots stays blank — no connecting line.
  const midAlpha = await page.evaluate(() => window.__engine.pixelAt(150, 150)[3]);
  expect(midAlpha).toBe(0);
});

test('a color change debounces the immediately-following touch/mouse stroke', async ({ page }) => {
  // Same synchronous tick as the color change → < 100ms → the mouse stroke is
  // dropped (prevents color-bleed artifacts right after picking a color).
  const dropped = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'mouse'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  // Past the 100ms window, the same stroke paints.
  await page.waitForTimeout(150);
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'mouse'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('a pen pointer bypasses the color-change debounce', async ({ page }) => {
  // pointerType 'pen' has requiredDelay 0 — a stylus stroke right after a color
  // change must paint immediately (a child drawing fast shouldn't drop strokes).
  const painted = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'pen'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

// The harness canvas is 300×300 at the viewport origin (renderScale 1) — a
// square is treated as portrait (width ≤ height), so the bottom band
// (EDGE_SWIPE_BAND_PX = 24) is y ≥ 276. Portrait guards the bottom from
// orientation alone, needing no injected insets; landscape tests resize the
// canvas wider than tall.
test('in portrait a touch swiping up from the bottom edge is discarded as the OS gesture', async ({
  page,
}) => {
  const dropped = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 290 },
        { x: 60, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // A discarded swipe never snapshots, so the undo button stays disabled.
  expect(s.canUndo).toBe(false);
});

test('a touch starting at the bottom edge but moving sideways still draws', async ({ page }) => {
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 290 },
        { x: 220, y: 290 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('an upward touch that starts above the bottom band draws normally', async ({ page }) => {
  // Only the edge band is special — an upward stroke from mid-canvas is a real
  // stroke, not the system gesture.
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 150 },
        { x: 60, y: 90 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('a stationary tap at a guarded edge still leaves a dot', async ({ page }) => {
  // Lifting before the direction is decided is a tap, not a swipe, so it commits.
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync([{ x: 60, y: 290 }], 'touch');
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('in phone landscape the guard moves to the short side edges, not the long bottom', async ({
  page,
}) => {
  // A phone's physical-bottom navbar rotates to a short side edge in landscape.
  // No insets are injected — orientation alone guards both short edges, so this
  // works even where the OS exposes no safe-area insets.
  await page.evaluate(() => window.__engine.resizeTo(400, 300));

  // A swipe inward from the short left edge is the OS gesture → discarded.
  const fromSide = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 8, y: 150 },
        { x: 70, y: 150 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(fromSide).toBe(0);

  // A stroke swiping up from the long bottom edge is NOT the navbar gesture on a
  // phone in landscape, so it must still draw.
  const fromBottom = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 200, y: 290 },
        { x: 200, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(fromBottom).toBeGreaterThan(0);
});

test('in tablet landscape a reported bottom inset additionally guards the long bottom', async ({
  page,
}) => {
  // A tablet keeps its home indicator on the long bottom in landscape; the OS
  // reports an inset there, so an upward swipe from that edge is discarded.
  const dropped = await page.evaluate(() => {
    window.__engine.resizeTo(400, 300);
    window.__engine.setSafeAreaInsets({ top: 0, right: 0, bottom: 30, left: 0 });
    window.__engine.strokeSync(
      [
        { x: 200, y: 290 },
        { x: 200, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
});

test('an export started just before a clear still captures the drawing (save-on-delete race)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  // Mirrors ClearButton's onClear: saveDrawingIfEnabled() fire-and-forgets the
  // export, then clearCanvas() runs synchronously — before the export's first
  // internal await (the paper-texture load) resolves. The exported blob must
  // contain the stroke, not the post-clear blank canvas.
  const redPixels = await page.evaluate(async () => {
    const blobPromise = window.__engine.exportCanvasBlob();
    window.__engine.clearCanvas();
    return window.__engine.blobRedPixelCount(await blobPromise);
  });

  expect(redPixels).toBeGreaterThan(0);
  expect(await count(page)).toBe(0); // the clear itself still landed
});

test('undoing an eraser stroke replays the erased pixels back', async ({ page }) => {
  // The command-replay undo (ADR-0033) must reproduce destination-out ops in
  // order: undoing the erase rebuilds from the baseline and replays only the
  // pen stroke, so the erased pixels return and the canvas is non-empty again.
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

test('undo still works after a canvas resize (replay onto the grown baseline)', async ({
  page,
}) => {
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
  // The rebuild replays from the baseline + command log, but a stroke still being
  // drawn has an uncommitted activeCommand (recorded, not yet in the log). The
  // resize must replay it too, so the in-flight stroke isn't dropped — and the
  // whole stroke remains a single undo unit afterwards.
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
