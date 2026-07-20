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
  // The only command was undone back to the empty baseline — nothing left to undo.
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

  // 22 distinct strokes → 22 commands, but only the last 20 are retained
  // (MAX_UNDO_STACK_SIZE); the older two fold into the baseline.
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
  // Two strokes folded into the baseline, so the canvas can't reach blank.
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
  // that commits after the clear, or every rebuild (undo/resize/export) would
  // replay clear-then-stroke and repaint ink the user saw erased.
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

  // Undoing a later stroke replays clear + the straddling stroke from the log.
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
  // The command-replay undo (ADR-0033) must reproduce destination-out ops in
  // order: undoing the erase rebuilds from the baseline and replays only the
  // pen stroke, so the erased pixels return and the canvas is non-empty again.
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

test('a moderate stroke stays replayable ops (no keyframe) and undoes cleanly', async ({
  page,
}) => {
  // Below the keyframe budget a command keeps replayable ops (simplified at
  // commit in the live curve family, see ADR-0036), so a rebuild re-strokes
  // them. It must not keyframe and must undo as one unit. strokeSync gives a
  // deterministic one-seg-per-move op stream.
  const points = Array.from({ length: 120 }, (_, i) => ({
    x: 20 + i * 2,
    y: 150 + Math.round(60 * Math.sin(i / 40)),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.commands).toBe(1);
  expect(debug.keyframes).toBe(0);

  // Still one undo unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a pathological all-corners gesture keyframes as a safety net (ADR-0035/0036)', async ({
  page,
}) => {
  // Simplification can't thin a gesture that is genuinely all direction changes.
  // Once a command's *simplified* segment total passes KEYFRAME_SEGMENT_THRESHOLD
  // it collapses to a cumulative raster keyframe (ops dropped) so undo/resize stay
  // one drawImage blit instead of re-stroking hundreds of segments on a 4×-DPR
  // backing store. A tight zigzag keeps every point through RDP.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);

  expect(await count(page)).toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  // One undo unit, collapsed to a keyframe with its ops dropped.
  expect(debug.commands).toBe(1);
  expect(debug.keyframes).toBe(1);
  expect(debug.maxSegments).toBe(0);

  // Undo still reverts the whole gesture in one step, back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('a keyframed gesture survives a resize, rebuilt from the keyframe (ADR-0035)', async ({
  page,
}) => {
  // The keyframe is a cumulative square raster, so a resize rebuilds from it
  // (drawImage) rather than re-stroking the dropped ops — the drawing must still
  // be there afterward.
  const points = Array.from({ length: 460 }, (_, i) => ({
    x: i % 2 === 0 ? 30 : 230,
    y: 20 + Math.floor(i * 0.5),
  }));
  await page.evaluate((pts) => window.__engine.strokeSync(pts), points);
  expect((await page.evaluate(() => window.__engine.getUndoDebug())).keyframes).toBe(1);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.resizeTo(500, 400));

  // The drawing persists after the resize, rebuilt from the keyframe.
  expect(await count(page)).toBeGreaterThan(0);

  // And it still undoes as a single unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a back-and-forth scribble keeps its full extent after a rebuild (ADR-0036 tip fidelity)', async ({
  page,
}) => {
  // Simplification drops the dense samples around each turning point, so the
  // curve through the survivors must pass *through* the tips. The midpoint
  // smoothing it replaced used those tips only as control points and bulged ~25%
  // short of them, so a scribble visibly shrank on undo/resize. Draw a horizontal
  // zigzag, then force a rebuild-from-stored-ops via resize and check the extent.
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

  // Force the stored (simplified) ops to repaint the visible canvas.
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const after = await page.evaluate(() => window.__engine.inkBounds());
  if (!after) throw new Error('rebuild produced an empty canvas');

  // The horizontal span survives — the tips still reach (the old undershoot
  // shrank this by tens of px; allow only a few px of antialiasing slack).
  expect(after.maxX).toBeGreaterThanOrEqual(before.maxX - 4);
  expect(after.minX).toBeLessThanOrEqual(before.minX + 4);
});

