import { expect, test, type Page } from '@playwright/test';

// Crayon brush pixel tests (ADR-0065), driven through the /dev/engine harness.
// The crayon's contract is stricter than the pen's: translucent swept passes
// must deposit exactly once per pass (no frame-boundary circles, no start-dot
// bulb), genuine overdraw must build up at the same hue, and every rebuild —
// undo, resize — must reproduce the exact live pixels (the stamps and the
// replay run the same renderOp over the same recorded passes).

// The tile's peak deposit is 0.95 → 242/255. A single pass can never exceed it;
// anything above means two deposits stacked where they shouldn't have.
const SINGLE_PASS_MAX_ALPHA = 245;

const state = (page: Page) => page.evaluate(() => window.__engineState);
const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());
const hash = (page: Page) => page.evaluate(() => window.__engine.canvasHash());

/** Mean alpha over a canvas-space rect — the buildup measure. */
const meanAlpha = (page: Page, rect: { x: number; y: number; w: number; h: number }) =>
  page.evaluate((r) => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h);
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i];
    return sum / (data.length / 4);
  }, rect);

/** Max alpha over a canvas-space rect — the double-deposit detector. */
const maxAlpha = (page: Page, rect: { x: number; y: number; w: number; h: number }) =>
  page.evaluate((r) => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h);
    let max = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > max) max = data[i];
    return max;
  }, rect);

const stroke = (page: Page, points: { x: number; y: number }[]) =>
  page.evaluate((pts) => window.__engine.strokeSync(pts), points);

function linePoints(x0: number, y0: number, x1: number, y1: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / (n - 1),
    y: y0 + ((y1 - y0) * i) / (n - 1),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  await page.evaluate(() => window.__engine.setCrayonMode(true));
});

test('a crayon stroke is translucent tooth in the exact selected color', async ({ page }) => {
  await stroke(page, linePoints(30, 150, 270, 150, 30));

  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false);

  // Sample the stroke core: painted pixels hold the selected RGB (the harness
  // draws #ff0000) while alpha carries the texture.
  const samples = await page.evaluate(() =>
    [60, 100, 140, 180, 220].map((x) => window.__engine.pixelAt(x, 150))
  );
  const alphas: number[] = [];
  for (const [r, g, b, a] of samples) {
    expect(a).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(235);
    expect(g).toBeLessThan(20);
    expect(b).toBeLessThan(20);
    alphas.push(a);
  }
  // Tooth, not a flat wash: coverage varies along the core...
  expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(15);
  // ...and never saturates to a solid marker line.
  expect(await maxAlpha(page, { x: 30, y: 140, w: 240, h: 20 })).toBeLessThanOrEqual(
    SINGLE_PASS_MAX_ALPHA
  );
});

test('grain stays inside the swept stroke', async ({ page }) => {
  await stroke(page, linePoints(50, 150, 250, 150, 25));

  // Stroke level 8px × the 1.5 crayon multiplier, centered on y=150: radius 6
  // + antialiasing. Everything outside that band (and past the end caps) must
  // be empty — no spray, halo, or loose speckles.
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  expect(bounds).not.toBeNull();
  expect(bounds!.minY).toBeGreaterThanOrEqual(142);
  expect(bounds!.maxY).toBeLessThanOrEqual(158);
  expect(bounds!.minX).toBeGreaterThanOrEqual(42);
  expect(bounds!.maxX).toBeLessThanOrEqual(258);
});

test('the outer edge is lighter and more broken than the crayon body', async ({ page }) => {
  await stroke(page, linePoints(50, 150, 250, 150, 25));

  const core = await meanAlpha(page, { x: 70, y: 148, w: 160, h: 4 });
  const edge = await meanAlpha(page, { x: 70, y: 145, w: 160, h: 1 });
  expect(edge).toBeGreaterThan(0);
  expect(edge).toBeLessThan(core * 0.6);

  const edgeRange = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(70, 145, 160, 1);
    let min = 255;
    let max = 0;
    for (let i = 3; i < data.length; i += 4) {
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
    }
    return { min, max };
  });
  expect(edgeRange.min).toBeLessThan(10);
  expect(edgeRange.max - edgeRange.min).toBeGreaterThan(80);
});

test('density is independent of pointer event rate — no frame-boundary seams', async ({ page }) => {
  // The same straight path sampled at 40 points vs 2 points is the same swept
  // pass (one union stroke either way), so the pixels are identical — the
  // property that kills per-frame cap circles by construction.
  await stroke(page, linePoints(40, 100, 260, 100, 40));
  const dense = await hash(page);
  const denseMax = await maxAlpha(page, { x: 40, y: 90, w: 220, h: 20 });

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);

  await stroke(page, linePoints(40, 100, 260, 100, 2));
  expect(await hash(page)).toBe(dense);
  expect(denseMax).toBeLessThanOrEqual(SINGLE_PASS_MAX_ALPHA);
});

