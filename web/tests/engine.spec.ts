import { expect, test, type Page } from '@playwright/test';

// Engine-level tests. These drive the real imperative drawing engine through
// the /dev/engine harness (see src/routes/dev/engine), which mounts a real
// <canvas> via the same initDrawingCanvas() seam the app uses and exposes the
// engine API + pixel readers on window. Strokes are real Playwright pointer
// input on the canvas; undo/clear are invoked the way the app's buttons do.

/** Drag a stroke through the given canvas-space points using real mouse input. */
async function drawStroke(
  page: Page,
  box: { x: number; y: number } | null,
  points: { x: number; y: number }[]
) {
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    await page.mouse.move(box.x + p.x, box.y + p.y);
  }
  await page.mouse.up();
}

const state = (page: Page) => page.evaluate(() => window.__engineState);
const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());

test.beforeEach(async ({ page }) => {
  // Navigate ONCE, then poll for readiness. The harness sets window.__engineReady
  // in onMount. Against the default `vite preview` build this settles on the
  // first poll; under DEV_SERVER=1 (`vite dev`) the first load can trigger a
  // dep-optimize full-reload, so we ride through it by polling (swallowing the
  // brief "execution context destroyed" while the reload is in flight). We must
  // NOT re-navigate while polling — a fresh goto each retry keeps interrupting
  // the reload before onMount can finish, which never converges.
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});

test('a stroke paints pixels and flips canvasEmpty false', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 160, y: 120 },
  ]);

  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('undo reverts a stroke back to an empty canvas', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 50, y: 50 },
    { x: 150, y: 150 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // The only stroke was undone back to the blank paper — nothing left to undo.
  expect(s.canUndo).toBe(false);
});

test('undo preserves and rebases a stroke that is still in progress', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await drawStroke(page, box, [
    { x: 40, y: 40 },
    { x: 120, y: 40 },
  ]);

  await page.mouse.move(box.x + 180, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 180);

  await page.evaluate(() => window.__engine.undo());

  expect(await page.evaluate(() => window.__engine.pixelAt(60, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(220, 180)[3])).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false);

  await page.mouse.up();

  let s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('the undo stack caps at 20 — you cannot undo all the way past the cap', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // 22 distinct strokes → 22 snapshots pushed, but only the last 20 are
  // retained (MAX_UNDO_STACK_SIZE); the older two drop off the stack while
  // their ink stays on the paper.
  for (let i = 0; i < 22; i++) {
    const y = 14 + i * 12;
    await drawStroke(page, box, [
      { x: 30, y },
      { x: 270, y },
    ]);
  }

  let undos = 0;
  while (await page.evaluate(() => window.__engineState.canUndo)) {
    await page.evaluate(() => window.__engine.undo());
    undos++;
    if (undos > 30) break; // safety net against an unbounded stack regression
  }

  expect(undos).toBe(20);
  // The two overflow strokes stay on the paper, so the canvas can't reach blank.
  expect(await count(page)).toBeGreaterThan(0);
});

test('clearing the canvas is itself undoable', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  const drawn = await count(page);
  expect(drawn).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
  expect((await state(page)).canUndo).toBe(true); // clear pushed an undo command

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0); // the drawing came back
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('a clear during an in-flight stroke does not resurrect the wiped ink on rebuild', async ({
  page,
}) => {
  // Reachable in the app: drag-to-clear releases pointers at drag *start* but
  // fires onClear at drag *end*, so a second finger can be mid-stroke when the
  // clear lands. The stroke's pre-clear ops must not survive into the command
  // that commits after the clear, or the fold (and any repaint of the still-
  // uncommitted stroke) would repaint ink the user saw erased.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Stroke along the top edge, held down...
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40);

  // ...clear fires mid-gesture and wipes it...
  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);

  // ...and the same stroke continues elsewhere before lifting.
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.move(box.x + 260, box.y + 200);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canvasEmpty).toBe(false); // post-clear ink counts as content

  // Undoing a later stroke restores the snapshot taken after the clear + the
  // straddling stroke.
  await drawStroke(page, box, [
    { x: 200, y: 260 },
    { x: 260, y: 260 },
  ]);
  await page.evaluate(() => window.__engine.undo());

  const preClearPixel = await page.evaluate(() => window.__engine.pixelAt(60, 40));
  expect(preClearPixel[3]).toBe(0); // the wiped top-edge ink stayed gone
  expect(await count(page)).toBeGreaterThan(0); // the post-clear segment survived

  // Undoing the straddling stroke lands back on the cleared (empty) canvas.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('the eraser removes pixels and re-scans empty on stroke end', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 80 },
    { x: 140, y: 80 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  // Switch to a wide eraser and sweep over the whole stroke with margin.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 40, y: 80 },
    { x: 160, y: 80 },
  ]);

  // stopDrawing re-scans the bitmap after an erase, so the empty flag tracks it.
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('erasing only part of the drawing leaves the canvas non-empty', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // Two well-separated strokes.
  await drawStroke(page, box, [
    { x: 40, y: 50 },
    { x: 120, y: 50 },
  ]);
  await drawStroke(page, box, [
    { x: 40, y: 230 },
    { x: 120, y: 230 },
  ]);
  expect((await state(page)).canvasEmpty).toBe(false);

  // Erase only the top stroke.
  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 30, y: 50 },
    { x: 130, y: 50 },
  ]);

  expect(await count(page)).toBeGreaterThan(0); // bottom stroke survives
  expect((await state(page)).canvasEmpty).toBe(false);
});

test('a pointer resumed far away after an idle gap does not draw a connecting line', async ({
  page,
}) => {
  // iOS/WebKit can merge a fast tap-then-drag into one pointer stream, dropping
  // the pointerup + pointerdown and resuming the SAME pointer at a new spot.
  // Reproduce it directly: press, idle past the resume gap, then move far away
  // WITHOUT lifting — the engine must restart the stroke instead of bridging
  // the two spots with a stray line.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(box.x + 260, box.y + 260);
  await page.mouse.up();

  // The diagonal midpoint between the two spots stays blank — no connecting line.
  const midAlpha = await page.evaluate(() => window.__engine.pixelAt(150, 150)[3]);
  expect(midAlpha).toBe(0);
});

