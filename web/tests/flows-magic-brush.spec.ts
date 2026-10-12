import { expect, test, type Page } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import {
  COLOR_CHANGE_DEBOUNCE_SETTLE_MS,
  draw,
  gotoApp,
  hasRedDominantPixel,
  renderedCanvasHandle,
  swatch,
  TEST_PALETTE,
} from './helpers';

import { applyFarmPage, openBrushMenu, openDrawer, pickBrush } from './flows-harness';

// The magic brush reveals by sampling a sheet that rasterizes asynchronously
// (a random rainbow, or an async-decoded coloring-page fill). A stroke drawn
// before the sheet is ready holds its ops out of the paper until the fold-in
// repaint fires, so on a starved parallel worker the reveal can finish painting
// well past a few seconds. This is how long a *correct* stroke may legitimately
// read unchanged before that repaint lands, so the colour count is polled rather
// than read once — see issue #498. The eraser pass settles through the same
// path, so it shares the window.
const REVEAL_SETTLE_MS = 3000;

// Distinct colour buckets a reveal must reach to be a reveal rather than a flat
// pen pass. An INCLUSIVE floor — the assertion below is
// toBeGreaterThanOrEqual — so this constant is the decision boundary itself
// rather than one below it.
//
// Both sides are measured, at the quantization distinctOpaqueColors uses (issue
// #651): a flat pen pass lands at 1-3 buckets over 90 samples, and the narrowest
// reveal — the post-clear rainbow, whose short stroke crosses the least of the
// ramp — lands at 7 over 45. Those two leave a four-wide gap with no centre, so
// the margins cannot be symmetric wherever the boundary goes. Accepting from 5
// gives the reveal side two buckets (it would have to fall to 4 to false-red) and
// the pen side one (it would have to reach 5 to false-pass).
//
// The spare bucket goes to the reveal side deliberately. That is the tail that
// actually bit (#658), and its spread is real — a random gradient crossed by a
// short stroke. A flat pass has no comparable spread: one colour is one bucket,
// and only anti-aliasing rounding lifts it off 1, which is why the pen figure
// held at 1-3 across 4, 5 and 6 bits alike.
const MAGIC_REVEAL_MIN_COLORS = 5;

// A correct reveal repaints essentially the whole band (measured 2845 left,
// 2065 top); a wrong-mode pen pass leaves none of it, so this only has to clear
// the anti-aliasing noise floor.
const BAND_MIN_REVEALED_PX = 500;

// Draw a magic-brush stroke and confirm its reveal actually landed (more than a
// flat pen colour). Use this instead of a bare `draw` plus a canvas-fill count
// whenever the assertion needs the reveal's many colours — a fill count is
// immune, a pen stroke fills the canvas too.
//
// The stroke is drawn once. Two things a redraw used to rescue are gone at the
// source (ADR-0080): pickBrush() returns only once the ENGINE holds the brush, so
// a stroke can no longer commit under the previous one, and `draw` paces its
// samples so the engine no longer reads the stroke as a lifted finger and paints
// a stub of it. Polling stays for a third reason those never covered — a correct
// stroke reads flat until an async fill sheet decodes and repaints (see
// REVEAL_SETTLE_MS).
async function drawMagicReveal(page: Page, points: { x: number; y: number }[]) {
  await draw(page, points);
  await expect
    .poll(() => distinctOpaqueColors(page), { timeout: REVEAL_SETTLE_MS })
    .toBeGreaterThanOrEqual(MAGIC_REVEAL_MIN_COLORS);
}

/** Perform the drag-to-clear gesture: pull the clear button past its accept
 *  threshold (0.4 × min viewport) toward the screen center and release. */
async function clearViaGesture(page: Page) {
  const box = await page.locator('#clearButton').boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error('missing clear button box or viewport');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      cx + ((vp.width / 2 - cx) * i) / 12,
      cy + ((vp.height / 2 - cy) * i) / 12
    );
  }
  await page.mouse.up();
}

