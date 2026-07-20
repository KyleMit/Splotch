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
  // No darken/muddy: the mean opaque hue barely moves (every channel within a few levels).
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((r.leftB.rgb as number[])[i] - (r.leftA.rgb as number[])[i])).toBeLessThan(6);
  }
});

test('the crayon body carries subtle tone variation, not one flat RGB', async ({ page }) => {
  // The opaque wax is shaded per-texel by the tone field (thick wax darker,
  // thin wax lighter). Fully opaque interior texels must show a spread of
  // colours around the base — a flat fill has none — while staying subtle: the
  // splat pattern already provides the coarse variation, so the tone is a
  // whisper, bounded well inside the toneVariation amplitude.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y: ymid });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36');
    E.setStrokeWidth(30);
    E.strokeSync(p, 'pen');
    const d = g.getImageData(20, ymid - 10, cv.width - 40, 20).data;
    let n = 0,
      sum = 0,
      sumSq = 0,
      min = 255,
      max = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 255) continue; // interior wax only — skip pits + silhouette AA
      const red = d[i];
      n++;
      sum += red;
      sumSq += red * red;
      if (red < min) min = red;
      if (red > max) max = red;
    }
    const mean = sum / n;
    return { n, mean, std: Math.sqrt(sumSq / n - mean * mean), min, max };
  });
  expect(r.n).toBeGreaterThan(500);
  // Variation exists: a flat fill has std 0 and a single value.
  expect(r.std).toBeGreaterThan(2);
  expect(r.max - r.min).toBeGreaterThan(10);
  // ...and stays subtle: mean hugs the base red (226) and no texel strays past
  // the toneVariation amplitude (±~12% of the channel's headroom).
  expect(Math.abs(r.mean - 226)).toBeLessThan(10);
  expect(r.min).toBeGreaterThan(226 - 45);
  expect(r.max).toBeLessThan(226 + 45);
});

test('scribbling back over the same spot within ONE continuous stroke builds up like fresh strokes', async ({
  page,
}) => {
  // A real crayon doesn't care whether the pen lifted before re-covering: the
  // pass tracker advances the seed mid-gesture at each reversal, so a single
  // out-and-back-and-out scribble must deepen the band like three separate
  // strokes do — not idempotently re-deposit one phase.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const W = cv.width;
    const leg = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
      return p;
    };
    const cov = () => {
      const d = g.getImageData(Math.round(W * 0.3), ymid - 10, Math.round(W * 0.4), 20).data;
      let opq = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) opq++;
      return opq / (d.length / 4);
    };
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(30);

    E.clearCanvas();
    E.strokeSync(leg(W * 0.2, W * 0.8), 'pen'); // one single pass
    const single = cov();

    E.clearCanvas();
    const scribble = [
      ...leg(W * 0.2, W * 0.8),
      ...leg(W * 0.8, W * 0.2).slice(1),
      ...leg(W * 0.2, W * 0.8).slice(1),
    ];
    E.strokeSync(scribble, 'pen'); // the same 3 sweeps, ONE continuous gesture
    const oneGesture = cov();

    E.clearCanvas();
    E.strokeSync(leg(W * 0.2, W * 0.8), 'pen'); // the same 3 sweeps, lifting
    E.strokeSync(leg(W * 0.8, W * 0.2), 'pen'); // between each
    E.strokeSync(leg(W * 0.2, W * 0.8), 'pen');
    const threeStrokes = cov();

    return { single, oneGesture, threeStrokes };
  });
  // The continuous scribble genuinely deepens over a single pass…
  expect(r.oneGesture).toBeGreaterThan(r.single + 0.08);
  // …and lands in the same ballpark as lifting the pen between sweeps.
  expect(Math.abs(r.oneGesture - r.threeStrokes)).toBeLessThan(0.1);
});