test('a color change debounces the immediately-following touch/mouse stroke', async ({ page }) => {
  // Same synchronous tick as the color change → < 100ms → the mouse stroke is
  // dropped (prevents color-bleed artifacts right after picking a color).
  const dropped = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'mouse'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  // Past the 100ms window, the same stroke paints.
  await page.waitForTimeout(150);
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'mouse'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('a pen pointer bypasses the color-change debounce', async ({ page }) => {
  // pointerType 'pen' has requiredDelay 0 — a stylus stroke right after a color
  // change must paint immediately (a child drawing fast shouldn't drop strokes).
  const painted = await page.evaluate(() => {
    window.__engine.setColor('#0000ff');
    window.__engine.strokeSync(
      [
        { x: 60, y: 60 },
        { x: 200, y: 60 },
      ],
      'pen'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

// iOS/WebKit can merge a fast pen tap on a UI control (a sidebar color swatch)
// with the stroke that follows into ONE pointer stream: the intervening
// pointerup + pointerdown are dropped, and — pens getting no implicit capture —
// the surviving pointermoves hit-test onto the canvas with no pointerdown ever
// delivered there. Before the recovery in draw(), the whole first stroke after
// picking a color with an Apple Pencil was silently dropped.
test('a pen contact stream whose pointerdown was merged away still paints', async ({ page }) => {
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, x: number, y: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'pen',
          buttons,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    fire('pointermove', 60, 60, 1);
    fire('pointermove', 140, 90, 1);
    fire('pointermove', 220, 120, 1);
    fire('pointerup', 220, 120, 0);
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('pen hover moves (tip not touching) never paint', async ({ page }) => {
  // Apple Pencil hover (M2+) streams pointermoves with buttons === 0. The
  // merged-stream recovery must not mistake hovering for a lost stroke.
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    for (const [x, y] of [
      [60, 60],
      [140, 90],
      [220, 120],
    ]) {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'pen',
          buttons: 0,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    }
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

// The other flavor of the merge: WebKit keeps delivering the down-less stream
// to the control the merged tap started on (the swatch), so the canvas's own
// listeners never fire. The engine's window-level adoption must catch a pen
// contact move whose tip is physically over the canvas regardless of the
// event's target; from there capture retargets the stream to the canvas
// (simulated here by dispatching the rest on the canvas).
test('a merged pen stream still targeted at a UI control paints once over the canvas', async ({
  page,
}) => {
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (target: EventTarget, type: string, x: number, y: number, buttons: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'pen',
          buttons,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    fire(document.body, 'pointermove', 60, 60, 1);
    fire(canvas, 'pointermove', 140, 90, 1);
    fire(canvas, 'pointermove', 220, 120, 1);
    fire(canvas, 'pointerup', 220, 120, 0);
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

// Adoption must only fire for streams whose pointerdown was genuinely dropped.
// A pen gesture that BEGAN on a UI control with a delivered pointerdown
// (drag-to-clear, a picker drag, a slide off a swatch) crossing the canvas
// looks identical move-by-move — the live down is the discriminator.
test('a pen drag that started with a delivered pointerdown on UI never paints', async ({
  page,
}) => {
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (target: EventTarget, type: string, x: number, y: number, buttons: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'pen',
          buttons,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    fire(document.body, 'pointerdown', 350, 350, 1);
    fire(canvas, 'pointermove', 60, 60, 1);
    fire(canvas, 'pointermove', 140, 90, 1);
    fire(document.body, 'pointerup', 350, 350, 0);
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

// iPadOS Scribble claims an Apple Pencil stroke that starts within ~450ms of a
// pen tap: the pointer events still arrive and the engine paints, but the
// system never presents those frames — the ink is invisible and never pops in.
// Cancelling the parallel TOUCH stream is the only thing that makes Scribble
// let go (pointer-event preventDefault does not; confirmed on-device).
test('the canvas cancels its touch stream so iPadOS Scribble releases pen strokes', async ({
  page,
}) => {
  const prevented = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    return ['touchstart', 'touchmove'].map((type) => {
      const touch = new Touch({ identifier: 1, target: canvas, clientX: 50, clientY: 50 });
      const e = new TouchEvent(type, {
        touches: [touch],
        changedTouches: [touch],
        cancelable: true,
        bubbles: true,
      });
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    });
  });
  expect(prevented).toEqual([true, true]);
});

// The harness canvas is 300×300 at the viewport origin (renderScale 1) — a
// square is treated as portrait (width ≤ height), so the bottom band
// (EDGE_SWIPE_BAND_PX = 24) is y ≥ 276. Portrait guards the bottom from
// orientation alone, needing no injected insets; landscape tests resize the
// canvas wider than tall.
test('in portrait a touch swiping up from the bottom edge is discarded as the OS gesture', async ({
  page,
}) => {
  const dropped = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 290 },
        { x: 60, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // A discarded swipe never snapshots, so the undo button stays disabled.
  expect(s.canUndo).toBe(false);
});

test('a touch starting at the bottom edge but moving sideways still draws', async ({ page }) => {
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 290 },
        { x: 220, y: 290 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);
});

test('an upward touch that starts above the bottom band draws normally', async ({ page }) => {
  // Only the edge band is special — an upward stroke from mid-canvas is a real
  // stroke, not the system gesture.
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 60, y: 150 },
        { x: 60, y: 90 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('a stationary tap at a guarded edge still leaves a dot', async ({ page }) => {
  // Lifting before the direction is decided is a tap, not a swipe, so it commits.
  const painted = await page.evaluate(() => {
    window.__engine.strokeSync([{ x: 60, y: 290 }], 'touch');
    return window.__engine.nonTransparentCount();
  });
  expect(painted).toBeGreaterThan(0);
});

test('in phone landscape the guard moves to the short side edges, not the long bottom', async ({
  page,
}) => {
  // A phone's physical-bottom navbar rotates to a short side edge in landscape.
  // No insets are injected — orientation alone guards both short edges, so this
  // works even where the OS exposes no safe-area insets.
  await page.evaluate(() => window.__engine.resizeTo(400, 300));

  // A swipe inward from the short left edge is the OS gesture → discarded.
  const fromSide = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 8, y: 150 },
        { x: 70, y: 150 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(fromSide).toBe(0);

  // A stroke swiping up from the long bottom edge is NOT the navbar gesture on a
  // phone in landscape, so it must still draw.
  const fromBottom = await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 200, y: 290 },
        { x: 200, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(fromBottom).toBeGreaterThan(0);
});

test('in tablet landscape a reported bottom inset additionally guards the long bottom', async ({
  page,
}) => {
  // A tablet keeps its home indicator on the long bottom in landscape; the OS
  // reports an inset there, so an upward swipe from that edge is discarded.
  const dropped = await page.evaluate(async () => {
    await window.__engine.resizeTo(400, 300);
    window.__engine.setSafeAreaInsets({ top: 0, right: 0, bottom: 30, left: 0 });
    window.__engine.strokeSync(
      [
        { x: 200, y: 290 },
        { x: 200, y: 230 },
      ],
      'touch'
    );
    return window.__engine.nonTransparentCount();
  });
  expect(dropped).toBe(0);
});

test('an export started just before a clear still captures the drawing (save-on-delete race)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  // Mirrors ClearButton's onClear: saveDrawingIfEnabled() fire-and-forgets the
  // export, then clearCanvas() runs synchronously — before the export's first
  // internal await (the paper-texture load) resolves. The exported blob must
  // contain the stroke, not the post-clear blank canvas.
  const redPixels = await page.evaluate(async () => {
    const blobPromise = window.__engine.exportCanvasBlob();
    window.__engine.clearCanvas();
    return window.__engine.blobRedPixelCount(await blobPromise);
  });

  expect(redPixels).toBeGreaterThan(0);
  expect(await count(page)).toBe(0); // the clear itself still landed
});

test('undoing an eraser stroke replays the erased pixels back', async ({ page }) => {
  // Undo must revert a destination-out stroke like any other: the pre-erase
  // snapshot (ADR-0066) still holds the pen stroke's pixels, so restoring it
  // brings the erased pixels back and the canvas is non-empty again.
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 80 },
    { x: 200, y: 80 },
  ]);
  const drawn = await count(page);
  expect(drawn).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__engine.setStrokeWidth(24);
    window.__engine.setEraserMode(true);
  });
  await drawStroke(page, box, [
    { x: 40, y: 80 },
    { x: 220, y: 80 },
  ]);
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  // The erase is reverted — the original pen stroke is back, pixel-for-pixel.
  expect(await count(page)).toBe(drawn);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true); // the pen stroke remains undoable
});

test('a moderate stroke is one snapshot and undoes cleanly', async ({ page }) => {
  // One gesture → one snapshot on the undo stack, whatever the op volume.
  // strokeSync gives a deterministic one-seg-per-move op stream.
  const points = Array.from({ length: 120 }, (_, i) => ({
    x: 20 + i * 2,
    y: 150 + Math.round(60 * Math.sin(i / 40)),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.snapshots).toBe(1);

  // Still one undo unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a pathological all-corners gesture is still one snapshot and one undo step', async ({
  page,
}) => {
  // A gesture that is genuinely all direction changes produces hundreds of raw
  // ops. The stack must stay one snapshot per gesture (this exact shape used to
  // trigger the ADR-0035 keyframe safety net; snapshots make it the same cost
  // as any other stroke) and undo must revert it in one blit.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.snapshots).toBe(1);

  // Undo still reverts the whole gesture in one step, back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a dense zigzag survives a resize, repainted from the paper raster', async ({ page }) => {
  // A resize wipes the visible backing store; the repaint is one blit of the
  // committed paper — the drawing must still be there afterward.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The drawing persists after the resize, repainted from the paper.
  expect(await count(page)).toBeGreaterThan(0);

  // And it still undoes as a single unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a back-and-forth scribble keeps its full extent after a rebuild (tip fidelity)', async ({
  page,
}) => {
  // The resize repaint blits the committed paper, so the scribble's tips must
  // survive exactly (the ADR-0036 simplification era shrank them ~25% until the
  // curve family was fixed; a blit can't shrink anything — this pins that).
  const pts: { x: number; y: number }[] = [{ x: 50, y: 40 }];
  let y = 40;
  let dir = 1;
  for (let s = 0; s < 8; s++) {
    const from = dir > 0 ? 50 : 250;
    const to = dir > 0 ? 250 : 50;
    for (let i = 1; i <= 20; i++) {
      y += 1.4;
      pts.push({ x: from + (to - from) * (i / 20), y });
    }
    dir *= -1;
  }
  await page.evaluate((p) => window.__engine.strokeSync(p), pts);

  const before = await page.evaluate(() => window.__engine.inkBounds());
  if (!before) throw new Error('nothing drawn');

  // Force a repaint of the visible canvas from the paper raster.
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const after = await page.evaluate(() => window.__engine.inkBounds());
  if (!after) throw new Error('rebuild produced an empty canvas');

  // The horizontal span survives — the tips still reach (the old undershoot
  // shrank this by tens of px; allow only a few px of antialiasing slack).
  expect(after.maxX).toBeGreaterThanOrEqual(before.maxX - 4);
  expect(after.minX).toBeLessThanOrEqual(before.minX + 4);
});

test('a sharp corner stays sharp and in place after a rebuild (corner fidelity)', async ({
  page,
}) => {
  // The rebuild is a blit of the committed paper, so a hook's sharp corner must
  // keep its exact reach (the simplification era could round and displace it by
  // tens of px). Draw the hook, rebuild, and check the corner's reach.
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) pts.push({ x: 40 + i * 3, y: 150 }); // long horizontal arm
  for (let i = 1; i <= 18; i++) pts.push({ x: 220 - i * 2, y: 150 - i * 6 }); // sharp hook up-left
  await page.evaluate((p) => window.__engine.strokeSync(p), pts);

  const before = await page.evaluate(() => window.__engine.inkBounds());
  if (!before) throw new Error('nothing drawn');
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const after = await page.evaluate(() => window.__engine.inkBounds());
  if (!after) throw new Error('rebuild produced an empty canvas');

  // The corner (top of the hook) keeps its reach — a rounded corner would pull
  // the top edge down by tens of px.
  expect(after.minY).toBeLessThanOrEqual(before.minY + 4);
  expect(after.maxX).toBeGreaterThanOrEqual(before.maxX - 4);
});

test('a multi-touch gesture undoes as a single unit', async ({ page }) => {
  // Two fingers drawing together form one stroke group → one command, so a
  // single undo must remove both strokes (not just the last finger's).
  await page.evaluate(() => {
    window.__engine.multiStrokeSync([
      {
        pointerId: 1,
        points: [
          { x: 40, y: 60 },
          { x: 240, y: 60 },
        ],
      },
      {
        pointerId: 2,
        points: [
          { x: 40, y: 200 },
          { x: 240, y: 200 },
        ],
      },
    ]);
  });
  expect(await count(page)).toBeGreaterThan(0);
  expect((await state(page)).canUndo).toBe(true);

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false); // the whole group was one undo step
});

test('undo still works after a canvas resize (restore onto the grown paper)', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));
  expect(await count(page)).toBeGreaterThan(0); // survived the resize

  await page.evaluate(() => window.__engine.undo());

  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('the drawing survives a canvas resize (virtual-canvas preservation)', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 30, y: 30 },
    { x: 120, y: 30 },
  ]);
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // Pixels near the origin (where the stroke is) must persist after the resize.
  expect(await count(page)).toBeGreaterThan(0);
  const alpha = await page.evaluate(() => window.__engine.pixelAt(70, 30)[3]);
  expect(alpha).toBeGreaterThan(0);
});

// ── device rotation / the paper view (ADR-0050) ─────────────────────────────
// A resize with a changed Screen Orientation angle is a rotation. With ink on
// the canvas the engine locks the paper (the space ops live in) and presents it
// UPRIGHT, contain-fit and centered — scaled down when it must — instead of
// letting content rotate off-screen or swapping a colored page's art. The
// harness pins the angle via setScreenAngleOverride, so these run without a
// device. Geometry used below: paper 300×300 adopted at angle 0; rotating to
// angle 90 into a 400×300 viewport fits at scale 1 with letterbox margins
// x∈[0,50] and x∈[350,400], so a paper point (x, y) lands at screen
// (x + 50, y); into a 200×300 viewport it fits at scale 2/3 centered
// vertically, landing at (2x/3, 2y/3 + 50).

async function rotateTo(page: Page, angle: number, w: number, h: number) {
  await page.evaluate(
    async ({ angle, w, h }) => {
      window.__engine.setScreenAngleOverride(angle);
      await window.__engine.resizeTo(w, h);
    },
    { angle, w, h }
  );
}

test('rotating with ink locks the paper and keeps the whole drawing visible upright', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  // Horizontal stroke across the paper.
  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await rotateTo(page, 90, 400, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0); // upright — the picture rotates with the device
  expect(view.scale).toBe(1);
  expect(view.tx).toBe(50); // centered: (400 − 300) / 2

  // The stroke is still on screen and still HORIZONTAL, shifted into the
  // centered paper (the smoothed path spans paper x ∈ [40, 120] → screen
  // x ∈ [90, 170]): paper (90, 60) → screen (140, 60).
  expect(await count(page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(140, 60)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 60)[3])).toBeGreaterThan(0);
  // Below the stroke line stays blank — it did not rotate to vertical.
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 150)[3])).toBe(0);

  // Every ink pixel sits inside the paper's mapped box — nothing off-screen.
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.minX).toBeGreaterThanOrEqual(50);
  expect(bounds.maxX).toBeLessThanOrEqual(350);
});

