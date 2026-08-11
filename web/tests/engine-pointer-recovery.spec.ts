import {
  EDGE_SWIPE_BAND_PX,
  EDGE_SWIPE_DECISION_PX,
  GESTURE_INSET_MIN_PX,
  POINTER_RESUME_GAP_MS,
  POINTER_RESUME_JUMP_RATIO,
} from '$lib/drawing/strokeMath';
import { expect, state, test } from './engine-harness';
import { COLOR_CHANGE_DEBOUNCE_SETTLE_MS, touchEventPrevented } from './helpers';

// The harness canvas is 300×300 at the viewport origin (renderScale 1).
const CANVAS_PX = 300;
// Mid-band start on the guarded edge, and travel comfortably past the
// swipe-direction decision distance.
const BAND_START_PX = CANVAS_PX - EDGE_SWIPE_BAND_PX / 2;
const SWIPE_TRAVEL_PX = 5 * EDGE_SWIPE_DECISION_PX;

test('a pointer resumed far away after an idle gap does not draw a connecting line', async ({
  page,
}) => {
  // iOS/WebKit can merge a fast tap-then-drag into one pointer stream, dropping
  // the pointerup + pointerdown and resuming the SAME pointer at a new spot.
  // Reproduce it directly: press, idle past the resume gap, then move far away
  // WITHOUT lifting — the engine must restart the stroke instead of bridging
  // the two spots with a stray line.
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // The premise: the diagonal jump is far past the resume threshold.
  expect(Math.hypot(220, 220)).toBeGreaterThan(POINTER_RESUME_JUMP_RATIO * CANVAS_PX);

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(2 * POINTER_RESUME_GAP_MS);
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
  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS);
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
    const canvas = document.querySelector('#drawingCanvas') as HTMLCanvasElement;
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
    const canvas = document.querySelector('#drawingCanvas') as HTMLCanvasElement;
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
    const canvas = document.querySelector('#drawingCanvas') as HTMLCanvasElement;
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

test('a pen edge return resumes fresh geometry inside one undo group', async ({ page }) => {
  const s = await page.evaluate(() => {
    window.__engine.pointerEventsSync(
      [
        { type: 'pointerdown', pointerId: 1, x: 40, y: 150, buttons: 1 },
        { type: 'pointermove', pointerId: 1, x: 120, y: 150, buttons: 1 },
        { type: 'pointerout', pointerId: 1, x: 299, y: 150, buttons: 1 },
        // Returns still down — no pointerdown.
        { type: 'pointermove', pointerId: 1, x: 200, y: 150, buttons: 1 },
        { type: 'pointermove', pointerId: 1, x: 260, y: 150, buttons: 1 },
        { type: 'pointerup', pointerId: 1, x: 260, y: 150, buttons: 0 },
      ],
      'pen'
    );
    return {
      ...window.__engineState,
      painted: window.__engine.nonTransparentCount(),
      gapAlpha: window.__engine.pixelAt(140, 150)[3],
      snapshots: window.__engine.getUndoDebug().snapshots,
    };
  });
  expect(s.strokeEnds).toBe(1);
  expect(s.drawStops).toBe(2);
  expect(s.snapshots).toBe(1);
  expect(s.gapAlpha).toBe(0);
  expect(s.painted).toBeGreaterThan(500);

  await page.evaluate(() => window.__engine.undo());
  await expect.poll(() => page.evaluate(() => window.__engine.nonTransparentCount())).toBe(0);
  expect((await state(page)).canUndo).toBe(false);
});

for (const liftType of ['pointerup', 'pointercancel'] as const) {
  test(`a pen that never returns closes its undo group on window ${liftType}`, async ({ page }) => {
    const atExit = await page.evaluate(() => {
      window.__engine.pointerEventsSync(
        [
          { type: 'pointerdown', pointerId: 1, x: 40, y: 80, buttons: 1 },
          { type: 'pointermove', pointerId: 1, x: 120, y: 80, buttons: 1 },
          { type: 'pointerout', pointerId: 1, x: 299, y: 80, buttons: 1 },
        ],
        'pen'
      );
      return { ...window.__engineState };
    });
    expect(atExit.strokeEnds).toBe(0);
    expect(atExit.drawStops).toBe(1);
    expect(atExit.canUndo).toBe(false);

    const afterLift = await page.evaluate((eventType) => {
      document.body.dispatchEvent(
        new PointerEvent(eventType, {
          pointerId: 1,
          pointerType: 'pen',
          buttons: 0,
          clientX: 320,
          clientY: 80,
          bubbles: true,
          cancelable: true,
        })
      );
      return {
        ...window.__engineState,
        snapshots: window.__engine.getUndoDebug().snapshots,
      };
    }, liftType);
    expect(afterLift.strokeEnds).toBe(1);
    expect(afterLift.drawStops).toBe(1);
    expect(afterLift.canUndo).toBe(true);
    expect(afterLift.snapshots).toBe(1);

    const afterNextStroke = await page.evaluate(() => {
      window.__engine.strokeSync(
        [
          { x: 40, y: 220 },
          { x: 120, y: 220 },
        ],
        'pen'
      );
      return {
        ...window.__engineState,
        snapshots: window.__engine.getUndoDebug().snapshots,
      };
    });
    expect(afterNextStroke.strokeEnds).toBe(2);
    expect(afterNextStroke.snapshots).toBe(2);

    await page.evaluate(() => window.__engine.undo());
    expect(await page.evaluate(() => window.__engine.pixelAt(60, 80)[3])).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__engine.pixelAt(60, 220)[3])).toBe(0);
    await page.evaluate(() => window.__engine.undo());
    await expect.poll(() => page.evaluate(() => window.__engine.nonTransparentCount())).toBe(0);
  });
}

