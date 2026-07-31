import { type Page } from '@playwright/test';

import { count, drawStroke, expect, state, test } from './engine-harness';

// ── device rotation / the paper view (ADR-0050) ─────────────────────────────
// A resize with a changed Screen Orientation angle is a rotation. With ink on
// the canvas the engine locks the paper (the space ops live in) and presents it
// UPRIGHT, contain-fit and centered — scaled down when it must — instead of
// letting content rotate off-screen or swapping a colored page's art. The
// harness pins the angle via setScreenAngleOverride, so these run without a
// device. Geometry used below: paper 300×300 adopted at angle 0; rotating to
// angle 90 into a 400×300 viewport fits at scale 1 with letterbox margins
// x∈[0,50] and x∈[350,400], so a paper point (x, y) lands at screen
// (x + 50, y); into a 200×300 viewport it fits at scale 2/3 centered
// vertically, landing at (2x/3, 2y/3 + 50).

async function rotateTo(page: Page, angle: number, w: number, h: number) {
  await page.evaluate(
    async ({ angle, w, h }) => {
      window.__engine.setScreenAngleOverride(angle);
      await window.__engine.resizeTo(w, h);
    },
    { angle, w, h }
  );
}

test('rotating with ink locks the paper and keeps the whole drawing visible upright', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // Horizontal stroke across the paper.
  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await rotateTo(page, 90, 400, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0); // upright — the picture rotates with the device
  expect(view.scale).toBe(1);
  expect(view.tx).toBe(50); // centered: (400 − 300) / 2

  // The stroke is still on screen and still HORIZONTAL, shifted into the
  // centered paper (the smoothed path spans paper x ∈ [40, 120] → screen
  // x ∈ [90, 170]): paper (90, 60) → screen (140, 60).
  expect(await count(page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(140, 60)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 60)[3])).toBeGreaterThan(0);
  // Below the stroke line stays blank — it did not rotate to vertical.
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 150)[3])).toBe(0);

  // Every ink pixel sits inside the paper's mapped box — nothing off-screen.
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.minX).toBeGreaterThanOrEqual(50);
  expect(bounds.maxX).toBeLessThanOrEqual(350);
});

test('a rotation the paper does not fit scales it down uniformly, fully visible', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);

  // 300×300 paper into a 200×300 viewport → contain-fit at 2/3, centered
  // vertically (ty = 50).
  await rotateTo(page, 90, 200, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0);
  expect(view.scale).toBeCloseTo(2 / 3, 5);

  // Paper (120, 60) → screen (80, 90); the whole stroke fits on screen.
  expect(await page.evaluate(() => window.__engine.pixelAt(80, 90)[3])).toBeGreaterThan(0);
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.maxX).toBeLessThanOrEqual(200);
  expect(bounds.minY).toBeGreaterThanOrEqual(50);
  expect(bounds.maxY).toBeLessThanOrEqual(250);
});

test('rotating back restores the exact original layout', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  const before = await count(page);

  await rotateTo(page, 90, 400, 300);
  await rotateTo(page, 0, 300, 300);

  // The relayout is debounced (RESIZE_SETTLE_MS); under parallel load its rebuild
  // can land a beat after resizeTo's settle window, so poll the restored state
  // rather than reading it once and racing the repaint.
  await expect.poll(() => page.evaluate(() => window.__engine.getViewState().active)).toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.__engine.pixelAt(120, 60)[3]))
    .toBeGreaterThan(0);
  await expect.poll(() => count(page)).toBe(before);
});

test('returning to the paper angle preserves it across viewport drift', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);

  await rotateTo(page, 90, 400, 300);
  await rotateTo(page, 0, 302, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.scale).toBe(1);
  expect(view.tx).toBe(1);
  expect(view.paperCssWidth).toBe(300);
  expect(await page.evaluate(() => window.__engine.pixelAt(121, 60)[3])).toBeGreaterThan(0);
});

test('strokes drawn while rotated land on the paper and survive rotating back', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);

  // Draw through the rotated view: screen (200, 150) → (300, 150) maps to the
  // paper segment (150, 150) → (250, 150) (the centered paper starts at x = 50).
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 200, y: 150 },
        { x: 300, y: 150 },
      ],
      'touch'
    );
  });
  await rotateTo(page, 0, 300, 300);

  expect(await page.evaluate(() => window.__engine.pixelAt(200, 150)[3])).toBeGreaterThan(0);
});