test('a rotation the paper does not fit scales it down uniformly, fully visible', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);

  // 300×300 paper into a 200×300 viewport → contain-fit at 2/3, centered
  // vertically (ty = 50).
  await rotateTo(page, 90, 200, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0);
  expect(view.scale).toBeCloseTo(2 / 3, 5);

  // Paper (120, 60) → screen (80, 90); the whole stroke fits on screen.
  expect(await page.evaluate(() => window.__engine.pixelAt(80, 90)[3])).toBeGreaterThan(0);
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.maxX).toBeLessThanOrEqual(200);
  expect(bounds.minY).toBeGreaterThanOrEqual(50);
  expect(bounds.maxY).toBeLessThanOrEqual(250);
});

test('rotating back restores the exact original layout', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  const before = await count(page);

  await rotateTo(page, 90, 400, 300);
  await rotateTo(page, 0, 300, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(await page.evaluate(() => window.__engine.pixelAt(120, 60)[3])).toBeGreaterThan(0);
  expect(await count(page)).toBe(before);
});

test('strokes drawn while rotated land on the paper and survive rotating back', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);

  // Draw through the rotated view: screen (200, 150) → (300, 150) maps to the
  // paper segment (150, 150) → (250, 150) (the centered paper starts at x = 50).
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 200, y: 150 },
        { x: 300, y: 150 },
      ],
      'touch'
    );
  });
  await rotateTo(page, 0, 300, 300);

  expect(await page.evaluate(() => window.__engine.pixelAt(200, 150)[3])).toBeGreaterThan(0);
});

