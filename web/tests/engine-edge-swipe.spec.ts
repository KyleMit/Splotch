import {
  EDGE_SWIPE_BAND_PX,
  EDGE_SWIPE_DECISION_PX,
  GESTURE_INSET_MIN_PX,
} from '$lib/drawing/strokeMath';
import { expect, state, test } from './engine-harness';

// The harness canvas is 300×300 at the viewport origin (renderScale 1).
const CANVAS_PX = 300;
// Mid-band start on the guarded edge, and travel comfortably past the
// swipe-direction decision distance.
const BAND_START_PX = CANVAS_PX - EDGE_SWIPE_BAND_PX / 2;
const SWIPE_TRAVEL_PX = 5 * EDGE_SWIPE_DECISION_PX;

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