test('the margins around the rotated paper are drawable, and crop on rotating back', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);
  const before = await count(page);

  // A stroke entirely inside the left margin (x < 50 maps left of the paper,
  // negative paper coordinates) still paints — no dead zones mid-scribble.
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 20, y: 150 },
        { x: 40, y: 150 },
      ],
      'mouse'
    );
  });
  expect(await count(page)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__engine.pixelAt(25, 150)[3])).toBeGreaterThan(0);

  // Rotating back crops the margin ink (the paper never contained it): the
  // original stroke is restored and nothing renders left of it.
  await rotateTo(page, 0, 300, 300);
  expect(await page.evaluate(() => window.__engine.pixelAt(120, 60)[3])).toBeGreaterThan(0);
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.minX).toBeGreaterThanOrEqual(30);

  // The crop is permanent: the commit fold clipped the margin ink at the paper
  // square's bounds, so rotating forward again does not resurrect it (the
  // accepted ADR-0050 margin corner — replay-era op retention brought it back,
  // snapshot folding does not).
  await rotateTo(page, 90, 400, 300);
  expect(await page.evaluate(() => window.__engine.pixelAt(25, 150)[3])).toBe(0);
});

test('clearing while rotated wipes margin ink too', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 20, y: 150 },
        { x: 40, y: 150 },
      ],
      'mouse'
    );
  });
  expect(await count(page)).toBeGreaterThan(0);

  // Clear must cover the margins (negative paper coordinates) as well as the
  // paper — and the blank canvas re-adopts the viewport, dropping the view.
  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await page.evaluate(() => window.__engine.getViewState())).active).toBe(false);
});

test('undo still works while rotated, and emptying the canvas re-adopts the viewport', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await drawStroke(page, box, [
    { x: 40, y: 180 },
    { x: 200, y: 180 },
  ]);
  await rotateTo(page, 90, 400, 300);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0); // first stroke, still presented

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);

  // Blank canvas → the paper is free again: full-size, no letterbox.
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
});

test('rotating an empty canvas adopts the new viewport (no lock, no letterbox)', async ({
  page,
}) => {
  await rotateTo(page, 90, 400, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
  expect(view.paperOrientation).toBe('landscape');

  // The full new viewport is drawable — including space beyond the old paper.
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 320, y: 150 },
        { x: 380, y: 150 },
      ],
      'touch'
    );
  });
  expect(await page.evaluate(() => window.__engine.pixelAt(350, 150)[3])).toBeGreaterThan(0);
});

// ── re-entry re-sync (rotation while backgrounded) ───────────────────────────
// A hidden document fires no resize/orientationchange, so a rotation while the
// app is backgrounded reaches the engine only via the visibilitychange on
// re-entry. The harness's resumeTo applies the new box silently (no resize
// event) and fires just that visibilitychange.

async function hiddenRotateTo(page: Page, angle: number, w: number, h: number) {
  await page.evaluate(
    ({ angle, w, h }) => {
      window.__engine.setScreenAngleOverride(angle);
      window.__engine.resumeTo(w, h);
    },
    { angle, w, h }
  );
}

test('a rotation while backgrounded re-syncs the empty canvas on re-entry', async ({ page }) => {
  await hiddenRotateTo(page, 90, 400, 300);

  // The blank canvas adopts the new viewport immediately — no letterbox, and
  // the space beyond the old paper is drawable.
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
  expect(view.paperOrientation).toBe('landscape');

  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 320, y: 150 },
        { x: 380, y: 150 },
      ],
      'touch'
    );
  });
  expect(await page.evaluate(() => window.__engine.pixelAt(350, 150)[3])).toBeGreaterThan(0);
});

test('a rotation while backgrounded with ink locks the paper on re-entry (ADR-0050)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await hiddenRotateTo(page, 90, 400, 300);

  // Same lock + upright contain-fit the live rotation path produces: the
  // stroke stays horizontal, shifted into the centered paper (tx = 50).
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0);
  expect(view.scale).toBe(1);
  expect(view.tx).toBe(50);
  expect(await page.evaluate(() => window.__engine.pixelAt(140, 60)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 150)[3])).toBe(0);
});

test('a visibility flip with unchanged geometry leaves the drawing untouched', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  const before = await count(page);

  // Same box, same angle — the plain tab-switch return path.
  await page.evaluate(() => window.__engine.resumeTo(300, 300));

  expect(await count(page)).toBe(before);
  expect((await page.evaluate(() => window.__engine.getViewState())).active).toBe(false);
});
