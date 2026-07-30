import { expect, test } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import { draw, gotoApp } from './helpers';

import { applyFarmPage, openColoringDialog, openDrawer } from './flows-harness';

// ── coloring book overlay ───────────────────────────────────────────────────

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');

  // Farm ships on web and mobile; open it and pick its first page.
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  await expect(dialog).toBeHidden();
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  // The src lands once the art has decoded (the ready-gated swap), so retry.
  await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/.+-(wide|tall)\.outline\.webp$/);
});

// A device rotation with ink on the canvas must NOT swap the page's tall/wide
// art out from under the child's coloring (the two variants are different
// compositions — no mapping exists): the engine locks the paper (ADR-0050) and
// the same art stays applied, presented through the paper-view wrapper. Once
// the canvas is blank again the paper re-adopts and the art swaps normally.
// Rotation is emulated via CDP: new viewport dimensions + a changed Screen
// Orientation angle (a plain resize keeps angle 0 and wouldn't rotate).
test('rotating with ink keeps the same coloring page art until the canvas is blank', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/); // landscape viewport → wide art
  const srcBefore = await overlay.getAttribute('src');

  await draw(page, [
    { x: 200, y: 200 },
    { x: 400, y: 260 },
  ]);

  await rotateViewportViaCdp(page, { width: 720, height: 1280, angle: 90 });

  // The ink locks the paper: the wide art stays applied, lifted into the
  // letterboxed paper sheet instead of being swapped for the tall variant.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
  await expect(overlay).toHaveAttribute('src', srcBefore!);

  // Undo the only stroke → blank canvas → the paper re-adopts the portrait
  // viewport and the art swaps to the tall variant.
  await page.locator('#undoButton').click();
  await expect(overlay).toHaveAttribute('src', /-tall\.outline\.webp$/);
  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
});

// A toddler mashes a launch button several times before noticing the modal
// opened; the follow-up taps land on the fresh backdrop right where the button
// was and would dismiss it. modalDialog arms a short-lived dead zone around the
// launching button (launchGuard) that swallows those taps without dismissing,
// while a tap elsewhere on the backdrop still closes as usual.
test('a repeat tap where the launch button sat does not dismiss the just-opened modal', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const btn = page.locator('#coloringBookButton');
  const box = (await btn.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await btn.click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // Repeat tap on the vacated button spot (now backdrop) — swallowed, stays open.
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeVisible();

  // A backdrop tap away from the launch point still dismisses; only the
  // button's own region is guarded.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 10, 10);
  await expect(dialog).toBeHidden();
});

// A touch tap activates the launcher on pointerup (scribbleTap), so the dialog
// is already open and painted when the tap's trailing synthesized click
// dispatches — and that click is hit-tested at dispatch time, landing on
// whatever book tile sits under the finger. Unless the launch dead zone also
// guards dialog *content*, the picker opens pre-drilled into a "random" book
// (issue #308). Mouse clicks can't reproduce this (a click targets the common
// ancestor of its down/up targets, which is never inside the dialog), so this
// spec taps with a real touchscreen.
test.describe('coloring book picker via touch', () => {
  test.use({ hasTouch: true });

  test('a touch tap on the launcher opens the picker at the root book list', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);

    await page.locator('#coloringBookButton').tap();

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog).toBeVisible();
    // A book tile paints exactly where the finger was (that's what makes the
    // ghost click land); the picker must still show the root book list, not a
    // drilled-in page grid.
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});

test('rotating the viewport swaps the coloring overlay to the matching art', async ({ page }) => {
  // Rotation reaches the overlay through the shared layout module (one
  // resize/orientationchange listener pair feeding every component), so this
  // also guards that viewport tracking stays live after rotation settles.
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(overlay).toHaveAttribute('src', /-tall\.outline\.webp$/);

  await page.setViewportSize({ width: 900, height: 600 });
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/);
});

// The line-art overlay's mix-blend-mode composites against a STALE canvas while a
// stroke is live, so DrawingCanvas damages the blend layer with a translateZ
// epsilon to force it to re-evaluate (issue #307). This pins the CONTRACT that
// damage runs on: at least once while drawing (or #307 is back), and at most once
// per animation frame (or the compositor is asked for work no frame can show).
//
// It drives pointermoves from inside the page rather than through `draw()`: a CDP
// mouse.move costs ~10 ms round-trip, so 40 of them land in 41 frames and a
// per-event nudge is indistinguishable from a per-frame one. Real input is not so
// polite — `perf:ipad:frames` measured 1.9-4.2 pointermoves per presentable frame
// on an iPad Pro, because Safari gives web content a 60 Hz rAF beat while the
// digitizer runs at 120 Hz+. Each move is dispatched in its OWN task, since a
// single task would let Svelte batch the writes and hide the difference either way.
//
// `nudgeBlendLayer` is bound straight to the canvas and takes any contact move, so
// no pointerdown or pointer capture is involved. The nudge is gated on an overlay
// being loaded, hence the coloring page first.
test('the blend layer is damaged once per frame while drawing, not once per input', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  const { transforms, frames, moves } = await page.evaluate(async () => {
    const wrapper = document.querySelector('.paper-view');
    const canvas = document.querySelector('#drawingCanvas');
    if (!wrapper || !canvas) throw new Error('no .paper-view / #drawingCanvas to drive');

    let transforms = 0;
    let frames = 0;
    let running = true;
    const observer = new MutationObserver((records) => {
      transforms += records.length;
    });
    observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
    const tick = () => {
      frames++;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const box = canvas.getBoundingClientRect();
    let moves = 0;
    const started = performance.now();
    // ~2 ms apart: several separate tasks inside every 16.7 ms frame.
    while (performance.now() - started < 400) {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          buttons: 1,
          clientX: box.left + 60 + (moves % 50),
          clientY: box.top + 80 + (moves % 30),
        })
      );
      moves++;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    running = false;
    observer.disconnect();
    return { transforms, frames, moves };
  });

  // The premise of the assertion below: the driving really did outrun the frames.
  expect(moves).toBeGreaterThan(frames);
  // At least one damage, or the blend goes stale mid-stroke again (#307).
  expect(transforms).toBeGreaterThan(0);
  // Never more than the frames that could have shown them. Pre-coalescing this
  // was one per move, i.e. `moves` of them.
  expect(transforms).toBeLessThanOrEqual(frames);
});