test('the margins around the rotated paper are drawable, and crop on rotating back', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);
  const before = await count(page);

  // A stroke entirely inside the left margin (x < 50 maps left of the paper,
  // negative paper coordinates) still paints — no dead zones mid-scribble.
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 20, y: 150 },
        { x: 40, y: 150 },
      ],
      'mouse'
    );
  });
  expect(await count(page)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__engine.pixelAt(25, 150)[3])).toBeGreaterThan(0);

  // Rotating back crops the margin ink (the paper never contained it): the
  // original stroke is restored and nothing renders left of it.
  await rotateTo(page, 0, 300, 300);
  expect(await page.evaluate(() => window.__engine.pixelAt(120, 60)[3])).toBeGreaterThan(0);
  const bounds = await page.evaluate(() => window.__engine.inkBounds());
  if (!bounds) throw new Error('rotation lost the drawing');
  expect(bounds.minX).toBeGreaterThanOrEqual(30);

  // The crop is permanent: the commit fold clipped the margin ink at the paper
  // square's bounds, so rotating forward again does not resurrect it (the
  // accepted ADR-0050 margin corner — replay-era op retention brought it back,
  // snapshot folding does not).
  await rotateTo(page, 90, 400, 300);
  expect(await page.evaluate(() => window.__engine.pixelAt(25, 150)[3])).toBe(0);
});

test('clearing while rotated wipes margin ink too', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await rotateTo(page, 90, 400, 300);
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 20, y: 150 },
        { x: 40, y: 150 },
      ],
      'mouse'
    );
  });
  expect(await count(page)).toBeGreaterThan(0);

  // Clear must cover the margins (negative paper coordinates) as well as the
  // paper — and the blank canvas re-adopts the viewport, dropping the view.
  await page.evaluate(() => window.__engine.clearCanvas());
  expect(await count(page)).toBe(0);
  expect((await page.evaluate(() => window.__engine.getViewState())).active).toBe(false);
});

test('undo still works while rotated, and emptying the canvas re-adopts the viewport', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  await drawStroke(page, box, [
    { x: 40, y: 180 },
    { x: 200, y: 180 },
  ]);
  await rotateTo(page, 90, 400, 300);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBeGreaterThan(0); // first stroke, still presented

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);

  // Blank canvas → the paper is free again: full-size, no letterbox.
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
});

test('rotating an empty canvas adopts the new viewport (no lock, no letterbox)', async ({
  page,
}) => {
  await rotateTo(page, 90, 400, 300);

  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
  expect(view.paperOrientation).toBe('landscape');

  // The full new viewport is drawable — including space beyond the old paper.
  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 320, y: 150 },
        { x: 380, y: 150 },
      ],
      'touch'
    );
  });
  expect(await page.evaluate(() => window.__engine.pixelAt(350, 150)[3])).toBeGreaterThan(0);
});