// Adoption must only fire for streams whose pointerdown was genuinely dropped.
// A pen gesture that BEGAN on a UI control with a delivered pointerdown
// (drag-to-clear, a picker drag, a slide off a swatch) crossing the canvas
// looks identical move-by-move — the live down is the discriminator.
test('a pen drag that started with a delivered pointerdown on UI never paints', async ({
  page,
}) => {
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#drawingCanvas') as HTMLCanvasElement;
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
  const prevented = await Promise.all([
    touchEventPrevented(page, '#drawingCanvas', 'touchstart'),
    touchEventPrevented(page, '#drawingCanvas', 'touchmove'),
  ]);
  expect(prevented).toEqual([true, true]);
});

// A square canvas is treated as portrait (width ≤ height), so the bottom
// EDGE_SWIPE_BAND_PX band is guarded. Portrait guards the bottom from
// orientation alone, needing no injected insets; landscape tests resize the
// canvas wider than tall.
test('in portrait a touch swiping up from the bottom edge is discarded as the OS gesture', async ({
  page,
}) => {
  const dropped = await page.evaluate(
    ([startY, travel]) => {
      window.__engine.strokeSync(
        [
          { x: 60, y: startY },
          { x: 60, y: startY - travel },
        ],
        'touch'
      );
      return window.__engine.nonTransparentCount();
    },
    [BAND_START_PX, SWIPE_TRAVEL_PX]
  );
  expect(dropped).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  // A discarded swipe never snapshots, so the undo button stays disabled.
  expect(s.canUndo).toBe(false);
});

test('a touch starting at the bottom edge but moving sideways still draws', async ({ page }) => {
  const painted = await page.evaluate(
    ([startY]) => {
      window.__engine.strokeSync(
        [
          { x: 60, y: startY },
          { x: 220, y: startY },
        ],
        'touch'
      );
      return window.__engine.nonTransparentCount();
    },
    [BAND_START_PX]
  );
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
  const painted = await page.evaluate(
    ([startY]) => {
      window.__engine.strokeSync([{ x: 60, y: startY }], 'touch');
      return window.__engine.nonTransparentCount();
    },
    [BAND_START_PX]
  );
  expect(painted).toBeGreaterThan(0);
});

// A discarded edge swipe can be the LAST live pointer of a multi-touch group:
// a finger painting normally lifts while an edge-band candidate is still
// undecided, then that candidate flicks inward and is dropped. The discard is
// what empties the pointer map, so the discard has to complete the group —
// otherwise the painted stroke sits uncommitted until some unrelated later
// pointer event happens to close it.
test('a stroke commits when a discarded edge swipe is what ends the group', async ({ page }) => {
  const painted = await page.evaluate(
    ([startY, travel]) => {
      window.__engine.pointerEventsSync([
        { type: 'pointerdown', pointerId: 1, x: 60, y: 60 },
        { type: 'pointermove', pointerId: 1, x: 220, y: 60 },
        { type: 'pointerdown', pointerId: 2, x: 150, y: startY },
        // The painting finger lifts first — the group is not over, pointer 2 is
        // still live and still undecided.
        { type: 'pointerup', pointerId: 1, x: 220, y: 60 },
        // The candidate flicks inward: an OS edge swipe, discarded.
        { type: 'pointermove', pointerId: 2, x: 150, y: startY - travel },
      ]);
      return window.__engine.nonTransparentCount();
    },
    [BAND_START_PX, SWIPE_TRAVEL_PX]
  );
  expect(painted).toBeGreaterThan(0);

  const s = await state(page);
  expect(s.canUndo).toBe(true);
  expect(s.strokeEnds).toBe(1);
  expect(s.drawStops).toBe(1);

  // One group, so a single undo clears the canvas.
  await page.evaluate(() => window.__engine.undo());
  await expect.poll(() => page.evaluate(() => window.__engine.nonTransparentCount())).toBe(0);
});

