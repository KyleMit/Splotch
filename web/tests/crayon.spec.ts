import { expect, test, type Page } from '@playwright/test';

// Crayon-brush behaviour, driven through the /dev/engine harness (same seam as
// engine.spec.ts). The load-bearing property is WAX BUILDUP: a second crayon
// stroke over the same colour fills in the paper tooth and gets denser while the
// hue stays put (no multiply-style darkening), and it happens live while drawing
// — not as a post-commit snap. We also pin that a crayon stroke replays
// bit-identically (undo/resize), the same invariant the pen has (ADR-0033).

const INK = '#d1442a';

/** Mean alpha (0..1), near-opaque fraction, and mean colour of the covered
 *  pixels inside a canvas-space rect — read straight off the visible canvas. */
async function regionStats(page: Page, rect: { x: number; y: number; w: number; h: number }) {
  return page.evaluate((r) => {
    const cv = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const { data } = ctx.getImageData(r.x, r.y, r.w, r.h);
    let alphaSum = 0;
    let covered = 0;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    const n = r.w * r.h;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      alphaSum += a;
      if (a >= 230) {
        covered++;
        cr += data[i];
        cg += data[i + 1];
        cb += data[i + 2];
      }
    }
    return {
      meanAlpha: alphaSum / (n * 255),
      coveredFrac: covered / n,
      coveredRGB: covered ? [cr / covered, cg / covered, cb / covered] : [0, 0, 0],
    };
  }, rect);
}

// A horizontal crayon band the region samples the interior of.
const BAND = Array.from({ length: 13 }, (_, i) => ({ x: 40 + i * 18, y: 120 }));
const REGION = { x: 70, y: 108, w: 160, h: 26 };

async function setupCrayon(page: Page) {
  await page.evaluate((ink) => {
    window.__engine.clearCanvas();
    window.__engine.setCrayonMode(true);
    window.__engine.setColor(ink);
    window.__engine.setStrokeWidth(44);
  }, INK);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});

test('a second same-colour crayon pass fills the tooth and densifies at constant hue', async ({
  page,
}) => {
  await setupCrayon(page);

  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), BAND);
  const one = await regionStats(page, REGION);

  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), BAND);
  const two = await regionStats(page, REGION);

  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), BAND);
  const three = await regionStats(page, REGION);

  // One pass is already waxy but leaves visible paper tooth (not a solid fill).
  expect(one.meanAlpha).toBeGreaterThan(0.4);
  expect(one.meanAlpha).toBeLessThan(0.95);

  // Buildup: each same-colour pass fills more of the grain — coverage climbs.
  expect(two.meanAlpha).toBeGreaterThan(one.meanAlpha + 0.03);
  expect(three.meanAlpha).toBeGreaterThan(two.meanAlpha);
  expect(two.coveredFrac).toBeGreaterThan(one.coveredFrac);

  // …but the HUE does not shift or darken. Because the wax composites the same
  // opaque colour with source-over, every covered pixel keeps the crayon's own
  // RGB — buildup only changes coverage, never the colour (no multiply muddying).
  const [r1, g1, b1] = one.coveredRGB;
  const [r3, g3, b3] = three.coveredRGB;
  expect(Math.abs(r3 - r1)).toBeLessThan(6);
  expect(Math.abs(g3 - g1)).toBeLessThan(6);
  expect(Math.abs(b3 - b1)).toBeLessThan(6);
  // Not darker: the third pass is no dimmer than the first (it can only fill in).
  expect(r3 + g3 + b3).toBeGreaterThanOrEqual(r1 + g1 + b1 - 6);
});

test('crayon buildup is live — it accrues while the second stroke is being drawn', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await setupCrayon(page);
  // Clear the color-change debounce window so the real-mouse strokes below draw.
  await page.waitForTimeout(150);

  // First pass, committed.
  await page.mouse.move(box.x + BAND[0].x, box.y + BAND[0].y);
  await page.mouse.down();
  for (const p of BAND.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
  const afterOne = await regionStats(page, REGION);

  // Second pass — sample WHILE the finger is still down, before it lifts. If
  // buildup only happened at commit this would still read as one pass.
  await page.mouse.move(box.x + BAND[0].x, box.y + BAND[0].y);
  await page.mouse.down();
  for (const p of BAND.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  const midStroke = await regionStats(page, REGION);
  await page.mouse.up();

  expect(midStroke.meanAlpha).toBeGreaterThan(afterOne.meanAlpha + 0.02);
});

test('a crayon stroke replays bit-identically after a resize rebuild', async ({ page }) => {
  await setupCrayon(page);
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), BAND);

  const before = await page.evaluate((r) => {
    const cv = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    return Array.from(cv.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h).data);
  }, REGION);

  // Force a full rebuild-from-stored-ops (same size, so coordinates are stable).
  await page.evaluate(() => window.__engine.resizeTo(300, 300));

  const after = await page.evaluate((r) => {
    const cv = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    return Array.from(cv.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h).data);
  }, REGION);

  let differing = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) differing++;
  expect(differing).toBe(0);
});
