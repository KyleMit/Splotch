import { expect, test, type Locator, type Page } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import {
  COLOR_CHANGE_DEBOUNCE_SETTLE_MS,
  draw,
  gotoApp,
  hasRedDominantPixel,
  swatch,
  TEST_PALETTE,
} from './helpers';

import { applyFarmPage, openBrushMenu, openDrawer, pickBrush } from './flows-harness';

// The magic brush reveals by sampling a sheet that rasterizes asynchronously
// (a random rainbow, or an async-decoded coloring-page fill). A stroke drawn
// before the sheet is ready holds its ops out of the paper until the fold-in
// repaint fires, so on a starved parallel worker the reveal can finish painting
// well past a few seconds. Poll magic-reveal assertions against this generous
// window rather than a tight one — see issue #498.
// It was briefly raised to 30s (ADR-0078). Re-measuring killed that: the extra
// budget fixed nothing at one worker, where there is no contention to blame,
// and it forced test.slow() everywhere — which turned a stuck reveal into a 90s
// job, past the suite's ~70s parallel floor, so one bad test became the whole
// run's critical path. This is the outer backstop only; what a stuck reveal
// costs is bounded by MAGIC_REVEAL_MAX_ATTEMPTS instead, so widening this window
// no longer widens that failure.
const MAGIC_REVEAL_TIMEOUT = 15_000;

// How long a *correct* stroke may legitimately read unchanged before the fold-in
// repaint lands, so a per-attempt poll waits it out instead of undoing a
// valid-but-slow stroke. The eraser pass settles through the same path, so it
// shares the window.
const REVEAL_ATTEMPT_SETTLE_MS = 3000;

// A magic reveal spans many fill colours; a flat pen pass yields ~one bucket.
const MAGIC_REVEAL_MIN_COLORS = 4;

// A correct reveal repaints essentially the whole band (measured 2845 left,
// 2065 top); a wrong-mode pen pass leaves none of it, so this only has to clear
// the anti-aliasing noise floor.
const BAND_MIN_REVEALED_PX = 500;

// Attempts, not wall clock, is the right bound on a redraw loop. A wrong-mode
// stroke is already committed, so a loop that keeps redrawing either recovers on
// the next attempt — once the $effect has landed the mode is correct for good —
// or it is stuck and no further attempt can change that. Wall clock cannot tell
// those apart, so `toPass({ timeout })` alone spends the entire budget on the
// stuck case and fails anyway, and at 4 workers a job that long becomes the
// suite's makespan (ADR-0078).
//
// Measured over 328 samples across 1/2/4/8 workers (issue #650): every success
// landed by attempt 2 (317 on the first, 10 on the second), while the one
// non-converging case ran 4 attempts and burned the full budget. Three leaves a
// spare attempt above that tail, so a valid-but-slow reveal keeps its second
// chance and the stuck case stops paying for it.
const MAGIC_REVEAL_MAX_ATTEMPTS = 3;

// Retry a draw-and-check that a wrong brush mode can defeat, bounded by BOTH the
// attempt cap and MAGIC_REVEAL_TIMEOUT — whichever comes first. The timeout
// stays as the outer backstop for a worker starved enough that a single attempt
// runs long; the cap is what stops a non-converging loop. `what` names the pass
// in the failure message.
async function redrawUntilPasses(what: string, attempt: () => Promise<void>) {
  const deadline = Date.now() + MAGIC_REVEAL_TIMEOUT;
  for (let tries = 1; ; tries++) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (tries < MAGIC_REVEAL_MAX_ATTEMPTS && Date.now() < deadline) continue;
      throw new Error(
        `${what} never landed in ${tries} attempt(s) — the engine stayed in the previous brush ` +
          `mode, which no further redraw recovers (see MAGIC_REVEAL_MAX_ATTEMPTS).`,
        { cause: error }
      );
    }
  }
}