test('a trailing pointercancel for an already-discarded pointer completes nothing', async ({
  page,
}) => {
  // The OS takes the gesture over and cancels the pointer the engine already
  // dropped at the discard. That cancel is for an id the engine no longer
  // tracks: it must not run the group-completion tail a second time.
  const afterDiscard = await page.evaluate(
    ([startY, travel]) => {
      window.__engine.pointerEventsSync([
        { type: 'pointerdown', pointerId: 1, x: 150, y: startY },
        { type: 'pointermove', pointerId: 1, x: 150, y: startY - travel },
      ]);
      return { ...window.__engineState };
    },
    [BAND_START_PX, SWIPE_TRAVEL_PX]
  );
  // Nothing was painted, so the discard's completion committed no group.
  expect(afterDiscard.strokeEnds).toBe(0);

  const afterCancel = await page.evaluate(
    ([startY]) => {
      window.__engine.pointerEventsSync([
        { type: 'pointercancel', pointerId: 1, x: 150, y: startY },
      ]);
      return { ...window.__engineState };
    },
    [BAND_START_PX]
  );
  expect(afterCancel).toEqual(afterDiscard);
  expect(afterCancel.canUndo).toBe(false);
});

test('a hovering mouse leaving an idle canvas completes nothing', async ({ page }) => {
  // The canvas listens to pointerout with the same handler as pointerup, so a
  // plain hover-out arrives for a pointer that never drew. It must not commit
  // or fire the drawing-stop callback.
  const s = await page.evaluate(() => {
    window.__engine.pointerEventsSync(
      [{ type: 'pointerout', pointerId: 1, x: 150, y: 150 }],
      'mouse'
    );
    return { ...window.__engineState };
  });
  expect(s.drawStops).toBe(0);
  expect(s.strokeEnds).toBe(0);
  expect(s.canUndo).toBe(false);
  expect(s.canvasEmpty).toBe(true);
});

test('in phone landscape the guard moves to the short side edges, not the long bottom', async ({
  page,
}) => {
  // A phone's physical-bottom navbar rotates to a short side edge in landscape.
  // No insets are injected — orientation alone guards both short edges, so this
  // works even where the OS exposes no safe-area insets.
  await page.evaluate(() => window.__engine.resizeTo(400, 300));

  // A swipe inward from the short left edge is the OS gesture → discarded.
  const fromSide = await page.evaluate(
    ([bandMid, travel]) => {
      window.__engine.strokeSync(
        [
          { x: bandMid, y: 150 },
          { x: bandMid + travel, y: 150 },
        ],
        'touch'
      );
      return window.__engine.nonTransparentCount();
    },
    [EDGE_SWIPE_BAND_PX / 2, SWIPE_TRAVEL_PX]
  );
  expect(fromSide).toBe(0);

  // A stroke swiping up from the long bottom edge is NOT the navbar gesture on a
  // phone in landscape, so it must still draw.
  const fromBottom = await page.evaluate(
    ([startY, travel]) => {
      window.__engine.strokeSync(
        [
          { x: 200, y: startY },
          { x: 200, y: startY - travel },
        ],
        'touch'
      );
      return window.__engine.nonTransparentCount();
    },
    [BAND_START_PX, SWIPE_TRAVEL_PX]
  );
  expect(fromBottom).toBeGreaterThan(0);
});

test('in tablet landscape a reported bottom inset additionally guards the long bottom', async ({
  page,
}) => {
  // A tablet keeps its home indicator on the long bottom in landscape; the OS
  // reports an inset there, so an upward swipe from that edge is discarded.
  const dropped = await page.evaluate(
    async ([inset, startY, travel]) => {
      await window.__engine.resizeTo(400, 300);
      window.__engine.setSafeAreaInsets({ top: 0, right: 0, bottom: inset, left: 0 });
      window.__engine.strokeSync(
        [
          { x: 200, y: startY },
          { x: 200, y: startY - travel },
        ],
        'touch'
      );
      return window.__engine.nonTransparentCount();
    },
    [2 * GESTURE_INSET_MIN_PX, BAND_START_PX, SWIPE_TRAVEL_PX]
  );
  expect(dropped).toBe(0);
});