test('crayon deposits pick up a little of the ink underneath (yellow over blue leans green)', async ({
  page,
}) => {
  // colorMix lerps each deposited texel toward a once-per-stroke snapshot of
  // the under-ink. Compare the yellow deposits laid over a blue line against
  // the same stroke's deposits over bare paper: with the default mix they
  // shift toward blue (less red, more blue — reads greener); with colorMix 0
  // they are statistically identical. Classification by red channel keeps the
  // measurement blind to which pits expose blue underneath.
  const measure = (mix: number | null) =>
    page.evaluate((colorMix) => {
      const E = window.__engine;
      const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
      const g = cv.getContext('2d')!;
      if (colorMix !== null) E.setCrayonParams({ colorMix });
      E.clearCanvas();
      E.setCrayonMode(true);
      E.setStrokeWidth(30);
      const ymid = Math.round(cv.height / 2);
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        const p: { x: number; y: number }[] = [];
        for (let i = 0; i <= 40; i++)
          p.push({ x: x0 + ((x1 - x0) * i) / 40, y: y0 + ((y1 - y0) * i) / 40 });
        return p;
      };
      // A blue patch on the LEFT half only, then a yellow line across the full
      // width: its left half deposits over blue, its right half over paper.
      E.setColor('#2c5faa');
      const W = cv.width;
      for (let dy = -12; dy <= 12; dy += 8) {
        E.strokeSync(line(20, ymid + dy, W * 0.45, ymid + dy), 'pen');
      }
      E.setColor('#f2c14e');
      E.strokeSync(line(20, ymid, W - 20, ymid), 'pen');
      const yellowStats = (x0: number, x1: number) => {
        const d = g.getImageData(Math.round(x0), ymid - 8, Math.round(x1 - x0), 16).data;
        let n = 0,
          r = 0,
          b = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 255 && d[i] > 150) {
            n++;
            r += d[i];
            b += d[i + 2];
          }
        }
        return { n, r: r / n, b: b / n };
      };
      return {
        over: yellowStats(W * 0.08, W * 0.42), // yellow deposits above the blue patch
        bare: yellowStats(W * 0.55, W * 0.92), // same stroke over bare paper
      };
    }, mix);

  const mixed = await measure(null); // tuned default
  expect(mixed.over.n).toBeGreaterThan(300);
  expect(mixed.bare.n).toBeGreaterThan(300);
  // Deposits over blue lean toward it: less red, more blue — but subtly.
  expect(mixed.bare.r - mixed.over.r).toBeGreaterThan(8);
  expect(mixed.over.b - mixed.bare.b).toBeGreaterThan(5);
  expect(mixed.bare.r - mixed.over.r).toBeLessThan(60);

  const flat = await measure(0);
  expect(Math.abs(flat.over.r - flat.bare.r)).toBeLessThan(3);
  expect(Math.abs(flat.over.b - flat.bare.b)).toBeLessThan(3);
  await page.evaluate(() => window.__engine.setCrayonParams({ colorMix: 0.15 }));
});

test('a colour-mixed crayon scene replays and undoes exactly', async ({ page }) => {
  // The mix source is a per-stroke snapshot that every rebuild re-derives from
  // replay order, so a mixed scene must survive a remount at the exact pixel
  // count and keep earlier mixed ink byte-stable when a later stroke is undone.
  await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const line = (y: number, x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y });
      return p;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setStrokeWidth(24);
    E.setColor('#2c5faa');
    E.strokeSync(line(75, 20, cv.width - 20), 'pen');
    E.setColor('#f2c14e');
    // Crosses the blue line's band and includes a mid-gesture reversal, so the
    // scene exercises mixing and mid-stroke seed splits together.
    E.strokeSync([...line(80, 20, cv.width - 20), ...line(80, cv.width - 20, 20).slice(1)], 'pen');
  });
  const c0 = await count(page);
  expect(c0).toBeGreaterThan(0);
  await page.evaluate(() => window.__engine.remount());
  // Two OVERLAPPING strokes carry the ADR-0065 silhouette residual: the
  // simplified replay's stroke edge anti-aliases a hair differently from the
  // live per-frame edge where it crosses the other stroke, so the rebuild can
  // differ by a few sub-pixel fringe pixels (measured ±1 of ~7000; identical
  // with colorMix 0 — it is not the mixing). Interior ink is exact, pinned by
  // the byte-stability half below.
  expect(Math.abs((await count(page)) - c0)).toBeLessThanOrEqual(8);

  const changedFrac = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const band = () => Array.from(g.getImageData(20, 60, cv.width - 40, 35).data);
    const before = band();
    const y = cv.height - 60;
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
    E.strokeSync(p, 'pen'); // non-overlapping stroke, then undo it
    E.undo();
    const after = band();
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      let d = 0;
      for (let c = 0; c < 4; c++) d += Math.abs(before[i + c] - after[i + c]);
      if (d > 8) changed++;
    }
    return changed / (before.length / 4);
  });
  expect(changedFrac).toBeLessThan(0.05);
});