// Draw a magic-brush stroke and confirm its reveal actually landed (more than a
// flat pen colour), retrying the whole stroke on a miss. The brush→engine
// magic-mode toggle flows through a Svelte $effect (DrawingCanvas), so for a
// spell after the button reads `aria-pressed=true` the engine can still be in
// pen mode under parallel load — a stroke drawn then paints one flat pen colour
// that never folds in (its pixels are already committed). Each missed attempt is
// undone so exactly the one successful magic stroke remains on the canvas,
// keeping any downstream undo/clear assertion valid. Use this instead of a bare
// `draw` + a single colour-count poll whenever the assertion needs the reveal's
// many colours (a canvas-fill count is immune — a pen stroke fills it too).
//
// The two waits are distinct and both needed. A *correct* stroke can read flat
// for a moment — a coloring-page fill sheet rasterizes async, holding the ops
// out of the paper until the fold-in repaint (see MAGIC_REVEAL_TIMEOUT) — so a
// per-attempt poll waits the colours out before judging. Only a stroke that
// stays flat past that inner window is a real pen-mode miss; undo it and let the
// outer retry redraw. Reading the colour count once instead would undo those
// valid-but-slow strokes and churn draw→undo→draw to the timeout.
async function drawMagicReveal(page: Page, points: { x: number; y: number }[]) {
  await redrawUntilPasses('magic reveal', async () => {
    await draw(page, points);
    try {
      await expect
        .poll(() => distinctOpaqueColors(page), { timeout: REVEAL_ATTEMPT_SETTLE_MS })
        .toBeGreaterThan(MAGIC_REVEAL_MIN_COLORS);
    } catch {
      await page.locator('#undoButton').click();
      await expect.poll(() => distinctOpaqueColors(page)).toBe(0);
      throw new Error('magic reveal came up flat (engine still in pen mode)');
    }
  });
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
// yields many — the signal that the brush painted the sheet, not a flat color.
function distinctOpaqueColors(page: Page, bits = 4): Promise<number> {
  return page.evaluate((b) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
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
  await expect(magic).toHaveAttribute('aria-pressed', 'true');

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

// Issue #187: while a stroke is live, an area-of-impact ring tracks the pointer —
// subtle grey for the pen, rainbow for the magic brush so its reveal behavior is
// legible. The ring exists only between pointerdown and pointerup.
test('drawing shows a brush impact ring, rainbow-flavored for the magic brush', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const ring = page.locator('.brush-ring');
  await expect(ring).toHaveCount(0);

  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Pen: ring appears on pointerdown, follows the stroke, and leaves on lift.
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);
  await expect(ring).not.toHaveClass(/magic/);
  await page.mouse.move(box.x + 250, box.y + 180);
  await expect(ring).toHaveCount(1);
  await page.mouse.up();
  await expect(ring).toHaveCount(0);

  // Magic brush: same ring, rainbow-flavored.
  const magic = page.locator('#magicBrushButton');
  await pickBrush(page, '#magicBrushButton');
  await expect(magic).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);
  await expect(ring).toHaveClass(/magic/);
  await page.mouse.up();
  await expect(ring).toHaveCount(0);
});

