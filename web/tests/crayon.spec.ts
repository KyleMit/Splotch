import { expect, test, type Page } from '@playwright/test';

// Crayon brush behaviour, driven through the real engine on the /dev/engine
// harness (same seam as engine.spec). The pen renders the waxy crayon brush by
// default; these specs lock the two properties that define it: a single stroke
// lays down broken paper-tooth grain contained to the path, and a second
// same-colour stroke BUILDS UP — coverage grows toward solid while the hue holds
// constant (no multiply-style darkening). Bit-identical replay of crayon strokes
// is covered by engine.spec's undo/resize assertions and perf:units.

/** Drag a stroke through the given canvas-space points using real mouse input. */
async function drawStroke(
  page: Page,
  box: { x: number; y: number },
  points: { x: number; y: number }[]
) {
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

// A straight, thick horizontal band so a sample rectangle lands entirely inside
// the stroke body.
const BAND_Y = 140;
const BAND: { x: number; y: number }[] = Array.from({ length: 13 }, (_, i) => ({
  x: 60 + i * 20,
  y: BAND_Y,
}));

// Sample rectangle well inside the band; a control rectangle far above it.
const INSIDE = { x: 150, y: BAND_Y - 12, w: 40, h: 24 };
const ABOVE = { x: 150, y: 40, w: 40, h: 24 };

const stats = (page: Page, box: { x: number; y: number; w: number; h: number }) =>
  page.evaluate((b) => window.__engine.regionInkStats(b.x, b.y, b.w, b.h), box);

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  // A thick band so grain is sampleable; crayon is the default brush.
  await page.evaluate(() => window.__engine.setStrokeWidth(48));
});

test('a crayon stroke lays down broken paper-tooth grain contained to the path', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, BAND);

  // Inside the band: partial coverage — dense but broken by tooth, neither empty
  // nor a flat solid fill.
  const inside = await stats(page, INSIDE);
  const coverage = inside.inked / inside.total;
  expect(coverage).toBeGreaterThan(0.35);
  expect(coverage).toBeLessThan(0.95);

  // Contained: nothing sprays/speckles onto the paper well away from the path.
  const above = await stats(page, ABOVE);
  expect(above.covered).toBe(0);
});

test('a second same-colour crayon pass builds up coverage at constant hue', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, BAND);
  const first = await stats(page, INSIDE);

  // A NEW stroke over the exact same path — a different tooth tile, so it fills
  // valleys the first pass missed.
  await drawStroke(page, box, BAND);
  const second = await stats(page, INSIDE);

  // Build-up: the tooth fills in — solid coverage grows meaningfully.
  expect(second.inked).toBeGreaterThan(first.inked * 1.1);
  // ...but a single pass already had real grain to fill (headroom existed).
  expect(first.inked / first.total).toBeLessThan(0.9);

  // Constant hue, NO darkening/muddying: the mean colour of the wax body is
  // unchanged (hard-alpha same-colour compositing can only add area, never
  // shift the colour). A multiply/opacity bug would move these.
  expect(Math.abs(second.r - first.r)).toBeLessThan(10);
  expect(Math.abs(second.g - first.g)).toBeLessThan(10);
  expect(Math.abs(second.b - first.b)).toBeLessThan(10);
  // Still a strong red body, not darkened toward grey.
  expect(second.r).toBeGreaterThan(160);
  expect(second.g).toBeLessThan(90);
});

test('a third pass keeps filling toward solid, still at constant hue', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, BAND);
  const one = await stats(page, INSIDE);
  await drawStroke(page, box, BAND);
  const two = await stats(page, INSIDE);
  await drawStroke(page, box, BAND);
  const three = await stats(page, INSIDE);

  // Monotonic build-up toward solid.
  expect(two.inked).toBeGreaterThan(one.inked);
  expect(three.inked).toBeGreaterThanOrEqual(two.inked);
  // Hue never drifts across the passes.
  expect(Math.abs(three.r - one.r)).toBeLessThan(10);
});

test('the flat variant does not build up on an exact redraw', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.evaluate(() => window.__engine.setBrushVariant('flat'));

  await drawStroke(page, box, BAND);
  const first = await stats(page, INSIDE);
  await drawStroke(page, box, BAND);
  const second = await stats(page, INSIDE);

  // A solid stroke already fully covers, so a second identical pass adds nothing
  // — this isolates build-up as a crayon-only property.
  expect(first.inked / first.total).toBeGreaterThan(0.98);
  expect(second.inked).toBeLessThanOrEqual(first.inked + 2);
});