test('a mid-gesture-split crayon stroke replays and undoes exactly', async ({ page }) => {
  // The seed now advances WITHIN a stroke at each reversal; every op still
  // stores its own seed, so a rebuild must reproduce the split stroke
  // pixel-for-pixel and undo must leave earlier ink byte-stable.
  await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const leg = (y: number, x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y });
      return p;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync([...leg(75, 20, cv.width - 20), ...leg(75, cv.width - 20, 20).slice(1)], 'pen');
  });
  const c0 = await count(page);
  expect(c0).toBeGreaterThan(0);
  await page.evaluate(() => window.__engine.remount());
  expect(await count(page)).toBe(c0);

  const changedFrac = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const band = () => Array.from(g.getImageData(20, 60, cv.width - 40, 30).data);
    const before = band();
    const y = cv.height - 60;
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
    E.strokeSync(p, 'pen'); // non-overlapping stroke B
    E.undo();
    const after = band();
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      let d = 0;
      for (let c = 0; c < 4; c++) d += Math.abs(before[i + c] - after[i + c]);
      if (d > 8) changed++;
    }
    return changed / (before.length / 4);
  });
  expect(changedFrac).toBeLessThan(0.05);
});

test('crayon replay is deterministic — a rebuild reproduces the exact pixel count', async ({
  page,
}) => {
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

  // Teardown + re-init replays every stored op from the command log; the crayon
  // tooth is deterministic (fixed field + stored seed), so the rebuild is
  // pixel-for-pixel identical.
  await page.evaluate(() => window.__engine.remount());
  expect(await count(page)).toBe(c0);

  // And it undoes cleanly back to a blank canvas.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('undoing a later crayon stroke leaves an earlier stroke texture spatially unchanged', async ({
  page,
}) => {
  // The tooth must survive an undo *in place*, not just at the same pixel count.
  // A crayon op is stroked live as dozens of overlapping per-frame ops but
  // replayed (on undo) as a few simplified ones; unless the tooth is binary,
  // source-over accumulates the fractional overlap differently between the two
  // op counts and the whole texture visibly shifts when any later stroke is
  // undone. Draw stroke A, snapshot its band, draw a NON-overlapping stroke B,
  // undo B, and assert A's band is essentially byte-identical — a regression to
  // the fractional-alpha tooth changes the majority of A's pixels here.
  const changedFrac = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const band = () => Array.from(g.getImageData(20, 60, cv.width - 40, 30).data);
    const line = (y: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
      return p;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync(line(75), 'pen'); // stroke A, top band
    const before = band();
    E.strokeSync(line(cv.height - 60), 'pen'); // stroke B, far bottom band (no overlap)
    E.undo();
    const after = band();
    let changed = 0;
    const px = before.length / 4;
    for (let i = 0; i < before.length; i += 4) {
      let d = 0;
      for (let c = 0; c < 4; c++) d += Math.abs(before[i + c] - after[i + c]);
      if (d > 8) changed++;
    }
    return changed / px;
  });
  // Only the sub-pixel silhouette AA of A may differ (a thin ring); the interior
  // tooth is byte-stable. The pre-fix behaviour changed ~70% of the band.
  expect(changedFrac).toBeLessThan(0.05);
});
