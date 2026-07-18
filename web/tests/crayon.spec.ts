import { expect, test, type Page } from '@playwright/test';

// Crayon brush tests (ADR-0065). These drive the REAL engine through the
// /dev/engine harness — the crayon renders through the same strokeOps path the
// app ships — and read the resulting pixels back, so they assert the two
// behaviours unit tests can't reach: the wax builds up at constant hue as a
// second same-colour stroke is drawn, and the grain stays contained to the
// stroke. The canvas here is transparent (no paper sheet beneath), so a covered
// pixel is the crayon colour at some alpha — exactly what we want to measure.

const BLUE = '#2f6fd0';

/** Draw a straight horizontal crayon stroke; returns nothing (reads happen after). */
async function crayonStroke(page: Page, y: number) {
  const pts = [];
  for (let x = 40; x <= 260; x += 5) pts.push({ x, y });
  // Pen input, so the 100ms post-colour-change debounce (which guards touch/mouse
  // taps) doesn't swallow this synchronous stroke.
  await page.evaluate((points) => window.__engine.strokeSync(points, 'pen'), pts);
}

// Per-region pixel stats read straight off the harness canvas: how many pixels
// carry ink, the total deposited alpha (the "amount of wax"), and the mean
// colour of the covered pixels (their hue).
async function regionStats(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(
    ([ax0, ay0, ax1, ay1]) => {
      const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const { data } = ctx.getImageData(ax0, ay0, ax1 - ax0, ay1 - ay0);
      let covered = 0;
      let alphaSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        alphaSum += a;
        if (a > 20) {
          covered++;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
      }
      return {
        covered,
        alphaSum,
        meanR: covered ? r / covered : 0,
        meanG: covered ? g / covered : 0,
        meanB: covered ? b / covered : 0,
      };
    },
    [x0, y0, x1, y1] as const
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  await page.evaluate((color) => {
    window.__engine.setColor(color);
    window.__engine.setStrokeWidth(40);
    window.__engine.setCrayonMode(true);
  }, BLUE);
});

test('a crayon stroke is a textured partial deposit, not a flat fill', async ({ page }) => {
  await crayonStroke(page, 150);

  // Inside the stroke body there is a dense near-opaque wax body AND a real
  // population of partly-covered tooth pixels where the paper shows through — a
  // flat marker fill would be all-opaque, a blur would be all mid-alpha.
  const stats = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(50, 130, 200, 40); // the whole stroke corridor
    let opaque = 0;
    let covered = 0;
    let clear = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a > 210) opaque++;
      if (a > 20) covered++;
      if (a < 40) clear++;
    }
    return { opaque, covered, clear };
  });
  expect(stats.opaque).toBeGreaterThan(800); // a dense wax body
  expect(stats.covered - stats.opaque).toBeGreaterThan(300); // partly-covered tooth
  expect(stats.clear).toBeGreaterThan(20); // some valleys show bare paper
});

test('grain stays contained to the stroke — nothing sprays outside it', async ({ page }) => {
  await crayonStroke(page, 150);

  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  expect(bounds).not.toBeNull();
  // A 40px stroke (±20 + round caps) at y=150 must not smear far past that band —
  // no spray, speckle, or starburst beyond the drawn path.
  expect(bounds!.minY).toBeGreaterThan(150 - 20 - 12);
  expect(bounds!.maxY).toBeLessThan(150 + 20 + 12);

  // And zero ink well away from the stroke corridor.
  const far = await regionStats(page, 0, 0, 300, 110);
  expect(far.covered).toBe(0);
});

test('a second same-colour pass builds up wax at constant hue (no multiply darkening)', async ({
  page,
}) => {
  const box = { x0: 70, y0: 132, x1: 250, y1: 168 };

  await crayonStroke(page, 150);
  const first = await regionStats(page, box.x0, box.y0, box.x1, box.y1);

  // Draw the SAME stroke again — a distinct new stroke group over the first.
  await crayonStroke(page, 150);
  const second = await regionStats(page, box.x0, box.y0, box.x1, box.y1);

  // Buildup: the second pass deposits MORE wax — it fills tooth the first pass
  // left as paper (more covered pixels) and deepens what was there (more alpha).
  expect(second.covered).toBeGreaterThan(first.covered);
  expect(second.alphaSum).toBeGreaterThan(first.alphaSum * 1.05);

  // Constant hue: every deposited pixel is the SAME crayon colour at some alpha,
  // so the mean colour of the covered pixels barely moves — it does NOT shift,
  // darken, or muddy the way a multiply blend would.
  expect(second.meanR).toBeCloseTo(first.meanR, -1);
  expect(second.meanG).toBeCloseTo(first.meanG, -1);
  expect(second.meanB).toBeCloseTo(first.meanB, -1);
  // The covered colour is recognisably the blue crayon (blue dominant), both passes.
  for (const s of [first, second]) {
    expect(s.meanB).toBeGreaterThan(s.meanR + 40);
    expect(s.meanB).toBeGreaterThan(s.meanG + 20);
  }
});

test('crayon renders deterministically and replays bit-identically', async ({ page }) => {
  await crayonStroke(page, 150);
  const drawn = await regionStats(page, 0, 0, 300, 300);

  // Same input → same pixels (no RNG/time at render): clear and redraw identically.
  await page.evaluate(() => window.__engine.clearCanvas());
  await crayonStroke(page, 150);
  const redrawn = await regionStats(page, 0, 0, 300, 300);
  expect(redrawn.covered).toBe(drawn.covered);
  expect(redrawn.alphaSum).toBe(drawn.alphaSum);

  // Every rebuild from the command log reproduces the SAME pixels — the crayon's
  // per-group compositing is deterministic under replay. Resize wipes the backing
  // store and replays; doing it twice must yield byte-identical deposits.
  const size = await page.evaluate(() => {
    const c = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    return { w: c.clientWidth, h: c.clientHeight };
  });
  await page.evaluate((s) => window.__engine.resizeTo(s.w, s.h), size);
  const replay1 = await regionStats(page, 0, 0, 300, 300);
  await page.evaluate((s) => window.__engine.resizeTo(s.w, s.h), size);
  const replay2 = await regionStats(page, 0, 0, 300, 300);
  expect(replay2.covered).toBe(replay1.covered);
  expect(replay2.alphaSum).toBe(replay1.alphaSum);

  // And the rebuild preserves the drawn stroke — its coverage and total wax match
  // the live draw within the sub-visible slack commit-time simplification allows
  // (ADR-0036), the same 0-pixel-drift budget every stroke replays under.
  expect(replay1.covered).toBeGreaterThan(drawn.covered * 0.97);
  expect(replay1.covered).toBeLessThan(drawn.covered * 1.03);
  expect(replay1.alphaSum).toBeGreaterThan(drawn.alphaSum * 0.95);
  expect(replay1.alphaSum).toBeLessThan(drawn.alphaSum * 1.05);
});