test('a sharp corner stays sharp and in place after a rebuild (ADR-0036 corner fidelity)', async ({
  page,
}) => {
  // A smooth interpolating spline rounds a sharp turn into a displaced bend, so a
  // hook drawn as a long arm + a sharp reversal would lose its corner on rebuild
  // (the corner pulls inward, shrinking the extent by tens of px). Corner-aware
  // splining keeps the turn crisp and located. Draw the hook, rebuild, and check
  // the corner's reach is preserved.
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

test('undo still works after a canvas resize (replay onto the grown baseline)', async ({
  page,
}) => {
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

  // The margin ops are retained, so rotating forward again brings the ink back.
  await rotateTo(page, 90, 400, 300);
  expect(await page.evaluate(() => window.__engine.pixelAt(25, 150)[3])).toBeGreaterThan(0);
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
// re-inits it on a fresh canvas. Drawing state (command log, baseline) persists
// across the cycle by design — a parent checking another page must not wipe the
// child's drawing — while pointer-input state must be reset by teardown().

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

  // Rebuilt from the retained baseline + command log onto the fresh init.
  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  // The persisted log is still live: undo reverts the pre-remount stroke.
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
  // The rebuild replays from the baseline + command log, but a stroke still being
  // drawn has an uncommitted activeCommand (recorded, not yet in the log). The
  // resize must replay it too, so the in-flight stroke isn't dropped — and the
  // whole stroke remains a single undo unit afterwards.
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

// A dense horizontal crayon stroke at canvas-y `y`, from x0 to x1.
function crayonBar(y: number, x0: number, x1: number) {
  const pts = [];
  for (let x = x0; x <= x1; x += 10) pts.push({ x, y });
  return pts;
}

test('a crayon stroke reads as textured wax, not a flat fill (ADR-0065)', async ({ page }) => {
  // Free-draw is the crayon by default. A single pass must be visibly broken by
  // the paper tooth — its mean alpha well under a solid fill — while the flat
  // A/B variant lays down (near-)solid colour. The engine renders both through
  // the same op path; only the tooth pattern differs.
  const box = await page.locator('#engineCanvas').boundingBox();
  await page.evaluate(() => {
    window.__engine.setColor('#62a2e9');
    window.__engine.setStrokeWidth(20);
    window.__engine.setCrayonVariant('wax');
  });
  await page.waitForTimeout(160); // ride out the colour-change debounce
  await drawStroke(page, box, crayonBar(90, 60, 300));
  const crayon = await page.evaluate(() => window.__engine.inkStats(60, 82, 240, 16));

  await page.evaluate(() => {
    window.__engine.clearCanvas();
    window.__engine.setCrayonVariant('flat');
  });
  await drawStroke(page, box, crayonBar(90, 60, 300));
  const flat = await page.evaluate(() => window.__engine.inkStats(60, 82, 240, 16));

  // The crayon leaves paper showing through the tooth, so it's meaningfully less
  // opaque than the flat marker over the same shape.
  expect(crayon.alpha).toBeLessThan(flat.alpha - 0.15);
  expect(flat.alpha).toBeGreaterThan(0.8);
  // …but it's still a dense body of colour, not a faint wash.
  expect(crayon.alpha).toBeGreaterThan(0.3);
});

test('a crayon stroke rebuilds identically — no texture shift on undo/resize (ADR-0065)', async ({
  page,
}) => {
  // The regression this fixes: on the first undo/resize the textured wax path
  // shifted (commit-time simplification dropped the `brush` flag → flat marker,
  // and re-chunking the per-frame ops changed the source-over buildup density).
  // Crayon now keeps its raw ops, so live drawing and every replay run the
  // identical op stream and the rebuilt grain matches the live render.
  const box = await page.locator('#engineCanvas').boundingBox();
  await page.evaluate(() => {
    window.__engine.setColor('#62a2e9');
    window.__engine.setStrokeWidth(20);
    window.__engine.setCrayonVariant('wax');
  });
  await page.waitForTimeout(160);
  await drawStroke(page, box, crayonBar(90, 60, 300));
  const live = await page.evaluate(() => window.__engine.inkStats(60, 82, 240, 16));

  // Force the stored ops to repaint the canvas — the path undo/resize/export share.
  await page.evaluate(() => window.__engine.resizeTo(300, 300));
  const rebuilt = await page.evaluate(() => window.__engine.inkStats(60, 82, 240, 16));

  // Still broken wax grain (not a flat solid line)…
  expect(rebuilt.alpha).toBeLessThan(0.8);
  // …and the density did not shift from the live render (raw ops → identical).
  expect(Math.abs(rebuilt.alpha - live.alpha)).toBeLessThan(0.02);
  // The command kept its raw ops (crayon skips simplification) — not keyframed.
  const debug = await page.evaluate(() => window.__engine.getUndoDebug());
  expect(debug.keyframes).toBe(0);
});

test('same-colour crayon builds up: denser, hue held, live along the second stroke (ADR-0065)', async ({
  page,
}) => {
  const box = await page.locator('#engineCanvas').boundingBox();
  await page.evaluate(() => {
    window.__engine.setColor('#62a2e9');
    window.__engine.setStrokeWidth(20);
    window.__engine.setCrayonVariant('wax');
  });
  await page.waitForTimeout(160);

  // First pass across the whole bar.
  await drawStroke(page, box, crayonBar(90, 60, 320));
  const pass1 = await page.evaluate(() => window.__engine.inkStats(70, 82, 240, 16));

  // A SECOND same-colour pass over only the LEFT half. Because each per-frame op
  // composites source-over as the finger moves, the left half must build up
  // where the second stroke actually travelled, while the untouched right half
  // stays at pass one — buildup is live and positional, never a post-stroke snap.
  await drawStroke(page, box, crayonBar(90, 60, 190));
  const leftAfter = await page.evaluate(() => window.__engine.inkStats(70, 82, 110, 16));
  const rightAfter = await page.evaluate(() => window.__engine.inkStats(210, 82, 110, 16));

  // The twice-drawn left is denser than the once-drawn right (grain filling in).
  expect(leftAfter.alpha).toBeGreaterThan(rightAfter.alpha + 0.05);
  // And denser than the same region was after pass one.
  expect(leftAfter.alpha).toBeGreaterThan(pass1.alpha + 0.05);

  // Hue is invariant: the mean colour of the inked pixels barely moves between
  // one and two passes — buildup fills the tooth toward the SAME crayon colour,
  // it does not darken/muddy it (the opposite of a multiply blend).
  expect(Math.abs(leftAfter.r - pass1.r)).toBeLessThan(8);
  expect(Math.abs(leftAfter.g - pass1.g)).toBeLessThan(8);
  expect(Math.abs(leftAfter.b - pass1.b)).toBeLessThan(8);
});

test('crayon stroke weight is independent of drag speed (ADR-0065)', async ({ page }) => {
  // The regression this guards: crayon ops used to stroke with round caps, so a
  // full line-width disc re-composited at every per-frame op joint — a slow
  // steady drag (joints every px or two) compounded toward solid while a long
  // quick drag stayed light. Ops now tile butt-to-butt in ≥min-advance chunks,
  // so a single pass deposits once whatever the pointer speed. Drawn over the
  // SAME canvas region (cleared between) so both passes sample identical tooth.
  const box = await page.locator('#engineCanvas').boundingBox();
  await page.evaluate(() => {
    window.__engine.setColor('#62a2e9');
    window.__engine.setStrokeWidth(20);
    window.__engine.setCrayonVariant('wax');
  });
  await page.waitForTimeout(160);

  // Slow steady drag: 2px per pointermove.
  const slowPts = [];
  for (let x = 60; x <= 300; x += 2) slowPts.push({ x, y: 90 });
  await drawStroke(page, box, slowPts);
  const slow = await page.evaluate(() => window.__engine.inkStats(70, 82, 220, 16));

  await page.evaluate(() => window.__engine.clearCanvas());

  // Long quick drag: 40px per pointermove over the same span.
  const fastPts = [];
  for (let x = 60; x <= 300; x += 40) fastPts.push({ x, y: 90 });
  await drawStroke(page, box, fastPts);
  const fast = await page.evaluate(() => window.__engine.inkStats(70, 82, 220, 16));

  // Both are the textured single-pass deposit — neither a solid fill nor a
  // faint wash — and their densities land close together. (Before the fix the
  // slow pass compounded to ~2× the fast pass's alpha.)
  expect(slow.alpha).toBeGreaterThan(0.25);
  expect(slow.alpha).toBeLessThan(0.8);
  expect(Math.abs(slow.alpha - fast.alpha)).toBeLessThan(0.06);
});