// ── re-entry re-sync (rotation while backgrounded) ───────────────────────────
// A hidden document fires no resize/orientationchange, so a rotation while the
// app is backgrounded reaches the engine only via the visibilitychange on
// re-entry. The harness's resumeTo applies the new box silently (no resize
// event) and fires just that visibilitychange.

async function hiddenRotateTo(page: Page, angle: number, w: number, h: number) {
  await page.evaluate(
    ({ angle, w, h }) => {
      window.__engine.setScreenAngleOverride(angle);
      window.__engine.resumeTo(w, h);
    },
    { angle, w, h }
  );
}

test('a rotation while backgrounded re-syncs the empty canvas on re-entry', async ({ page }) => {
  await hiddenRotateTo(page, 90, 400, 300);

  // The blank canvas adopts the new viewport immediately — no letterbox, and
  // the space beyond the old paper is drawable.
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(false);
  expect(view.paperCssWidth).toBe(400);
  expect(view.paperOrientation).toBe('landscape');

  await page.evaluate(() => {
    window.__engine.strokeSync(
      [
        { x: 320, y: 150 },
        { x: 380, y: 150 },
      ],
      'touch'
    );
  });
  expect(await page.evaluate(() => window.__engine.pixelAt(350, 150)[3])).toBeGreaterThan(0);
});

test('a rotation while backgrounded with ink locks the paper on re-entry (ADR-0050)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await hiddenRotateTo(page, 90, 400, 300);

  // Same lock + upright contain-fit the live rotation path produces: the
  // stroke stays horizontal, shifted into the centered paper (tx = 50).
  const view = await page.evaluate(() => window.__engine.getViewState());
  expect(view.active).toBe(true);
  expect(view.rotate).toBe(0);
  expect(view.scale).toBe(1);
  expect(view.tx).toBe(50);
  expect(await page.evaluate(() => window.__engine.pixelAt(140, 60)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(170, 150)[3])).toBe(0);
});

test('a visibility flip with unchanged geometry leaves the drawing untouched', async ({ page }) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 40, y: 60 },
    { x: 200, y: 60 },
  ]);
  const before = await count(page);

  // Same box, same angle — the plain tab-switch return path.
  await page.evaluate(() => window.__engine.resumeTo(300, 300));

  expect(await count(page)).toBe(before);
  expect((await page.evaluate(() => window.__engine.getViewState())).active).toBe(false);
});

// ── teardown / re-init lifecycle (ADR-0004) ──────────────────────────────────
// Client-side navigation (`/` → `/privacy` → `/`) tears the engine down and
// re-inits it on a fresh canvas. Drawing state (paper raster, snapshot stack)
// persists across the cycle by design — a parent checking another page must not
// wipe the child's drawing — while pointer-input state must be reset by
// teardown().

test('the drawing persists across teardown + re-init (client-side navigation)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 120 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.remount());

  // Rebuilt by blitting the retained paper raster onto the fresh init.
  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  // The persisted snapshot stack is still live: undo reverts the pre-remount
  // stroke.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a pointer held through teardown cannot keep painting after remount', async ({ page }) => {
  // Navigating away mid-stroke tears the engine down with a finger still on the
  // glass. teardown() must commit the in-flight stroke and forget the pointer:
  // a stale activePointers entry (isDrawing true) would otherwise let hover
  // moves paint when the browser reuses the same pointerId after remount.
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('#engineCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, x: number, y: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: 'mouse',
          buttons,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    // Mid-stroke when the teardown/re-init cycle lands…
    fire('pointerdown', 40, 40, 1);
    fire('pointermove', 100, 40, 1);
    window.__engine.remount();
    const afterRemount = window.__engine.nonTransparentCount();
    // …then the same pointerId comes back as plain hover moves (buttons 0).
    fire('pointermove', 100, 200, 0);
    fire('pointermove', 220, 200, 0);
    return {
      afterRemount,
      final: window.__engine.nonTransparentCount(),
      hoverPathAlpha: window.__engine.pixelAt(100, 120)[3],
    };
  });

  // The in-flight stroke was committed into the log, not lost.
  expect(result.afterRemount).toBeGreaterThan(0);
  // The reused pointer id painted nothing without a fresh pointerdown.
  expect(result.hoverPathAlpha).toBe(0);
  expect(result.final).toBe(result.afterRemount);
});

test('a stroke in progress survives a mid-stroke resize and undoes as one unit', async ({
  page,
}) => {
  // The rebuild blits the committed paper, but a stroke still being drawn has
  // an uncommitted activeCommand (recorded, not yet folded). The resize must
  // repaint it too, so the in-flight stroke isn't dropped — and the whole
  // stroke remains a single undo unit afterwards.
  const box = await page.locator('#engineCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100);

  // Resize while the finger is still down (the stroke is mid-flight).
  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The portion drawn before the resize is still on the canvas.
  expect(await page.evaluate(() => window.__engine.pixelAt(40, 40)[3])).toBeGreaterThan(0);

  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.up();

  expect(await count(page)).toBeGreaterThan(0);

  // One stroke → one command: a single undo clears it back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

// --- Crayon brush (ADR-0065) ------------------------------------------------

// The crayon lays colour down as textured wax: an opaque body punched by fine
// paper-tooth pits, with each stroke's tooth phase-shifted by a stored seed. The
// buildup + determinism contract lives here, at the engine layer, because it is a
// property of rendering the stored ops — not of the pure phase math (unit-tested
// in crayonBrush.test.ts).

// Draw a horizontal crayon line and read back per-region opaque coverage + mean
// opaque colour, all in one page context so the canvas pixels never leave the browser.
async function crayonScene(page: Page) {
  return page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const line = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
      return p;
    };
    const region = (x0: number, x1: number) => {
      const d = g.getImageData(Math.round(x0), ymid - 15, Math.round(x1 - x0), 30).data;
      let opq = 0,
        tot = 0,
        r = 0,
        gg = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) {
        tot++;
        if (d[i + 3] > 128) {
          opq++;
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
        }
      }
      return {
        cov: opq / tot,
        rgb: opq ? [Math.round(r / opq), Math.round(gg / opq), Math.round(b / opq)] : null,
      };
    };
    const W = cv.width;
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36');
    E.setStrokeWidth(30);
    E.strokeSync(line(W * 0.2, W * 0.8), 'pen'); // one full-width pass
    const leftA = region(W * 0.25, W * 0.45);
    const rightA = region(W * 0.55, W * 0.75);
    E.strokeSync(line(W * 0.2, W * 0.5), 'pen'); // a second same-colour pass, LEFT half only
    const leftB = region(W * 0.25, W * 0.45);
    const rightB = region(W * 0.55, W * 0.75);
    return { leftA, rightA, leftB, rightB };
  });
}

