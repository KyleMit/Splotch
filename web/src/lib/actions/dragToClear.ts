import { releaseAllPointers } from '$lib/drawing/engine';
import {
  cancelClearSound,
  commitClearSound,
  startClearSound,
  stopDrawSound,
  updateClearSound,
} from '$lib/audio/drawingSound';
import { CLEAR_SHEET_DURATION_MS, type ClientPoint } from '$lib/drawing/inkMotion';
import { impactThreshold } from '$lib/platform/haptics';
import { capturePointer, releasePointer } from './pointerCapture';
import { getAcceptRadius } from './dragToClearGeometry';

// Drag-to-clear gesture constants.
const HOLD_DURATION_MS = 500;
const MOVEMENT_THRESHOLD_PX = 50;
const MULTI_CLICK_WINDOW_MS = 1000;
const MULTI_CLICK_THRESHOLD = 3;
const ACCEPT_ZONE_HIDE_DELAY_MS = 250;
const DRAW_SOUND_STOP_DELAY_MS = 300;
// How far the wash's fade-out edge reaches at full progress, as a fraction of
// the viewport diagonal — past the far corner, so the flood of paper covers
// the whole page just as the threshold is crossed.
const WASH_REACH_DIAGONAL_FRACTION = 1.3;

function suppress(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

// Exported for dragToClear.test.ts; the action is its only production caller.
// register() is true when the tap completes a multi-tap run, in which case the
// run restarts without the completing tap opening a new window.
export function createTapRun() {
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

type TimerId = ReturnType<typeof setTimeout>;

function createTimerSet() {
  const pending = new Set<TimerId>();
  return {
    schedule(fn: () => void, delayMs: number): TimerId {
      const id = setTimeout(() => {
        pending.delete(id);
        fn();
      }, delayMs);
      pending.add(id);
      return id;
    },
    cancel(id: TimerId | null): void {
      if (id === null) return;
      pending.delete(id);
      clearTimeout(id);
    },
    cancelAll(): void {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    },
  };
}

// The wash is a fixed-size gradient scaled out from the dock corner, so the
// growing preview is a compositor transform rather than a full-viewport
// repaint on every pointermove. Progress lives on the wash alone: an
// inherited custom property on the document root restyles every element and
// re-rasters every paint layer per move, which the bare toolbar's glass
// multiplies.
function armWash(washEl: HTMLElement): void {
  const reachPx = Math.hypot(window.innerWidth, window.innerHeight) * WASH_REACH_DIAGONAL_FRACTION;
  washEl.style.setProperty('--clear-wash-scale', `${reachPx / washEl.offsetWidth}`);
  setWashProgress(washEl, 0);
}

function setWashProgress(washEl: HTMLElement, progress: number): void {
  washEl.style.setProperty('--clear-progress', `${progress}`);
}

export interface DragToClearOptions {
  containerEl: HTMLDivElement;
  acceptZoneEl: HTMLDivElement;
  clearPreviewEl: HTMLDivElement;
  clearWashEl: HTMLDivElement;
  // Called when the user drags past the threshold and releases — should clear canvas and save.
  // `home` is the button's docked centre at release, where the departing page is headed.
  onClear: (home: ClientPoint) => void;
  onTutorialShow: () => void;
  onTutorialDismiss: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// The three classes that together mark the drag as past the point of no return.
function setThresholdReached(node: HTMLElement, o: DragToClearOptions, reached: boolean): void {
  node.classList.toggle('delete-ready', reached);
  o.acceptZoneEl.classList.toggle('threshold-reached', reached);
  o.clearPreviewEl.classList.toggle('committed', reached);
}

interface ActiveDrag {
  pointerId: number;
  options: DragToClearOptions;
  acceptRadius: number;
  // The translation last applied to the container, so the docked centre can be
  // recovered from the dragged button's rect at release.
  offsetX: number;
  offsetY: number;
}

export function dragToClear(node: HTMLButtonElement, getOptions: () => DragToClearOptions) {
  let activeDrag: ActiveDrag | null = null;
  let startPointerX = 0;
  let startPointerY = 0;
  let clearReady = false;
  let holdTimer: TimerId | null = null;
  let acceptZoneFrame: number | null = null;
  const taps = createTapRun();
  const timers = createTimerSet();

  function buttonCenter(): ClientPoint {
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  function dockedCenter(drag: ActiveDrag): ClientPoint {
    const center = buttonCenter();
    return { x: center.x - drag.offsetX, y: center.y - drag.offsetY };
  }

  function dragDistance(clientX: number, clientY: number): number {
    return Math.hypot(clientX - startPointerX, clientY - startPointerY);
  }

  function armAcceptZone(
    o: DragToClearOptions,
    center: { x: number; y: number },
    radius: number
  ): void {
    o.acceptZoneEl.style.left = `${center.x - radius}px`;
    o.acceptZoneEl.style.top = `${center.y - radius}px`;
    o.acceptZoneEl.style.width = `${radius * 2}px`;
    o.acceptZoneEl.style.height = `${radius * 2}px`;
    o.acceptZoneEl.style.display = 'block';
    acceptZoneFrame = requestAnimationFrame(() => {
      acceptZoneFrame = null;
      o.acceptZoneEl.classList.add('visible');
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (activeDrag !== null) return;

    const o = getOptions();
    if (taps.register(Date.now())) {
      o.onTutorialShow();
      return;
    }

    const clientX = e.clientX;
    const clientY = e.clientY;
    holdTimer = timers.schedule(o.onTutorialShow, HOLD_DURATION_MS);

    const home = buttonCenter();
    const acceptRadius = getAcceptRadius();
    activeDrag = { pointerId: e.pointerId, options: o, acceptRadius, offsetX: 0, offsetY: 0 };
    capturePointer(node, e.pointerId);
    startPointerX = clientX;
    startPointerY = clientY;
    clearReady = false;
    armWash(o.clearWashEl);
    o.clearPreviewEl.classList.remove('releasing');

    releaseAllPointers();
    startClearSound();

    o.containerEl.classList.add('dragging-active');
    node.classList.add('dragging');

    armAcceptZone(o, home, acceptRadius);

    o.onDragStart?.();

    suppress(e);
  }

  function onPointerMove(e: PointerEvent) {
    if (activeDrag === null || e.pointerId !== activeDrag.pointerId) return;

    const { options: o, acceptRadius } = activeDrag;
    const clientX = e.clientX;
    const clientY = e.clientY;

    const deltaX = Math.abs(clientX - startPointerX);
    const deltaY = Math.abs(clientY - startPointerY);
    if (deltaX > MOVEMENT_THRESHOLD_PX || deltaY > MOVEMENT_THRESHOLD_PX) {
      timers.cancel(holdTimer);
      holdTimer = null;
      // Once the user is actually dragging, the demo has served its purpose.
      o.onTutorialDismiss();
    }

    const dx = clientX - startPointerX;
    const dy = clientY - startPointerY;
    o.containerEl.style.transform = `translate(${dx}px, ${dy}px)`;
    activeDrag.offsetX = dx;
    activeDrag.offsetY = dy;

    const distance = dragDistance(clientX, clientY);

    // Continuous 0→1 drag progress drives the radial paper wash that previews
    // the clear (see .clear-wash).
    const normalizedDistance = distance / acceptRadius;
    setWashProgress(o.clearWashEl, Math.min(normalizedDistance, 1));
    updateClearSound(normalizedDistance);

    const reached = distance >= acceptRadius;
    setThresholdReached(node, o, reached);
    // Fire a single tactile "click" the moment we cross the point of no return.
    if (reached && !clearReady) impactThreshold();
    clearReady = reached;

    suppress(e);
  }

  function finishDrag(drag: ActiveDrag, committed: boolean) {
    const { options: o, pointerId } = drag;
    timers.cancel(holdTimer);
    holdTimer = null;
    if (acceptZoneFrame !== null) {
      cancelAnimationFrame(acceptZoneFrame);
      acceptZoneFrame = null;
    }
    activeDrag = null;
    releasePointer(node, pointerId);

    o.acceptZoneEl.classList.remove('visible');
    timers.schedule(() => {
      if (activeDrag === null) o.acceptZoneEl.style.display = 'none';
    }, ACCEPT_ZONE_HIDE_DELAY_MS);

    clearReady = false;
    // A committed flood lets go over its own fade rather than snapping off, so the
    // departing page is what finishes the clear. Swapped in the same task so the
    // fade starts from the flood.
    setThresholdReached(node, o, false);
    if (committed) o.clearPreviewEl.classList.add('releasing');
    setWashProgress(o.clearWashEl, 0);
  }

  function resetDragVisuals(o: DragToClearOptions) {
    o.containerEl.classList.remove('dragging-active');
    o.containerEl.style.transform = '';
    node.classList.remove('dragging');
  }

  // Commit exit: the button eases home on ClearButton.svelte's return transition
  // while the page flies into it and passes beneath it. Until the page is gone
  // .clearing lets taps through the button, so one landing where the finger was
  // released reaches the paper instead of re-arming the gesture.
  function playClearExit(o: DragToClearOptions): void {
    node.classList.add('clearing');
    resetDragVisuals(o);

    timers.schedule(() => {
      stopDrawSound();
    }, DRAW_SOUND_STOP_DELAY_MS);

    timers.schedule(() => {
      node.classList.remove('clearing');
    }, CLEAR_SHEET_DURATION_MS);
  }

  function commitClear(o: DragToClearOptions, home: ClientPoint): void {
    commitClearSound();
    o.onTutorialDismiss();
    o.onClear(home);
    playClearExit(o);
  }

  function onPointerUp(e: PointerEvent) {
    if (activeDrag === null || e.pointerId !== activeDrag.pointerId) return;

    const drag = activeDrag;
    const o = drag.options;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const committed = dragDistance(clientX, clientY) >= drag.acceptRadius;
    // Read before finishDrag lets the button go: an orientation change mid-drag
    // moves the dock under the still-translated button, so the centre captured at
    // pointerdown can be stale.
    const home = committed ? dockedCenter(drag) : null;

    finishDrag(drag, committed);

    if (home) {
      commitClear(o, home);
    } else {
      cancelClearSound();
      resetDragVisuals(o);
    }

    o.onDragEnd?.();

    suppress(e);
  }

  // detail 0 is keyboard/desktop-AT activation and stays outside toddler pointer input.
  // Mobile screen readers synthesize touch/pointer activation, so this path does not cover them.
  function onClick(e: MouseEvent) {
    if (e.detail !== 0 || activeDrag !== null || node.classList.contains('clearing')) return;
    releaseAllPointers();
    startClearSound();
    commitClear(getOptions(), buttonCenter());
  }

  function onPointerCancel(e: PointerEvent) {
    if (activeDrag === null || e.pointerId !== activeDrag.pointerId) return;

    const drag = activeDrag;
    const o = drag.options;
    finishDrag(drag, false);

    resetDragVisuals(o);
    cancelClearSound();
    stopDrawSound();
    o.onDragEnd?.();

    suppress(e);
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerCancel);
  node.addEventListener('click', onClick);

  return {
    destroy() {
      if (activeDrag !== null) {
        const drag = activeDrag;
        const o = drag.options;
        finishDrag(drag, false);
        cancelClearSound();
        resetDragVisuals(o);
        // finishDrag only hides the zone on a delayed timer, and the
        // timers.cancelAll() sweep below cancels it before it can fire.
        o.acceptZoneEl.style.display = 'none';
      }
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
      node.removeEventListener('click', onClick);
      if (acceptZoneFrame !== null) cancelAnimationFrame(acceptZoneFrame);
      timers.cancelAll();
    },
  };
}