test('a tap leaves a single tip disk with no double deposit', async ({ page }) => {
  await stroke(page, [{ x: 150, y: 150 }]);

  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  expect(bounds).not.toBeNull();
  expect(bounds!.maxX - bounds!.minX).toBeLessThanOrEqual(15);
  expect(bounds!.maxY - bounds!.minY).toBeLessThanOrEqual(15);
  expect(await maxAlpha(page, { x: 140, y: 140, w: 20, h: 20 })).toBeLessThanOrEqual(
    SINGLE_PASS_MAX_ALPHA
  );
});

test('a second same-color stroke builds up coverage while the hue stays fixed', async ({
  page,
}) => {
  const region = { x: 80, y: 145, w: 140, h: 10 };
  await stroke(page, linePoints(60, 150, 240, 150, 20));
  const single = await meanAlpha(page, region);

  await stroke(page, linePoints(60, 150, 240, 150, 20));
  const double = await meanAlpha(page, region);

  expect(double).toBeGreaterThan(single * 1.08);

  const [r, g, b, a] = await page.evaluate(() => window.__engine.pixelAt(150, 150));
  expect(a).toBeGreaterThan(0);
  expect(r).toBeGreaterThan(235);
  expect(g).toBeLessThan(20);
  expect(b).toBeLessThan(20);
});

test('backtracking during one continuous gesture builds up live', async ({ page }) => {
  const region = { x: 80, y: 145, w: 140, h: 10 };
  await stroke(page, linePoints(60, 150, 240, 150, 20));
  const single = await meanAlpha(page, region);
  await page.evaluate(() => window.__engine.undo());

  // One gesture: out and back over the same paper. The reversal splits the
  // gesture into two passes, so the return leg deposits again.
  await stroke(page, [
    ...linePoints(60, 150, 240, 150, 20),
    ...linePoints(240, 150, 60, 150, 20).slice(1),
  ]);
  const backtracked = await meanAlpha(page, region);

  expect(backtracked).toBeGreaterThan(single * 1.08);
});

test('undo rebuilds crayon pixels with zero drift', async ({ page }) => {
  // A gesture with reversals records several passes — the shape most likely to
  // drift if replay disagreed with the live stamps.
  await stroke(page, [
    ...linePoints(50, 80, 250, 80, 20),
    ...linePoints(250, 80, 50, 80, 20).slice(1),
    ...linePoints(50, 80, 150, 200, 15).slice(1),
  ]);
  const before = await hash(page);

  await stroke(page, linePoints(60, 250, 240, 250, 10));
  await page.evaluate(() => window.__engine.undo());

  expect(await hash(page)).toBe(before);
});

test('a resize round-trip replays crayon pixels exactly', async ({ page }) => {
  await stroke(page, [
    ...linePoints(60, 60, 240, 120, 20),
    ...linePoints(240, 120, 60, 180, 20).slice(1),
  ]);
  const before = await hash(page);

  await page.evaluate(() => window.__engine.resizeTo(420, 340));
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  expect(await hash(page)).toBe(before);
});

test('a long crayon scribble collapses into a keyframe and still undoes cleanly', async ({
  page,
}) => {
  await page.evaluate(() => window.__engine.setSimplifyParams({ keyframeThreshold: 40 }));

  const zigzag: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const y = 60 + i * 20;
    zigzag.push(...linePoints(i % 2 ? 250 : 50, y, i % 2 ? 50 : 250, y, 15));
  }
  await stroke(page, zigzag);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.keyframes).toBeGreaterThanOrEqual(1);

  const before = await hash(page);
  await stroke(page, linePoints(60, 280, 240, 280, 10));
  await page.evaluate(() => window.__engine.undo());
  expect(await hash(page)).toBe(before);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('the eraser removes crayon ink', async ({ page }) => {
  await stroke(page, linePoints(60, 150, 240, 150, 20));
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__engine.setEraserMode(true);
    window.__engine.setStrokeWidth(30);
  });
  await stroke(page, linePoints(40, 150, 260, 150, 30));

  expect(await count(page)).toBe(0);
});

test('crayon strokes survive into the PNG export', async ({ page }) => {
  await stroke(page, linePoints(60, 150, 240, 150, 20));
  const red = await page.evaluate(async () =>
    window.__engine.blobRedPixelCount(await window.__engine.exportCanvasBlob())
  );
  expect(red).toBeGreaterThan(0);
});