test('a crayon stroke reads as tooth, not a solid fill', async ({ page }) => {
  const r = await crayonScene(page);
  // A single pass leaves paper tooth showing — neither a flat fill nor a few
  // specks. The floor sits below the deliberately light first-pass defaults
  // (they leave buildup headroom); the ceiling catches a solid fill.
  expect(r.leftA.cov).toBeGreaterThan(0.3);
  expect(r.leftA.cov).toBeLessThan(0.85);
});

test('a second same-colour crayon pass builds up where it is drawn, at a constant hue', async ({
  page,
}) => {
  const r = await crayonScene(page);
  // Buildup: the redrawn (left) band gets denser — fills in tooth.
  expect(r.leftB.cov).toBeGreaterThan(r.leftA.cov + 0.03);
  // Live/gradual, not a global snap: the untouched (right) band is unchanged.
  expect(Math.abs(r.rightB.cov - r.rightA.cov)).toBeLessThan(0.02);
  // No darken/muddy: same-colour overdraw cannot shift the colour — the
  // darken mix is EXACT on its own colour (min(c,c)=c), so the only mean
  // drift left is the shade wobble's slow term (its per-texel min against the
  // previous pass's shade is bounded by the shade amplitude) plus band
  // composition. A multiply-style regression darkens every pass by tens of
  // levels, far past this bound.
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((r.leftB.rgb as number[])[i] - (r.leftA.rgb as number[])[i])).toBeLessThan(10);
  }
});

test('the crayon wax body carries a subtle shade variation, not one flat colour', async ({
  page,
}) => {
  // The fill's rgb wobbles a few percent around the exact crayon colour
  // (shadeShift) — enough that the body reads as mottled wax, never enough to
  // read as a different colour. A pass over blank paper stamps fully opaque
  // and glaze-free (the multiply glaze only engages over existing ink), so
  // fully covered body texels are exact; the ≥200 alpha filter keeps the
  // stroke's anti-aliased silhouette from faking variation.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y: ymid });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36'); // r=226 g=59 b=54
    E.setStrokeWidth(30);
    E.strokeSync(p, 'pen');
    const d = g.getImageData(20, ymid - 12, cv.width - 40, 24).data;
    const exact = [226, 59, 54];
    let opq = 0;
    let varied = 0;
    let maxDev = 0;
    const mean = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      opq++;
      let dev = 0;
      for (let c = 0; c < 3; c++) {
        dev = Math.max(dev, Math.abs(d[i + c] - exact[c]));
        mean[c] += d[i + c];
      }
      if (dev > 2) varied++;
      if (dev > maxDev) maxDev = dev;
    }
    return {
      opq,
      variedFrac: opq ? varied / opq : 0,
      maxDev,
      meanDev: opq ? Math.max(...mean.map((m, c) => Math.abs(m / opq - exact[c]))) : 0,
    };
  });
  expect(r.opq).toBeGreaterThan(500);
  // A real spread across the body — a flat fill scores ~0 here.
  expect(r.variedFrac).toBeGreaterThan(0.15);
  // …but a SUBTLE one: no texel strays far, and the mean stays on the colour.
  expect(r.maxDev).toBeLessThanOrEqual(40);
  expect(r.meanDev).toBeLessThanOrEqual(12);
});

test('crossing crayon colours mix subtractively — blue over yellow goes green', async ({
  page,
}) => {
  // Each pass stamps a darken mix: out = (1-m)·S + m·min(S,D). Subtractive is
  // the point — an rgb lerp of blue over yellow goes GREY, while min keeps the
  // blue wax's full green channel and drops only its blue channel toward the
  // yellow's, so the crossing crosses into GREEN-dominance (g > b) at the
  // shipped strength while blue over bare paper stays pure.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const cx = Math.round(cv.width / 2);
    const cy = Math.round(cv.height / 2);
    const seg = (x0: number, y0: number, x1: number, y1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++)
        p.push({ x: x0 + ((x1 - x0) * i) / 40, y: y0 + ((y1 - y0) * i) / 40 });
      return p;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setStrokeWidth(36);
    E.setColor('#f7d64b'); // yellow underlay (247, 214, 75)
    E.strokeSync(seg(cx - 150, cy, cx + 150, cy), 'pen');
    E.setColor('#62A2E9'); // blue over it (98, 162, 233)
    E.strokeSync(seg(cx, cy - 120, cx, cy + 120), 'pen');
    // Sample the crossing square. Blue wax mixed by the yellow beneath lands
    // at ≈ (98, 162, 0.45·233 + 0.55·75 ≈ 146) — green channel above blue,
    // i.e. actually green — vs (98, 162, 233) pure over blank.
    const d = g.getImageData(cx - 12, cy - 12, 24, 24).data;
    let wax = 0;
    let mixed = 0;
    let greenLean = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]];
      if (rr >= 150) continue; // exclude the yellow showing through pits
      wax++;
      if (bb >= 128 && bb <= 168) mixed++;
      if (gg > bb) greenLean++;
    }
    return { wax, mixed, greenLean };
  });
  expect(r.wax).toBeGreaterThan(100);
  // The yellow beneath genuinely mixes into the blue wax — a zero-mix
  // regression leaves every blue texel at b ≈ 233, far above the window…
  expect(r.mixed).toBeGreaterThan(r.wax * 0.3);
  // …and the crossing is not just teal: a solid share of the mixed wax is
  // green-DOMINANT, which is what the eye finally reads as green.
  expect(r.greenLean).toBeGreaterThan(r.wax * 0.25);
});

test('colorMix 0 restores the direct opaque pipeline (the A/B escape hatch)', async ({ page }) => {
  // With the mix disabled the crayon paints the canvas directly — fully opaque
  // wax, no pass buffer, no stamp — byte-for-byte the pre-mixing pipeline.
  const opaque = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y: ymid });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setCrayonParams({ colorMix: 0 });
    E.setColor('#e23b36');
    E.setStrokeWidth(24);
    E.strokeSync(p, 'pen');
    const d = g.getImageData(20, ymid - 10, cv.width - 40, 20).data;
    let full = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 255) full++;
    return full;
  });
  expect(opaque).toBeGreaterThan(500);
});

