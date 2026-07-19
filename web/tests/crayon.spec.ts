import { expect, test, type Page } from '@playwright/test';

// Crayon-brush engine tests. Drive the real engine through /dev/engine with the
// crayon brush enabled (window.__engine.setCrayonMode) and read pixel stats, to
// lock the load-bearing crayon behaviours: same-hue wax BUILDUP on a repeated
// pass (criteria 4/5), grain CONTAINMENT (criterion 2), and bit-identical REPLAY
// / determinism (criteria 6/7). The look itself is tuned offline against real
// crayon references (see the crayon-brush ADR); these tests guard behaviour.

const BLUE = '#2f7fd1';

// A straight horizontal stroke the width of a fat crayon, well inside the 300×300
// canvas so we can also assert nothing sprays outside it.
const Y = 150;
const X0 = 70;
const X1 = 230;
const WIDTH = 26;
const strokePts = (() => {
  const pts: { x: number; y: number }[] = [];
  for (let x = X0; x <= X1; x += 6) pts.push({ x, y: Y });
  return pts;
})();

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

async function enableCrayon(page: Page) {
  await page.evaluate(
    ({ blue, width }) => {
      window.__engine.setColor(blue);
      window.__engine.setStrokeWidth(width);
      window.__engine.setCrayonMode(true);
    },
    { blue: BLUE, width: WIDTH }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  await enableCrayon(page);
});

test('a second same-colour crayon pass builds up denser at a constant hue', async ({ page }) => {
  // Pass 1.
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  const one = await page.evaluate(
    () => window.__engine.inkStats({ x: 50, y: 120, w: 200, h: 60 }),
    undefined
  );

  // Pass 2 over the exact same path — a fresh stroke, so a new tooth phase fills
  // the first pass's bare-paper specks.
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  const two = await page.evaluate(
    () => window.__engine.inkStats({ x: 50, y: 120, w: 200, h: 60 }),
    undefined
  );

  // Buildup: the second pass fills the tooth — near-solid pixels jump (~+13-19%
  // measured) and total wax rises — because a fresh tooth phase lands the new
  // peaks in the first pass's bare-paper specks.
  expect(two.strong).toBeGreaterThan(one.strong * 1.08);
  expect(two.alphaSum).toBeGreaterThan(one.alphaSum * 1.03);

  // The stroke doesn't grow — buildup fills the tooth in place, it doesn't spread.
  expect(two.count).toBeLessThan(one.count * 1.05);

  // Constant hue, no muddying: the ink stays blue (blue is the dominant channel
  // both times) and its hue angle barely moves. A multiply/darken blend would
  // drop the blue channel and shift the hue.
  expect(one.b).toBeGreaterThan(one.r);
  expect(two.b).toBeGreaterThan(two.r);
  expect(two.b).toBeGreaterThan(one.b * 0.9);
  expect(Math.abs(hueOf(two.r, two.g, two.b) - hueOf(one.r, one.g, one.b))).toBeLessThan(12);
});

test('buildup is live and gradual — present mid-stroke, before the pass is committed', async ({
  page,
}) => {
  // Pass 1 (committed).
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  const one = await page.evaluate(
    () => window.__engine.inkStats({ x: 50, y: 120, w: 200, h: 60 }),
    undefined
  );

  // Begin pass 2 but DON'T lift: down + moves along the same path, then read.
  await page.evaluate((pts) => {
    window.__engine.pointer('pointerdown', pts[0].x, pts[0].y, 1, 'pen');
    for (let i = 1; i < pts.length; i++)
      window.__engine.pointer('pointermove', pts[i].x, pts[i].y, 1, 'pen');
  }, strokePts);
  const mid = await page.evaluate(
    () => window.__engine.inkStats({ x: 50, y: 120, w: 200, h: 60 }),
    undefined
  );

  // The wax has already built up while the finger is still down — not a snap on
  // release.
  expect(mid.strong).toBeGreaterThan(one.strong * 1.05);
  expect(mid.alphaSum).toBeGreaterThan(one.alphaSum * 1.02);

  // Finish the stroke so state is clean.
  await page.evaluate(
    (pts) =>
      window.__engine.pointer('pointerup', pts[pts.length - 1].x, pts[pts.length - 1].y, 1, 'pen'),
    strokePts
  );
});

test('crayon grain is contained to the stroke — nothing sprays past the path', async ({ page }) => {
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  expect(bounds).not.toBeNull();
  const half = WIDTH / 2;
  const margin = 3; // round cap + antialiasing slack
  // A horizontal stroke: no ink above/below the stroke band, and none beyond the
  // rounded ends. If grain sprayed, these would blow well past the tolerance.
  expect(bounds!.minY).toBeGreaterThanOrEqual(Y - half - margin);
  expect(bounds!.maxY).toBeLessThanOrEqual(Y + half + margin);
  expect(bounds!.minX).toBeGreaterThanOrEqual(X0 - half - margin);
  expect(bounds!.maxX).toBeLessThanOrEqual(X1 + half + margin);
});

test('a crayon stroke replays bit-identically on rebuild (determinism)', async ({ page }) => {
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  const before = await page.evaluate(() => ({
    stats: window.__engine.inkStats(),
    // Sample a spread of pixels across the stroke to catch any per-pixel drift.
    samples: [
      [90, 150],
      [150, 148],
      [150, 152],
      [200, 150],
    ].map(([x, y]) => window.__engine.pixelAt(x, y)),
  }));

  // Teardown + re-init replays the retained command log onto a fresh canvas —
  // the same replay path as undo/resize/export. Bit-identical means every pixel
  // and the aggregate stats come back exactly.
  await page.evaluate(() => window.__engine.remount());
  const after = await page.evaluate(() => ({
    stats: window.__engine.inkStats(),
    samples: [
      [90, 150],
      [150, 148],
      [150, 152],
      [200, 150],
    ].map(([x, y]) => window.__engine.pixelAt(x, y)),
  }));

  expect(after.stats).toEqual(before.stats);
  expect(after.samples).toEqual(before.samples);
});

test('undo removes a crayon stroke back to a blank canvas', async ({ page }) => {
  await page.evaluate((pts) => window.__engine.strokeSync(pts, 'pen'), strokePts);
  expect(await page.evaluate(() => window.__engine.nonTransparentCount())).toBeGreaterThan(0);
  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.nonTransparentCount())).toBe(0);
  expect(await page.evaluate(() => window.__engine.isCanvasEmpty())).toBe(true);
});
