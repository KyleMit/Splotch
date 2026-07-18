import { expect, test, type Page } from '@playwright/test';

// Crayon brush behaviour (crayonTexture.ts), driven through the /dev/engine
// harness against a real <canvas>. The load-bearing property is WAX BUILDUP:
// drawing a second crayon stroke over existing crayon of the SAME colour fills in
// more of the paper tooth and gets denser, while staying the exact same hue (no
// multiply-style darkening) — and it builds up where the second stroke actually
// goes, not as a global snap. These are pixel assertions, so they belong at the
// E2E layer (happy-dom has no real 2D context).

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

/**
 * Coverage + average opaque colour inside a CSS-space rectangle of the canvas.
 * `opaque` counts near-solid pixels (alpha > 200); `frac` is that over the rect's
 * pixel area; r/g/b are the mean of the opaque pixels (the laid-down wax colour).
 */
async function analyze(page: Page, rect: { x: number; y: number; w: number; h: number }) {
  return page.evaluate((cssRect) => {
    const cv = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const scale = cv.width / cv.getBoundingClientRect().width;
    const x = Math.round(cssRect.x * scale);
    const y = Math.round(cssRect.y * scale);
    const w = Math.round(cssRect.w * scale);
    const h = Math.round(cssRect.h * scale);
    const { data } = cv.getContext('2d')!.getImageData(x, y, w, h);
    let opaque = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200) {
        opaque++;
        sr += data[i];
        sg += data[i + 1];
        sb += data[i + 2];
      }
    }
    const total = w * h;
    return {
      opaque,
      frac: opaque / total,
      r: opaque ? sr / opaque : 0,
      g: opaque ? sg / opaque : 0,
      b: opaque ? sb / opaque : 0,
    };
  }, rect);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
  // Draw with the crayon in a fixed red, thick enough that the tooth reads.
  await page.evaluate(() => {
    window.__engine.setCrayonForced(true);
    window.__engine.setColor('#e01b1b');
    window.__engine.setStrokeWidth(48);
  });
  // setColor arms the post-colour-change pointer debounce; wait it out so the
  // first stroke isn't swallowed.
  await page.waitForTimeout(150);
});

test('a single crayon stroke is a dense body with paper-tooth holes, not a flat fill', async ({
  page,
}) => {
  const box = (await page.locator('#engineCanvas').boundingBox())!;
  const band = { x: 40, y: 120, w: 320, h: 40 };

  await drawStroke(page, box, [
    { x: 40, y: 140 },
    { x: 360, y: 140 },
  ]);

  const one = await analyze(page, band);
  // Wax is laid down…
  expect(one.frac).toBeGreaterThan(0.3);
  // …but the paper tooth punches holes, so it is NOT a solid fill.
  expect(one.frac).toBeLessThan(0.9);
  // The wax is the crayon red (red dominant, green/blue low) — not muddied.
  expect(one.r).toBeGreaterThan(150);
  expect(one.r).toBeGreaterThan(one.g + 60);
  expect(one.r).toBeGreaterThan(one.b + 60);
});

test('a second same-colour pass builds up: denser tooth fill, same hue, no darkening', async ({
  page,
}) => {
  const box = (await page.locator('#engineCanvas').boundingBox())!;
  const band = { x: 40, y: 120, w: 320, h: 40 };
  const path = [
    { x: 40, y: 140 },
    { x: 360, y: 140 },
  ];

  await drawStroke(page, box, path);
  const first = await analyze(page, band);

  // A second, separate stroke over the exact same area — a fresh stroke group, so
  // a different tooth phase whose wax lands in the first pass's tooth valleys.
  await drawStroke(page, box, path);
  const second = await analyze(page, band);

  // BUILDUP: coverage grew meaningfully — the second pass filled paper grain the
  // first pass left bare (criterion 4). Not a no-op, not a snap-to-solid.
  expect(second.frac).toBeGreaterThan(first.frac * 1.1);

  // CONSTANT HUE: the wax colour did not shift, darken, or muddy. A multiply-style
  // brush would drop the red channel over the twice-covered area; source-over of
  // the same opaque colour cannot. Mean opaque colour stays the same crayon red.
  expect(Math.abs(second.r - first.r)).toBeLessThan(18);
  expect(second.r).toBeGreaterThan(first.r - 12); // never darker
  expect(second.g).toBeLessThan(90);
  expect(second.b).toBeLessThan(90);
});

test('buildup is local to the second stroke (tracks the finger, not a global snap)', async ({
  page,
}) => {
  const box = (await page.locator('#engineCanvas').boundingBox())!;
  const leftHalf = { x: 40, y: 120, w: 150, h: 40 };
  const rightHalf = { x: 210, y: 120, w: 150, h: 40 };

  // First pass spans the whole band.
  await drawStroke(page, box, [
    { x: 40, y: 140 },
    { x: 360, y: 140 },
  ]);
  const leftBefore = await analyze(page, leftHalf);
  const rightBefore = await analyze(page, rightHalf);

  // Second pass covers only the LEFT half.
  await drawStroke(page, box, [
    { x: 40, y: 140 },
    { x: 190, y: 140 },
  ]);
  const leftAfter = await analyze(page, leftHalf);
  const rightAfter = await analyze(page, rightHalf);

  // The left half (twice covered) densified…
  expect(leftAfter.frac).toBeGreaterThan(leftBefore.frac * 1.1);
  // …while the untouched right half is essentially unchanged — buildup happened
  // where the stroke went, so it accrues live under the finger rather than as a
  // deferred whole-canvas effect (criterion 5).
  expect(Math.abs(rightAfter.frac - rightBefore.frac)).toBeLessThan(0.03);
});