test('scribbling back and forth in ONE gesture builds up like separate strokes', async ({
  page,
}) => {
  // Real wax doesn't care whether the crayon lifted before re-covering a spot:
  // a continuous out-back-out scribble must densify mid-stroke (the pass
  // tracker bumps the seed phase at each reversal), landing in the same
  // coverage territory as three separate strokes over the same line.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const W = cv.width;
    const pts = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
      return p;
    };
    const coverage = () => {
      const d = g.getImageData(Math.round(W * 0.2), ymid - 12, Math.round(W * 0.6), 24).data;
      let opq = 0;
      let tot = 0;
      for (let i = 3; i < d.length; i += 4) {
        tot++;
        if (d[i] > 128) opq++;
      }
      return opq / tot;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(30);
    E.strokeSync(pts(W * 0.1, W * 0.9), 'pen'); // one single-direction pass
    const single = coverage();
    E.clearCanvas();
    const fwd = pts(W * 0.1, W * 0.9);
    const back = pts(W * 0.9, W * 0.1);
    // One continuous gesture: out, back, out — a single pointerdown/up.
    E.strokeSync([...fwd, ...back.slice(1), ...fwd.slice(1)], 'pen');
    const scribble = coverage();
    return { single, scribble };
  });
  // Mid-stroke overdraw fills real extra tooth (three phases vs one)…
  expect(r.scribble).toBeGreaterThan(r.single + 0.08);
  // …while staying wax, not a solid bar.
  expect(r.scribble).toBeLessThan(0.995);
});

test('mid-stroke pass splits survive a remount byte-identically and undo cleanly', async ({
  page,
}) => {
  // The split gesture folds several seeds' worth of ops into the paper at
  // commit; a remount blits that paper back, and the blit must reproduce EVERY
  // byte of what the child saw live — live-render and fold share renderOp, so
  // any drift here means the fold diverged from the live pixels.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const y = Math.round(cv.height / 2);
    const pts = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y });
      return p;
    };
    const fwd = pts(20, cv.width - 20);
    const back = pts(cv.width - 20, 20);
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36');
    E.setStrokeWidth(24);
    E.strokeSync([...fwd, ...back.slice(1), ...fwd.slice(1)], 'pen');
    const before = g.getImageData(0, 0, cv.width, cv.height).data;
    E.remount();
    const after = g.getImageData(0, 0, cv.width, cv.height).data;
    let inked = 0;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i + 3] > 0) inked++;
      for (let c = 0; c < 4; c++) {
        if (before[i + c] !== after[i + c]) {
          changed++;
          break;
        }
      }
    }
    return { inked, changed };
  });
  expect(r.inked).toBeGreaterThan(0);
  expect(r.changed).toBe(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('a crayon remount reproduces the exact pixel count', async ({ page }) => {
  await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const y = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync(p, 'pen');
  });
  const c0 = await count(page);
  expect(c0).toBeGreaterThan(0);

  // Teardown + re-init repaints from the committed paper raster (one blit), so
  // the rebuild is pixel-for-pixel identical.
  await page.evaluate(() => window.__engine.remount());
  expect(await count(page)).toBe(c0);

  // And it undoes cleanly back to a blank canvas.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('the dab deposit commits, remounts byte-identically, and undoes to blank', async ({
  page,
}) => {
  // The dab-stamp deposit (setCrayonParams({ dabs })) is nondeterministic by
  // design — Math.random jitter, soft fractional alpha. Byte-exact rebuilds
  // therefore cannot come from re-rendering: the closed pass travels as its
  // live-captured raster and commit reconciles the screen from the paper.
  // A remount (one paper blit) must still reproduce EVERY byte, including
  // across a mid-stroke pass split.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const y = Math.round(cv.height / 2);
    const pts = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y });
      return p;
    };
    const fwd = pts(20, cv.width - 20);
    const back = pts(cv.width - 20, 20);
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setCrayonParams({ dabs: E.CRAYON_DAB_DEFAULTS });
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync([...fwd, ...back.slice(1)], 'pen');
    const before = g.getImageData(0, 0, cv.width, cv.height).data;
    E.remount();
    const after = g.getImageData(0, 0, cv.width, cv.height).data;
    let inked = 0;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i + 3] > 0) inked++;
      for (let c = 0; c < 4; c++) {
        if (before[i + c] !== after[i + c]) {
          changed++;
          break;
        }
      }
    }
    E.setCrayonParams({ dabs: null });
    return { inked, changed };
  });
  expect(r.inked).toBeGreaterThan(0);
  expect(r.changed).toBe(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('dab overdraw deepens convergently toward the darkened dab colour, never mud', async ({
  page,
}) => {
  // The dab deposit's deepening is an accumulation ramp: within a pass dabs
  // converge to the sprite colour (source-over fixed point), and across
  // passes the darken-min stamp's fixed point is that same colour — so
  // repeated same-colour overdraw must (a) get darker at first, (b) settle
  // instead of compounding, (c) never rotate the hue. This is the dab path's
  // analogue of the pattern path's constant-hue guard, with the bound moved
  // from "exact colour" to "bounded convergent deepening".
  const samples = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const y = Math.round(cv.height / 2);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) pts.push({ x: 40 + ((cv.width - 80) * i) / 40, y });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setCrayonParams({ dabs: E.CRAYON_DAB_DEFAULTS });
    E.setColor('#1f75fe');
    E.setStrokeWidth(24);
    // Mean stroke colour composited over the light paper, over a fixed band —
    // tooth pits and partial alpha count as lightness, exactly as the eye
    // reads them.
    const bandMean = () => {
      const band = g.getImageData(60, y - 8, cv.width - 120, 16).data;
      let r = 0;
      let gg = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        const a = band[i + 3] / 255;
        r += band[i] * a + 255 * (1 - a);
        gg += band[i + 1] * a + 255 * (1 - a);
        b += band[i + 2] * a + 255 * (1 - a);
        n++;
      }
      return [r / n, gg / n, b / n];
    };
    const out: number[][] = [];
    for (let i = 0; i < 12; i++) {
      E.strokeSync(pts, 'pen');
      out.push(bandMean());
    }
    E.setCrayonParams({ dabs: null });
    return out;
  });

  const value = (s: number[]) => (s[0] + s[1] + s[2]) / 3;
  // (a) The first few passes deepen visibly.
  expect(value(samples[2])).toBeLessThan(value(samples[0]) - 4);
  // (b) The ramp converges: the late-pass step is a fraction of the early one.
  const earlyStep = value(samples[0]) - value(samples[2]);
  const lateStep = Math.abs(value(samples[9]) - value(samples[11]));
  expect(lateStep).toBeLessThan(Math.max(1.5, earlyStep * 0.25));
  // (c) Bounded floor: never below the darkened dab colour (#1f75fe − 10 %,
  // ≈ (28,105,229)) by more than sampling noise — mud/black is a failure.
  const last = samples[11];
  expect(last[0]).toBeGreaterThan(28 - 15);
  expect(last[1]).toBeGreaterThan(105 - 15);
  expect(last[2]).toBeGreaterThan(229 - 15);
  // (d) Hue holds: the palette blue keeps its b > g > r ordering throughout.
  for (const s of samples) {
    expect(s[2]).toBeGreaterThan(s[1]);
    expect(s[1]).toBeGreaterThan(s[0]);
  }
});