// A palette press mid-stroke ends the stroke through releaseAllPointers() — the
// canvas never sees a pointerup for the drawing finger, so the ring must leave
// with the engine's capture release (lostpointercapture), not linger and stick.
test('a palette press mid-stroke removes the live brush ring', async ({ page }) => {
  await gotoApp(page);

  const ring = page.locator('.brush-ring');
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 200, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200);
  await expect(ring).toHaveCount(1);

  // The second finger pressing a swatch, dispatched synthetically — one real
  // mouse can't press two places at once. handlePaletteDown fires on
  // pointerdown and calls releaseAllPointers().
  await swatch(page, TEST_PALETTE.blue).evaluate((selectedSwatch) => {
    selectedSwatch.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 77,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect(ring).toHaveCount(0);

  await page.mouse.up();
});

// Fire a down-less pen contact move from `target` at the canvas centre — the
// merged stream the engine adopts as a stroke start (orphan-pen recovery) —
// until it grows a ring, and answer the pointerId that did. Each attempt uses a
// FRESH pointerId: the engine boots before hydration and only gains the
// component's onStrokeStart when the component adopts it on mount (ADR-0072),
// so under parallel load an early move can be adopted with no ring to show for
// it, and only the move that STARTS a stroke reports one — re-dispatching an
// already-live id could never grow the ring.
async function adoptDownLessPenStream(page: Page, target: Locator, ring: Locator) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  let pointerId = 88;
  await expect(async () => {
    pointerId++;
    await target.evaluate(
      (el, stream) => {
        el.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: stream.pointerId,
            pointerType: 'pen',
            buttons: 1,
            clientX: stream.x,
            clientY: stream.y,
            bubbles: true,
            cancelable: true,
          })
        );
      },
      { ...point, pointerId }
    );
    await expect(ring).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  return pointerId;
}

// Adoption captures the stream to the canvas, so its pointerup lands there.
async function liftAdoptedPen(page: Page, pointerId: number) {
  await page.evaluate((id) => {
    document
      .getElementById('drawingCanvas')!
      .dispatchEvent(
        new PointerEvent('pointerup', { pointerId: id, pointerType: 'pen', bubbles: true })
      );
  }, pointerId);
}

// iOS/WebKit can merge a fast pen tap-then-stroke into one stream whose
// pointerdown never arrives — the engine adopts the stroke from a pointermove
// that hit-tests onto the canvas (orphan-pen recovery in draw()) and reports it
// through onStrokeStart. That report is the ring's only source here: this
// component never sees such a stroke begin.
test('an adopted down-less pen stream still grows a brush ring', async ({ page }) => {
  await gotoApp(page);
  const ring = page.locator('.brush-ring');

  const pointerId = await adoptDownLessPenStream(page, page.locator('#drawingCanvas'), ring);
  await liftAdoptedPen(page, pointerId);
  await expect(ring).toHaveCount(0);
});

// The other flavor of the same merge: WebKit keeps delivering the down-less
// stream to the control the merged tap began on, so the canvas's own listeners
// never see the adopting move at all — only the engine's window-level
// adoptStrayPenStream does, on a pen contact whose tip is over exposed canvas.
// Nothing the component can observe itself marks that stroke's start.
test('a down-less pen stream adopted from a UI control still grows a brush ring', async ({
  page,
}) => {
  await gotoApp(page);
  const ring = page.locator('.brush-ring');

  const pointerId = await adoptDownLessPenStream(page, swatch(page, TEST_PALETTE.blue), ring);
  await liftAdoptedPen(page, pointerId);
  await expect(ring).toHaveCount(0);
});

// Fraction of opaque canvas pixels that are near-black — the fill's own outlines,
// which the reveal must NOT paint. The overlay <img> (a separate element, not on
// the canvas) is the only source of line work; revealing the fill's copy on the
// canvas would double every line under the overlay and ghost on any drift
// (ADR-0043). So the fills-only reveal leaves the canvas essentially black-free.
function revealedNearBlackFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
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

