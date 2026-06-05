import { expect, test, type Page } from '@playwright/test';

// Multi-touch drawing. The engine keys its drawing state by pointerId
// (activePointers: Map<number, PointerState>), so several touch pointers must
// paint independent strokes at the same time. And a pinch/spread — two fingers
// moving together or apart — must NOT zoom or scale the canvas: touch-action:none
// plus the user-scalable=no viewport keep gestures off the page, and the engine
// never applies a transform of its own. These run through the /dev/engine harness
// (see src/routes/dev/engine), driving up to 5 concurrent pointers in a single
// synchronous tick via window.__engine.multiStrokeSync.

const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());
const alphaAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__engine.pixelAt(px, py)[3], [x, y] as const);

/** Horizontal stroke at a fixed y, sampled every 10px from x0 toward x1. */
function horizontalStroke(pointerId: number, y: number, x0: number, x1: number) {
  const step = x1 >= x0 ? 10 : -10;
  const points: { x: number; y: number }[] = [];
  for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) points.push({ x, y });
  return { pointerId, points };
}

// Five simultaneous lines on the 300x300 harness canvas, 40px apart so the
// 8px-wide strokes never overlap. Pointers 4 and 5 start near the centre and
// travel in opposite directions — a spread gesture (fingers moving apart, the
// classic zoom-in pinch). Each line has a midpoint we sample to prove it drew.
const STROKES = [
  horizontalStroke(1, 50, 40, 260),
  horizontalStroke(2, 90, 40, 260),
  horizontalStroke(3, 130, 40, 260),
  horizontalStroke(4, 190, 150, 40), // spread: moves left
  horizontalStroke(5, 230, 150, 260) // spread: moves right
];
const SAMPLES = [
  { x: 150, y: 50 },
  { x: 150, y: 90 },
  { x: 150, y: 130 },
  { x: 90, y: 190 }, // on pointer 4's leftward path
  { x: 200, y: 230 } // on pointer 5's rightward path
];

test.beforeEach(async ({ page }) => {
  // Navigate once, then poll for readiness — same cold-Vite handling as the
  // engine spec (a first-load dep-optimize reload would break a re-goto loop).
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});

test('five simultaneous touch pointers each paint an independent line', async ({ page }) => {
  expect(await count(page)).toBe(0);

  await page.evaluate((strokes) => window.__engine.multiStrokeSync(strokes), STROKES);

  // Every line painted: its midpoint pixel is opaque.
  for (const s of SAMPLES) {
    expect(await alphaAt(page, s.x, s.y), `expected paint at (${s.x}, ${s.y})`).toBeGreaterThan(0);
  }

  // The lines are independent, not a merged blob — a gap between two lines stays
  // transparent, and a corner the fingers never touched is blank.
  expect(await alphaAt(page, 150, 70)).toBe(0); // between lines 1 and 2
  expect(await alphaAt(page, 290, 290)).toBe(0); // untouched corner

  expect(await count(page)).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__engineState)).canvasEmpty).toBe(false);
});

test('a pinch/spread across five pointers does not zoom or scale the canvas', async ({ page }) => {
  const canvas = page.locator('#engineCanvas');

  const boxBefore = await canvas.boundingBox();
  const viewportBefore = await page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    width: window.innerWidth,
    height: window.innerHeight
  }));

  await page.evaluate((strokes) => window.__engine.multiStrokeSync(strokes), STROKES);

  const boxAfter = await canvas.boundingBox();
  const viewportAfter = await page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    width: window.innerWidth,
    height: window.innerHeight
  }));

  // The page never pinch-zoomed.
  expect(viewportAfter.scale).toBe(1);
  expect(viewportAfter).toEqual(viewportBefore);

  // The canvas element kept its exact position and size — no scale transform.
  expect(boxAfter).toEqual(boxBefore);
  const transform = await canvas.evaluate((el) => getComputedStyle(el).transform);
  expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);

  // Content maps 1:1 to where the fingers actually went — a zoom would have
  // displaced the spread pair's strokes off their sampled coordinates.
  for (const s of SAMPLES) {
    expect(await alphaAt(page, s.x, s.y), `expected paint at (${s.x}, ${s.y})`).toBeGreaterThan(0);
  }
});
