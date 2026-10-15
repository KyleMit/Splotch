import { ACCEPT_RADIUS_FACTOR } from '../../../../web/src/lib/actions/dragToClearGeometry';

// The shipping gesture's tuning, projected across the candidate boundary because its owner
// (web/src/lib/actions/dragToClear.ts) imports the web engine. native-clear-projection.test.mjs
// reads each shipping literal back and fails on divergence.
export const HOLD_DURATION_MS = 500;
export const MOVEMENT_THRESHOLD_PX = 50;
export const MULTI_CLICK_WINDOW_MS = 1000;
export const MULTI_CLICK_THRESHOLD = 3;
export const ACCEPT_ZONE_HIDE_DELAY_MS = 250;
// How far the wash's fade-out edge reaches at full progress, as a fraction of the area diagonal.
export const WASH_REACH_DIAGONAL_FRACTION = 1.3;
// ClearButton.svelte's release: the button sails home on --ease-pop over this long, and a
// committed flood lets go over its own fade.
export const RETURN_HOME_MS = 480;
export const FLOOD_RELEASE_MS = 280;
export const FLOOD_COMMITTED_OPACITY = 0.92;
// The departing page's flight, from web/src/lib/drawing/inkMotion.ts and app.css's clear-sheet.
export const CLEAR_SHEET_DURATION_MS = 560;
export const CLEAR_SHEET_CORNER_PULL = 0.34;
export const CLEAR_SHEET_END_SCALE = 0.02;
export const CLEAR_SHEET_END_TURN_DEG = 14;
export const CLEAR_SHEET_CURVE = [0.32, 0.02, 0.42, 1] as const;
// The coachmark's mime, from web/src/lib/components/ClearCoachmark.svelte.
export const COACHMARK_AUTO_DISMISS_MS = 6000;
export const GHOST_TRAVEL_OVERSHOOT = 1.18;
export const COACHMARK_LOOP_MS = 2800;

export type Point = Readonly<{ x: number; y: number }>;

export function acceptRadius(width: number, height: number) {
  return Math.min(width, height) * ACCEPT_RADIUS_FACTOR;
}

// The departing page scales about a point pulled past the button's centre toward the corner it
// docks in, so it travels a straight line into the button and slides under it.
export function clearSheetOrigin(bin: Point, area: Readonly<{ width: number }>): Point {
  return {
    x: bin.x + (area.width - bin.x) * CLEAR_SHEET_CORNER_PULL,
    y: bin.y - bin.y * CLEAR_SHEET_CORNER_PULL,
  };
}

// register() is true when the tap completes a multi-tap run, in which case the run restarts
// without the completing tap opening a new window.
function createTapRun() {
  let count = 0;
  let lastTapTime = 0;
  return {
    register(now: number): boolean {
      if (now - lastTapTime < MULTI_CLICK_WINDOW_MS) {
        count++;
        if (count >= MULTI_CLICK_THRESHOLD) {
          count = 0;
          return true;
        }
      } else {
        count = 1;
      }
      lastTapTime = now;
      return false;
    },
  };
}

export type ClearGestureEffects = {
  showTutorial(): void;
  dismissTutorial(): void;
  begin(): void;
  follow(offset: Point, progress: number, reached: boolean): void;
  threshold(): void;
  commit(): void;
  cancel(): void;
  // The departing page has gone; the button takes presses again.
  settled(): void;
};

type ActiveDrag = { start: Point; radius: number; reached: boolean };

// The shipping drag-to-clear state machine without the DOM: a press arms the accept ring and a
// hold timer that shows the coachmark; moving past MOVEMENT_THRESHOLD_PX dismisses it; releasing
// at least one accept radius from the press commits, anything shorter cancels. A run of taps shows
// the coachmark instead of starting a drag, and only an activation (keyboard or assistive
// technology) clears without a drag.
export function createClearGesture(
  effects: ClearGestureEffects,
  radius: () => number,
  now: () => number = Date.now
) {
  const taps = createTapRun();
  let active: ActiveDrag | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let clearingTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelHold() {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function commit() {
    effects.dismissTutorial();
    effects.commit();
    if (clearingTimer !== null) clearTimeout(clearingTimer);
    clearingTimer = setTimeout(() => {
      clearingTimer = null;
      effects.settled();
    }, CLEAR_SHEET_DURATION_MS);
  }

  function finish(point: Point | null) {
    const drag = active;
    if (!drag) return;
    active = null;
    cancelHold();
    const committed =
      point !== null && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) >= drag.radius;
    if (committed) commit();
    else effects.cancel();
  }

  return {
    // While the departing page is in flight a landing tap belongs to the paper, not the button.
    accepts: () => clearingTimer === null,
    down(point: Point) {
      if (active !== null || clearingTimer !== null) return;
      if (taps.register(now())) {
        effects.showTutorial();
        return;
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        effects.showTutorial();
      }, HOLD_DURATION_MS);
      active = { start: point, radius: radius(), reached: false };
      effects.begin();
    },
    move(point: Point) {
      const drag = active;
      if (!drag) return;
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (Math.abs(dx) > MOVEMENT_THRESHOLD_PX || Math.abs(dy) > MOVEMENT_THRESHOLD_PX) {
        cancelHold();
        effects.dismissTutorial();
      }
      const distance = Math.hypot(dx, dy);
      const reached = distance >= drag.radius;
      effects.follow({ x: dx, y: dy }, distance / drag.radius, reached);
      if (reached && !drag.reached) effects.threshold();
      drag.reached = reached;
    },
    up(point: Point) {
      finish(point);
    },
    terminate() {
      finish(null);
    },
    activate() {
      if (active !== null || clearingTimer !== null) return;
      commit();
    },
    dispose() {
      active = null;
      cancelHold();
      if (clearingTimer !== null) clearTimeout(clearingTimer);
      clearingTimer = null;
    },
  };
}