function bandNonInkPixels(
  page: Page,
  edge: 'left' | 'top',
  frac: number,
  ink: string
): Promise<number> {
  return page.evaluate(
    ({ edge, frac, ink, tol }) => {
      const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
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
  // The stroke is redrawn rather than merely polled: magic mode reaches the
  // engine through a Svelte $effect, so a stroke dispatched too early commits as
  // a flat pen pass, and no amount of polling recovers a stroke that already
  // painted in the wrong mode. Accumulating strokes is harmless here — nothing
  // downstream depends on the canvas holding exactly one.
  await redrawUntilPasses('left-band reveal', async () => {
    // Hug the far-left edge, well inside the letterbox band, sweeping top to bottom.
    await draw(page, [
      { x: 3, y: 40 },
      { x: 3, y: 200 },
      { x: 3, y: 360 },
      { x: 3, y: 520 },
    ]);
    // Non-ink pixels, not opacity, is the mode signal — see bandNonInkPixels.
    // Polling lets a valid-but-slow reveal settle; a stroke still reading as ink
    // past that window really did commit in pen mode, and only a redraw fixes it.
    await expect
      .poll(() => bandNonInkPixels(page, 'left', 0.04, TEST_PALETTE.purple), {
        timeout: REVEAL_ATTEMPT_SETTLE_MS,
      })
      .toBeGreaterThan(BAND_MIN_REVEALED_PX);
  });
});

// The case the user hit: after a rotation-with-ink the paper LOCKS (ADR-0050) and is
// contain-fit into the new viewport, leaving letterbox margins around the whole page
// (not just inside it). The magic sheet now covers the mapped viewport, so the brush
// paints those margins too — before, they revealed nothing even though a pen could
// draw there. Rotation is emulated via CDP (new metrics + a changed orientation angle).
test('the magic brush paints the rotation-lock letterbox margin', async ({ page }) => {
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
  // Redrawn rather than polled for the same reason as the left-band case above:
  // a stroke that commits before the engine leaves pen mode can only be fixed by
  // drawing again. This margin is reachable by a pen too (see the note above), so
  // the colour count is doing the discriminating.
  await redrawUntilPasses('top-band reveal', async () => {
    // Sweep along the very top of the canvas — inside the rotation-lock top margin.
    await draw(page, [
      { x: 40, y: 6 },
      { x: 240, y: 6 },
      { x: 440, y: 6 },
      { x: 660, y: 6 },
    ]);
    // Non-ink pixels, not opacity, is the mode signal — see bandNonInkPixels.
    // Polling lets a valid-but-slow reveal settle; a stroke still reading as ink
    // past that window really did commit in pen mode, and only a redraw fixes it.
    await expect
      .poll(() => bandNonInkPixels(page, 'top', 0.05, TEST_PALETTE.purple), {
        timeout: REVEAL_ATTEMPT_SETTLE_MS,
      })
      .toBeGreaterThan(BAND_MIN_REVEALED_PX);
  });
});

test('the magic brush reveals a rainbow gradient when no coloring page is applied', async ({
  page,
}) => {
  // Two drawMagicReveal calls, each bounded by MAGIC_REVEAL_MAX_ATTEMPTS, can
  // together approach the default 30s per-test budget under load — the clear
  // gesture and asserts still need room. test.slow() triples it so a worst-case
  // pair of slow reveals can't trip a test-level timeout.
  test.slow();
  await gotoApp(page);
  await openDrawer(page);

  const magic = page.locator('#magicBrushButton');
  await pickBrush(page, '#magicBrushButton');
  await expect(magic).toHaveAttribute('aria-pressed', 'true');

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
  await expect(magic).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);

  // Drawing again still reveals colors (a newly picked gradient).
  await drawMagicReveal(page, [
    { x: 120, y: 160 },
    { x: 300, y: 260 },
    { x: 500, y: 180 },
  ]);
});

// Count of strongly-opaque canvas pixels.
function opaqueCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) n++;
    return n;
  });
}

test('the eraser removes magic-brush strokes and later colors override them', async ({ page }) => {
  // Two bounded redraw loops compose here — the reveal, then the eraser pass,
  // which lags through the same $effect — so a worst case would reach the default
  // per-test budget with the setup still to pay for.
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
  // Eraser mode reaches the engine through the same Svelte $effect as the magic
  // toggle, so a stroke drawn too early is still a magic pass and ADDS ink
  // instead of removing it. That stroke is already committed, so redraw rather
  // than poll a count that will never fall on its own.
  await redrawUntilPasses('eraser pass', async () => {
    await draw(page, line);
    await expect
      .poll(() => opaqueCount(page), { timeout: REVEAL_ATTEMPT_SETTLE_MS })
      .toBeLessThan(revealed / 2);
  });

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