// Distinct strongly-opaque canvas colors, quantized to `bits` per channel. A
// solid stroke yields ~one bucket; a magic reveal spanning several fill regions
// — or a slice of the rainbow — yields many.
//
// Six bits (buckets 4 wide) rather than a coarser grid because a rainbow reveal
// can cross only a narrow slice of the ramp: the post-clear stroke measured 3-4
// buckets at 4 bits, overlapping MAGIC_REVEAL_MIN_COLORS and failing a few
// percent of randomly generated gradients even though the reveal had painted
// correctly (issue #658). Finer quantization costs nothing on the other side —
// a flat pen pass measured 1-3 buckets at 4, 5 and 6 bits alike, since one
// colour is one bucket however narrow the buckets are.
async function distinctOpaqueColors(page: Page, bits = 6): Promise<number> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c, b) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      const shift = 8 - b;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        const key =
          ((data[i] >> shift) << (2 * b)) | ((data[i + 1] >> shift) << b) | (data[i + 2] >> shift);
        seen.add(key);
      }
      return seen.size;
    }, bits);
  } finally {
    await canvas.dispose();
  }
}

test('the magic brush is always available and paints the coloring page colors', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const magic = page.locator('#magicBrushButton');
  await openBrushMenu(page);
  await expect(magic).toBeVisible(); // available even before a page is applied

  await applyFarmPage(page);

  await pickBrush(page, '#magicBrushButton');
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-brush', 'magic');

  // Paint across the picture: the reveal should show many of the fill's fill
  // colors, not one flat pen color.
  await drawMagicReveal(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
    { x: 400, y: 140 },
    { x: 520, y: 260 },
  ]);

  // Undo reverts the magic stroke.
  await page.locator('#undoButton').click();
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);
});

// Fraction of opaque canvas pixels that are near-black — the fill's own outlines,
// which the reveal must NOT paint. The overlay <img> (a separate element, not on
// the canvas) is the only source of line work; revealing the fill's copy on the
// canvas would double every line under the overlay and ghost on any drift
// (ADR-0043). So the fills-only reveal leaves the canvas essentially black-free.
async function revealedNearBlackFraction(page: Page): Promise<number> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      let opaque = 0;
      let nearBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        opaque++;
        if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) nearBlack++;
      }
      return opaque === 0 ? 0 : nearBlack / opaque;
    });
  } finally {
    await canvas.dispose();
  }
}

test('the magic brush reveals fills only, never the fill outlines (no double lines)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');

  // Sweep across the picture, crossing many black outlines (clouds, cattails,
  // duck, water). Before the outline-masking fix the reveal painted the fill's
  // own black lines onto the canvas here (~2.8% of opaque pixels); the overlay
  // then drew those same lines again, so any drift doubled them. Now the reveal
  // is flat fills, so the canvas stays effectively black-free.
  await drawMagicReveal(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
    { x: 400, y: 140 },
    { x: 520, y: 260 },
    { x: 200, y: 320 },
    { x: 480, y: 360 },
  ]);
  expect(await revealedNearBlackFraction(page)).toBeLessThan(0.005);
});

// Opaque pixels in a thin band at one canvas edge — the letterbox margin —
// that are NOT the active ink colour.
//
// Plain opacity cannot identify the brush: a pen sweep and a magic reveal of the
// same stroke paint the SAME pixel count in both bands (2845 left, 2065 top), so
// a `> 500` opacity threshold passes on a wrong-mode stroke and the redraw retry
// never fires. Counting distinct colours does not save it either — the
// rotation-lock top margin is a flat extension of one edge colour, so pen and
// reveal both quantize to a single bucket there.
//
// What separates them is WHICH colour: a pen paints the active palette ink
// (measured 171,113,225 = TEST_PALETTE.purple), a reveal paints the page's own
// edge colours (measured 201,233,243 sky in the top band). So the discriminating
// measure is "painted something that is not the ink". The tolerance absorbs
// anti-aliasing on the ink, which lands within ~2 per channel.
const INK_MATCH_TOLERANCE = 16;

