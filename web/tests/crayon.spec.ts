import { expect, test, type Page } from '@playwright/test';

// Crayon brush tests. Like engine.spec, these drive the real engine through the
// /dev/engine harness with real pointer input, and read pixels back. The crayon
// lays the active colour down through a paper-tooth texture (crayon.ts): a single
// pass is dense wax broken by fine transparent tooth valleys, and an overlapping
// same-colour pass fills those valleys — getting DENSER without the colour shifting
// (opaque source-over of the same colour can only add coverage, never darken).

async function drawStroke(
  page: Page,
  box: { x: number; y: number },
  pts: { x: number; y: number }[]
) {
  await page.mouse.move(box.x + pts[0].x, box.y + pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

// A gentle horizontal wave the given crayon width can lay a continuous body over.
function wave(x0: number, x1: number, y: number, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x0 + (x1 - x0) * t, y: y + Math.sin(t * Math.PI * 2) * 8 });
  }
  return pts;
}

const box = (page: Page) =>
  page.locator('#engineCanvas').boundingBox() as Promise<{ x: number; y: number }>;

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  await page.evaluate(() => window.__engine.resizeTo(560, 360));
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(34);
    window.__engine.setCrayonMode(true);
  });
});

test('a crayon stroke reads as textured, not a flat fill', async ({ page }) => {
  const b = await box(page);
  await drawStroke(page, b, wave(90, 470, 180));
  // Inside the stroke body, some pixels are wax and some are transparent paper
  // tooth — a flat marker fill would cover ~100%, a crayon leaves visible valleys.
  const s = await page.evaluate(() => window.__engine.regionStats(150, 168, 260, 24));
  const frac = s.covered / s.total;
  expect(frac).toBeGreaterThan(0.5); // dense body, not sparse grit
  expect(frac).toBeLessThan(0.95); // but not a solid flat fill — tooth shows
});

test('a second same-colour pass builds up: denser coverage, unchanged hue', async ({ page }) => {
  const b = await box(page);
  // Measurement window sits solidly inside the body of both passes.
  const stats = () => page.evaluate(() => window.__engine.regionStats(160, 170, 240, 20));

  await drawStroke(page, b, wave(90, 470, 180));
  const first = await stats();

  // A second pass over the same area, started a few px away so its grain phase
  // differs (crayon.ts derives the phase from the stroke's start point), lands on
  // the valleys the first pass left.
  await drawStroke(page, b, wave(104, 484, 183));
  const second = await stats();

  // Denser: the tooth fills in, so coverage climbs meaningfully.
  expect(second.covered).toBeGreaterThan(first.covered * 1.08);

  // Same hue: the mean colour of the painted pixels barely moves, and crucially
  // does NOT darken (a multiply-style buildup would drop the red channel and lift
  // the others toward mud). Both passes are essentially pure crayon red.
  expect(first.r).toBeGreaterThan(220);
  expect(second.r).toBeGreaterThan(220);
  expect(Math.abs(second.r - first.r)).toBeLessThan(14);
  expect(second.g).toBeLessThan(45);
  expect(second.b).toBeLessThan(45);
  // The red channel must not fall (no darkening on overlap).
  expect(second.r).toBeGreaterThan(first.r - 8);
});

test('grain is contained to the stroke — nothing sprays past the path', async ({ page }) => {
  const b = await box(page);
  await drawStroke(page, b, wave(90, 470, 180));
  // Well outside the stroke body (the wave spans y≈180±8, width 34 ⇒ body within
  // y≈155..205). Bands far above and below must be completely empty — no speckle,
  // spray, or starburst escaping the drawn path.
  const above = await page.evaluate(() => window.__engine.regionStats(90, 40, 380, 60));
  const below = await page.evaluate(() => window.__engine.regionStats(90, 250, 380, 80));
  expect(above.covered).toBe(0);
  expect(below.covered).toBe(0);
});

test('a crayon stroke replays deterministically (same input → identical pixels)', async ({
  page,
}) => {
  const b = await box(page);
  const pts = wave(90, 470, 180);
  await drawStroke(page, b, pts);
  const first = await page.evaluate(() => window.__engine.nonTransparentCount());
  expect(first).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.nonTransparentCount())).toBe(0);

  // The grain phase is derived from the stored stroke geometry, so redrawing the
  // exact same path reproduces the exact same pixels — no Math.random at render.
  await drawStroke(page, b, pts);
  const second = await page.evaluate(() => window.__engine.nonTransparentCount());
  expect(second).toBe(first);
});

test('a crayon stroke survives a resize (rides the command-log replay)', async ({ page }) => {
  const b = await box(page);
  await drawStroke(page, b, wave(90, 470, 180));
  const before = await page.evaluate(() => window.__engine.nonTransparentCount());
  expect(before).toBeGreaterThan(0);

  // Grow and shrink back: the drawing is rebuilt from the command log through the
  // same renderOp() every surface uses, so the crayon comes back intact.
  await page.evaluate(() => window.__engine.resizeTo(700, 460));
  await page.evaluate(() => window.__engine.resizeTo(560, 360));
  const after = await page.evaluate(() => window.__engine.nonTransparentCount());
  expect(after).toBeGreaterThan(0);
});
