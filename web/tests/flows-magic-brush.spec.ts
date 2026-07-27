import { expect, test, type Page } from '@playwright/test';

import { COLOR_CHANGE_DEBOUNCE_SETTLE_MS, draw, gotoApp, swatch, TEST_PALETTE } from './helpers';

import { applyFarmPage, openBrushMenu, openDrawer, pickBrush } from './flows-harness';

// The magic brush reveals by sampling a sheet that rasterizes asynchronously
// (a random rainbow, or an async-decoded coloring-page fill). A stroke drawn
// before the sheet is ready holds its ops out of the paper until the fold-in
// repaint fires, so on a starved parallel worker the reveal can finish painting
// well past a few seconds. Poll magic-reveal assertions against this generous
// window rather than a tight one — see issue #498.
const MAGIC_REVEAL_TIMEOUT = 15_000;

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
  await expect(async () => {
    await draw(page, points);
    try {
      await expect.poll(() => distinctOpaqueColors(page), { timeout: 3000 }).toBeGreaterThan(4);
    } catch {
      await page.locator('#undoButton').click();
      await expect.poll(() => distinctOpaqueColors(page)).toBe(0);
      throw new Error('magic reveal came up flat (engine still in pen mode) — retrying');
    }
  }).toPass({ timeout: MAGIC_REVEAL_TIMEOUT });
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

function hasRedPaintPixel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && data[i] > 200 && data[i + 1] < 120 && data[i + 2] < 120) return true;
    }
    return false;
  });
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

// iOS/WebKit can merge a fast pen tap-then-stroke into one stream whose
// pointerdown never arrives — the engine adopts the stroke from a pointermove
// (orphan-pen recovery) and captures the pointer. The ring must grow from that
// adopted move alone. Synthetic events can't acquire real pointer capture
// (setPointerCapture rejects a fabricated pointerId), so the capture the engine
// takes on adoption is stubbed.
test('an adopted down-less pen stream still grows a brush ring', async ({ page }) => {
  await gotoApp(page);
  const ring = page.locator('.brush-ring');

  // The engine boots before hydration and binds its pointer listeners when a
  // component adopts it on mount (ADR-0072); under parallel load the synthetic
  // move can land before that binding and be dropped, growing no ring. Retry the
  // down-less move until the engine adopts it — re-dispatching is safe, the same
  // pointerId just continues the one adopted stream.
  await expect(async () => {
    await page.evaluate(() => {
      const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      canvas.hasPointerCapture = () => true;
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 88,
          pointerType: 'pen',
          buttons: 1,
          clientX: 300,
          clientY: 220,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await expect(ring).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  await page.evaluate(() => {
    document
      .getElementById('drawingCanvas')!
      .dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 88, pointerType: 'pen', bubbles: true })
      );
  });
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

// Opaque pixel count within a thin band at one canvas edge — the letterbox margin.
function opaquePixelsInLeftBand(page: Page, frac = 0.04): Promise<number> {
  return page.evaluate((f) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const bandW = Math.max(1, Math.round(c.width * f));
    const { data } = c.getContext('2d')!.getImageData(0, 0, bandW, c.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    return opaque;
  }, frac);
}

// A coloring page is contain-fit, so a differently-proportioned viewport letterboxes
// it (left/right in this landscape default). The fill's edge colours are extended
// into those margins so the brush paints the whole canvas with no hard seam — before
// the fix a stroke in the margin revealed nothing (transparent sheet). ADR-0043.
test('the magic brush paints the letterbox margin by extending the edge colour', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');

  // Hug the far-left edge, well inside the letterbox band, sweeping top to bottom.
  await draw(page, [
    { x: 3, y: 40 },
    { x: 3, y: 200 },
    { x: 3, y: 360 },
    { x: 3, y: 520 },
  ]);
  // The margin now reveals the extended edge colour instead of staying transparent.
  await expect
    .poll(() => opaquePixelsInLeftBand(page), { timeout: MAGIC_REVEAL_TIMEOUT })
    .toBeGreaterThan(500);
});

// Opaque pixel count within a thin band at the TOP canvas edge.
function opaquePixelsInTopBand(page: Page, frac = 0.05): Promise<number> {
  return page.evaluate((f) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const bandH = Math.max(1, Math.round(c.height * f));
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, bandH);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    return opaque;
  }, frac);
}

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

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 1280,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 90 },
  });
  // The wide paper stays, lifted into the letterboxed sheet with top/bottom margins.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();

  await pickBrush(page, '#magicBrushButton');
  // Sweep along the very top of the canvas — inside the rotation-lock top margin.
  await draw(page, [
    { x: 40, y: 6 },
    { x: 240, y: 6 },
    { x: 440, y: 6 },
    { x: 660, y: 6 },
  ]);
  await expect
    .poll(() => opaquePixelsInTopBand(page), { timeout: MAGIC_REVEAL_TIMEOUT })
    .toBeGreaterThan(500);
});

test('the magic brush reveals a rainbow gradient when no coloring page is applied', async ({
  page,
}) => {
  // Two drawMagicReveal calls, each bounded by MAGIC_REVEAL_TIMEOUT (15s), can
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
  await draw(page, line);
  const revealed = await opaqueCount(page);
  expect(revealed).toBeGreaterThan(0);

  // Eraser wipes magic pixels like any other — dragging back along the stroke
  // removes most of it.
  await pickBrush(page, '#eraserButton');
  await draw(page, line);
  await expect.poll(() => opaqueCount(page)).toBeLessThan(revealed / 2);

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
  expect(await hasRedPaintPixel(page)).toBe(true);
});