async function bandNonInkPixels(
  page: Page,
  edge: 'left' | 'top',
  frac: number,
  ink: string
): Promise<number> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate(
      (c, { edge, frac, ink, tol }) => {
        const w = edge === 'left' ? Math.max(1, Math.round(c.width * frac)) : c.width;
        const h = edge === 'top' ? Math.max(1, Math.round(c.height * frac)) : c.height;
        const { data } = c.getContext('2d')!.getImageData(0, 0, w, h);
        const r0 = parseInt(ink.slice(1, 3), 16);
        const g0 = parseInt(ink.slice(3, 5), 16);
        const b0 = parseInt(ink.slice(5, 7), 16);
        let nonInk = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] <= 200) continue;
          if (
            Math.abs(data[i] - r0) <= tol &&
            Math.abs(data[i + 1] - g0) <= tol &&
            Math.abs(data[i + 2] - b0) <= tol
          ) {
            continue;
          }
          nonInk++;
        }
        return nonInk;
      },
      { edge, frac, ink, tol: INK_MATCH_TOLERANCE }
    );
  } finally {
    await canvas.dispose();
  }
}

test('the magic brush paints the letterbox margin by extending the edge colour', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  // The band check below identifies the brush by "painted something other than
  // the ink", so it is only meaningful while purple is the ink. Assert that
  // rather than assume it: if the default swatch ever changes, a pen stroke
  // would read as non-ink and the check would pass on the very stroke it exists
  // to reject.
  await expect(swatch(page, TEST_PALETTE.purple)).toHaveClass(/active/);
  await pickBrush(page, '#magicBrushButton');

  // The margin reveals the extended edge colour instead of staying transparent.
  // Hug the far-left edge, well inside the letterbox band, sweeping top to bottom.
  await draw(page, [
    { x: 3, y: 40 },
    { x: 3, y: 200 },
    { x: 3, y: 360 },
    { x: 3, y: 520 },
  ]);
  // Non-ink pixels, not opacity, is the mode signal — see bandNonInkPixels.
  // Polling lets a valid-but-slow reveal settle; the brush mode itself needs no
  // retry, since pickBrush() returned only once the engine held it (ADR-0080).
  await expect
    .poll(() => bandNonInkPixels(page, 'left', 0.04, TEST_PALETTE.purple), {
      timeout: REVEAL_SETTLE_MS,
    })
    .toBeGreaterThan(BAND_MIN_REVEALED_PX);
});

test('the rotation-lock letterbox margin stays outside the drawable paper', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page); // landscape viewport → wide art

  // Ink locks the paper on rotation (a blank canvas would just re-adopt).
  await draw(page, [
    { x: 200, y: 200 },
    { x: 400, y: 260 },
  ]);

  await rotateViewportViaCdp(page, { width: 720, height: 1280, angle: 90 });
  // The wide paper stays, lifted into the letterboxed sheet with top/bottom margins.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();

  // The band check below identifies the brush by "painted something other than
  // the ink", so it is only meaningful while purple is the ink. Assert that
  // rather than assume it: if the default swatch ever changes, a pen stroke
  // would read as non-ink and the check would pass on the very stroke it exists
  // to reject.
  await expect(swatch(page, TEST_PALETTE.purple)).toHaveClass(/active/);
  await pickBrush(page, '#magicBrushButton');
  const undoDepthBefore = await page.evaluate(
    () => window.__drawingDebug?.getUndoDebug().snapshots
  );
  await draw(page, [
    { x: 40, y: 6 },
    { x: 240, y: 6 },
    { x: 440, y: 6 },
    { x: 660, y: 6 },
  ]);
  // A valid margin stroke can settle after its pointerup while the worker-built
  // magic sheet resolves, so give that deferred repaint its full allowed window.
  await page.waitForTimeout(REVEAL_SETTLE_MS);
  expect(await bandNonInkPixels(page, 'top', 0.05, TEST_PALETTE.purple)).toBe(0);
  expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots)).toBe(
    undoDepthBefore
  );
});

test('the magic brush reveals a rainbow gradient when no coloring page is applied', async ({
  page,
}) => {
  // Two reveals, each polled for up to REVEAL_SETTLE_MS, plus the clear gesture
  // and its asserts: comfortable alone, but the measured 4x latency inflation on
  // a saturated box (ADR-0078 §2) puts that inside the default 30s per-test
  // budget. test.slow() triples the budget rather than shortening the waits.
  test.slow();
  await gotoApp(page);
  await openDrawer(page);

  await pickBrush(page, '#magicBrushButton');
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-brush', 'magic');

  // Drawing across the blank canvas reveals the pre-generated rainbow — a long
  // stroke crosses many hues, so it lays down many distinct colors, not one.
  await drawMagicReveal(page, [
    { x: 100, y: 140 },
    { x: 260, y: 240 },
    { x: 420, y: 160 },
    { x: 560, y: 280 },
  ]);

  // Clearing releases the held rainbow but keeps the magic brush selected (#309)
  // — it draws on a fresh page too, so the child picks up right where they were.
  await clearViaGesture(page);
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-brush', 'magic');
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);

  // Drawing again still reveals colors (a newly picked gradient).
  await drawMagicReveal(page, [
    { x: 120, y: 160 },
    { x: 300, y: 260 },
    { x: 500, y: 180 },
  ]);
});

