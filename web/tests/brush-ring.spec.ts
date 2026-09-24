import { expect, test, type Locator, type Page } from '@playwright/test';

import { gotoApp, swatch, TEST_PALETTE } from './helpers';

import { openDrawer, pickBrush } from './flows-harness';

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
  await pickBrush(page, '#magicBrushButton');
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-brush', 'magic');
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);
  await expect(ring).toHaveClass(/magic/);
  await page.mouse.up();
  await expect(ring).toHaveCount(0);
});

// How long the coalescing probe below drives pointermoves. Long enough that the
// frame count is not dominated by scheduling noise, short enough to stay well
// inside a default test timeout.
const RING_COALESCING_DRIVE_MS = 400;
// Gap between dispatched moves. Well under a 16.7 ms frame, so several separate
// tasks land inside every frame — which is the condition the assertion needs.
const RING_COALESCING_MOVE_GAP_MS = 2;

// The ring has exactly one visible position per painted frame, so its transform
// is written once per FRAME rather than once per input event. This pins that
// contract from both sides: the ring still moves while drawing, and never more
// often than the frames that could have shown a move.
//
// It drives pointermoves from inside the page rather than through `draw()`: a CDP
// mouse.move costs ~10 ms round-trip, so the moves land roughly one per frame and
// a per-event write is indistinguishable from a per-frame one. Real input is not
// so polite — Safari gives web content a 60 Hz rAF beat while an iPad digitizer
// delivers 120 Hz+. Each move is dispatched in its OWN task, since a single task
// would let Svelte batch the writes and hide the difference either way.
test('the brush ring transform is written once per frame, not once per input', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const ring = page.locator('.brush-ring');
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);

  const { writes, frames, moves } = await page.evaluate(
    async ([driveMs, gapMs]) => {
      const ringEl = document.querySelector('.brush-ring');
      const canvas = document.querySelector('#drawingCanvas');
      if (!ringEl || !canvas) throw new Error('no .brush-ring / #drawingCanvas to drive');

      let writes = 0;
      let frames = 0;
      let running = true;
      const observer = new MutationObserver((records) => {
        writes += records.length;
      });
      observer.observe(ringEl, { attributes: true, attributeFilter: ['style'] });
      const tick = () => {
        frames++;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      const rect = canvas.getBoundingClientRect();
      let moves = 0;
      const started = performance.now();
      while (performance.now() - started < driveMs) {
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            buttons: 1,
            clientX: rect.left + 60 + (moves % 50),
            clientY: rect.top + 80 + (moves % 30),
          })
        );
        moves++;
        await new Promise((resolve) => setTimeout(resolve, gapMs));
      }

      running = false;
      observer.disconnect();
      return { writes, frames, moves };
    },
    [RING_COALESCING_DRIVE_MS, RING_COALESCING_MOVE_GAP_MS]
  );

  // The premise of the assertion below: the driving really did outrun the frames.
  expect(moves).toBeGreaterThan(frames);
  // The ring still tracks the finger.
  expect(writes).toBeGreaterThan(0);
  // Never more than the frames that could have shown them. Pre-coalescing this
  // was one per move, i.e. `moves` of them.
  expect(writes).toBeLessThanOrEqual(frames);

  await page.mouse.up();
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
