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

function suppress(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

export interface DragToClearOptions {
  containerEl: HTMLDivElement;
  acceptZoneEl: HTMLDivElement;
  clearPreviewEl: HTMLDivElement;
  // Called when the user drags past the threshold and releases — should clear canvas and save.
  // `home` is the button's docked centre at release, where the departing page is headed.
  onClear: (home: ClientPoint) => void;
  onTutorialShow: () => void;
  onTutorialDismiss: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
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
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let acceptZoneFrame: number | null = null;
  let clickCount = 0;
  let lastClickTime = 0;

  const resetTimers = new Set<ReturnType<typeof setTimeout>>();

  function scheduleReset(fn: () => void, delay: number) {
    const id = setTimeout(() => {
      resetTimers.delete(id);
      fn();
    }, delay);
    resetTimers.add(id);
    return id;
  }

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

  // True when the tap completed a multi-tap run and showed the tutorial, in which
  // case the caller must not start a drag.
  function registerTap(now: number, o: DragToClearOptions): boolean {
    if (now - lastClickTime < MULTI_CLICK_WINDOW_MS) {
      clickCount++;
      if (clickCount >= MULTI_CLICK_THRESHOLD) {
        o.onTutorialShow();
        clickCount = 0;
        return true;
      }
    } else {
      clickCount = 1;
    }
    lastClickTime = now;
    return false;
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
    if (registerTap(Date.now(), o)) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    holdTimer = scheduleReset(o.onTutorialShow, HOLD_DURATION_MS);

    const home = buttonCenter();
    const acceptRadius = getAcceptRadius();
    activeDrag = { pointerId: e.pointerId, options: o, acceptRadius, offsetX: 0, offsetY: 0 };
    capturePointer(node, e.pointerId);
    startPointerX = clientX;
    startPointerY = clientY;
    clearReady = false;
    document.documentElement.style.setProperty('--clear-progress', '0');
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
      if (holdTimer !== null) {
        resetTimers.delete(holdTimer);
        clearTimeout(holdTimer);
        holdTimer = null;
      }
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
    // the clear (see .clear-preview). Inherited from :root so any element can read it.
    const normalizedDistance = distance / acceptRadius;
    const progress = Math.min(normalizedDistance, 1);
    document.documentElement.style.setProperty('--clear-progress', `${progress}`);
    updateClearSound(normalizedDistance);

    if (distance >= acceptRadius) {
      node.classList.add('delete-ready');
      o.acceptZoneEl.classList.add('threshold-reached');
      o.clearPreviewEl.classList.add('committed');
      // Fire a single tactile "click" the moment we cross the point of no return.
      if (!clearReady) {
        clearReady = true;
        impactThreshold();
      }
    } else {
      node.classList.remove('delete-ready');
      o.acceptZoneEl.classList.remove('threshold-reached');
      o.clearPreviewEl.classList.remove('committed');
      clearReady = false;
    }

    suppress(e);
  }

  function finishDrag(drag: ActiveDrag, committed: boolean) {
    const { options: o, pointerId } = drag;
    if (holdTimer !== null) {
      resetTimers.delete(holdTimer);
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (acceptZoneFrame !== null) {
      cancelAnimationFrame(acceptZoneFrame);
      acceptZoneFrame = null;
    }
    activeDrag = null;
    releasePointer(node, pointerId);

    o.acceptZoneEl.classList.remove('visible');
    o.acceptZoneEl.classList.remove('threshold-reached');
    scheduleReset(() => {
      if (activeDrag === null) o.acceptZoneEl.style.display = 'none';
    }, ACCEPT_ZONE_HIDE_DELAY_MS);

    clearReady = false;
    // A committed flood lets go over its own fade rather than snapping off, so the
    // departing page is what finishes the clear. Swapped in the same task so the
    // fade starts from the flood.
    o.clearPreviewEl.classList.remove('committed');
    if (committed) o.clearPreviewEl.classList.add('releasing');
    document.documentElement.style.setProperty('--clear-progress', '0');

    node.classList.remove('delete-ready');
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

    scheduleReset(() => {
      stopDrawSound();
    }, DRAW_SOUND_STOP_DELAY_MS);

    scheduleReset(() => {
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
        // finishDrag only hides the zone on a delayed timer, and the resetTimers
        // sweep below cancels it before it can fire.
        o.acceptZoneEl.style.display = 'none';
      }
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
      node.removeEventListener('click', onClick);
      if (acceptZoneFrame !== null) cancelAnimationFrame(acceptZoneFrame);
      for (const id of resetTimers) clearTimeout(id);
      resetTimers.clear();
    },
  };
}