// Count of strongly-opaque canvas pixels.
async function opaqueCount(page: Page): Promise<number> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 200) n++;
      return n;
    });
  } finally {
    await canvas.dispose();
  }
}

test('the eraser removes magic-brush strokes and later colors override them', async ({ page }) => {
  // A page apply, a reveal, and an eraser pass — each polled for up to
  // REVEAL_SETTLE_MS — reach the default per-test budget once contention inflates
  // them (ADR-0078 §2), so buy budget rather than shorten the waits.
  test.slow();
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  await pickBrush(page, '#magicBrushButton');
  // A diagonal that crosses several fill regions, so the reveal is real ink.
  const line = [
    { x: 120, y: 120 },
    { x: 300, y: 240 },
    { x: 500, y: 160 },
  ];
  await drawMagicReveal(page, line);
  const revealed = await opaqueCount(page);
  expect(revealed).toBeGreaterThan(0);

  // Eraser wipes magic pixels like any other — dragging back along the stroke
  // removes most of it.
  await pickBrush(page, '#eraserButton');
  // An eraser stroke that commits while the engine still holds the magic brush
  // ADDS ink instead of removing it, and the count then never falls — so this
  // waits on the engine's own mode rather than the button (pickBrush, ADR-0080).
  // The poll that remains is for the erase to land, not for the mode.
  await draw(page, line);
  await expect
    .poll(() => opaqueCount(page), { timeout: REVEAL_SETTLE_MS })
    .toBeLessThan(revealed / 2);

  // A solid color drawn afterward overrides the reveal: paint magic, then a
  // single palette color on top, and confirm that flat color is present.
  await pickBrush(page, '#magicBrushButton'); // re-select magic (clears eraser)
  await draw(page, line);
  const red = swatch(page, TEST_PALETTE.red);
  await red.click();
  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS); // color-change debounce
  // Crosses the magic diagonal (~x=300, y=240), so it paints on top of it.
  await draw(page, [
    { x: 200, y: 240 },
    { x: 400, y: 240 },
  ]);
  expect(await hasRedDominantPixel(page)).toBe(true);
});

// The stroke-width control's magic faces are picked by CSS rather than swapped
// reactively, because Icon.svelte renders its SVG through {@html}, which
// hydration does not reconcile — and the magic brush is persisted and seeded
// onto <html> before first paint. A reload while holding it therefore serves
// the ink face, and a reactive branch would keep it forever. Nothing else pins
// those selectors: renaming data-action-panel-live, or adding a brush, would
// paint the wrong face with the whole suite still green.
test('the stroke-width control keeps its magic faces across a reload', async ({ page }) => {
  const trigger = (icon: string) => page.locator(`#strokeWidthButton [data-icon="${icon}"]`);
  const preview = (icon: string) => page.locator(`.stroke-width-menu [data-icon="${icon}"]`);

  await gotoApp(page);
  await openDrawer(page);
  await pickBrush(page, '#magicBrushButton');

  await expect(trigger('line-weight-magic')).toBeVisible();
  await expect(trigger('line-weight-brush')).toBeHidden();

  // The reload is the whole point: the brush comes back from storage, so the
  // server-rendered markup and the client's first value disagree.
  await page.reload();
  await openDrawer(page);

  await expect(trigger('line-weight-magic')).toBeVisible();
  await expect(trigger('line-weight-brush')).toBeHidden();

  // Both faces stay in the DOM — that is what makes the CSS pick possible, and
  // an implementation that dropped one would still pass the assertions above.
  await expect(page.locator('#strokeWidthButton [data-icon]')).toHaveCount(2);

  await page.locator('#strokeWidthButton').click();
  await expect(preview('size-magic-3')).toBeVisible();
  await expect(preview('size-brush-3')).toBeHidden();
});