// --- The snapshot memory tier (ADR-0066) --------------------------------------
//
// Undo restores pre-stroke canvas snapshots (see undoHistory.ts). A restore can
// be asynchronous — deep entries decode from an encoded blob — so undo() returns
// its queue promise (page.evaluate awaits it) and assertions that race the
// encode tier poll for the settled state.

test('depth caps at 20 and deep entries restore from encoded blobs', async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 22; i++) {
      const y = 14 + i * 12;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
        ],
        'pen'
      );
    }
  });

  // The cold tier encodes off the commit path — wait for it to settle: only
  // K_LIVE (2) recent snapshots stay live rasters, the rest demote to blobs.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(20);
    expect(d.liveRasters).toBeLessThanOrEqual(2);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__engine.undo());
  }
  expect((await state(page)).canUndo).toBe(false);

  // The two oldest snapshots were shifted past the cap, so the deepest restore
  // still shows strokes 1–2 — the undo wall.
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 14)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 26)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 38)[3])).toBe(0);
});

test('undoing a later crayon stroke restores the earlier texture byte-exactly', async ({
  page,
}) => {
  // A restore is a raster blit of the pre-stroke paper, so an earlier stroke's
  // wax texture must come through with ZERO changed bytes — not merely within
  // an AA tolerance band.
  const debug = await page.evaluate(async () => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const line = (y: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
      return p;
    };
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync(line(75), 'pen'); // stroke A, top band
    (window as unknown as { __bandBefore: number[] }).__bandBefore = Array.from(
      g.getImageData(20, 60, cv.width - 40, 30).data
    );
    E.strokeSync(line(cv.height - 60), 'pen'); // stroke B, far bottom band
    const d = E.getUndoDebug();
    await E.undo();
    return d;
  });
  expect(debug.snapshots).toBe(2);

  const gone = await page.evaluate(() => {
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    return window.__engine.pixelAt(Math.round(cv.width / 2), cv.height - 60)[3];
  });
  expect(gone).toBe(0);

  const mismatched = await page.evaluate(() => {
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const before = (window as unknown as { __bandBefore: number[] }).__bandBefore;
    const after = g.getImageData(20, 60, cv.width - 40, 30).data;
    let n = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
    return n;
  });
  expect(mismatched).toBe(0);
});

test('a stroke committed during a deep-undo blob decode survives the restore and undoes next', async ({
  page,
}) => {
  // The deep-undo step pops its snapshot, then awaits createImageBitmap(blob)
  // — a real task-level window. A commit landing inside it must defer its
  // copy+fold behind the pending restore (paper chain): the committed ink
  // survives the restore's blit, and the next undo undoes IT, instead of
  // restoring a pre-undo snapshot (undo acting as redo).
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
        ],
        'pen'
      );
    }
  });

  // Wait for the cold tier to settle so the third undo is a blob decode.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.liveRasters).toBeLessThanOrEqual(2);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async () => {
    const E = window.__engine;
    await E.undo(); // stroke 4 — live raster
    await E.undo(); // stroke 3 — live raster
    const deepUndo = E.undo(); // stroke 2 — demoted, decodes from its blob
    await Promise.resolve(); // the step has popped its snapshot and is awaiting the decode
    E.strokeSync([{ x: 150, y: 200 }], 'pen'); // dot commits mid-decode
    await deepUndo;
  });

  // The restore landed BENEATH the dot: stroke 2 gone, stroke 1 kept, dot kept.
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBeGreaterThan(0);

  // The next undo undoes the dot — not a redo of the strokes the child undid.
  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);

  // And one more reaches blank with the stack cleanly exhausted.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('drawing immediately after rapid undos folds onto the restored paper (undo → draw → undo)', async ({
  page,
}) => {
  // Toddler flow: mash undo three times (the last restore decodes a blob),
  // then dot the canvas before the restores land. The stroke's commit queues
  // behind all three restores, its baseline rebases to the restored blank
  // paper, and the next undo removes just that stroke back to blank.
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
        ],
        'pen'
      );
    }
  });
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async () => {
    const E = window.__engine;
    E.undo();
    E.undo();
    const chain = E.undo(); // three rapid taps back to blank
    E.strokeSync(
      [
        { x: 150, y: 200 },
        { x: 200, y: 250 },
      ],
      'pen'
    ); // draws before any restore lands
    await chain;
  });

  // Only the new stroke survives the queued restores.
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 60)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBeGreaterThan(0);
  let s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  // Undoing the new stroke lands on the blank paper the undos restored — the
  // deferred commit's snapshot copied the post-restore state, not a stale one.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('encoded snapshots rising into the K_LIVE window re-inflate to live rasters', async ({
  page,
}) => {
  // The K_LIVE invariant must survive undo-then-draw, not just monotonic
  // growth: after deep undos the entries that rise into the top-2 window
  // decode back to live rasters off the hot path, so the *second* undo tap
  // after a new stroke is a live blit, not a blob decode.
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
        ],
        'pen'
      );
    }
  });

  // Let the cold tier settle: strokes 1–3 demote to blobs, 4–5 stay live.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(5);
    expect(d.liveRasters).toBe(2);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async () => {
    await window.__engine.undo();
    await window.__engine.undo();
    await window.__engine.undo();
  });

  // Both survivors were blobs; rising into the window re-inflates them.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(2);
    expect(d.liveRasters).toBe(2);
    expect(d.blobBytes).toBe(0);
  }).toPass();

  await page.evaluate(() => window.__engine.strokeSync([{ x: 150, y: 200 }], 'pen'));

  // The new commit re-tiers: top-2 live (stroke 2's snapshot + the dot's),
  // the entry pushed below the window demotes back to a blob.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(3);
    expect(d.liveRasters).toBe(2);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  // First undo drops the dot; the second — the tap that used to pay a blob
  // decode — restores stroke 1 from its re-inflated raster.
  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);
  expect((await state(page)).canUndo).toBe(true);
});
