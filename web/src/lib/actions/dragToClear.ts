import { releaseAllPointers } from '$lib/drawing/engine';
import {
  cancelClearSound,
  commitClearSound,
  startClearSound,
  stopDrawSound,
  updateClearSound,
} from '$lib/audio/drawingSound';
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
export const PAGE_TURN_DURATION_MS = 600;
const RETURN_HANDOFF_GAP_MS = 50;
const EXIT_RETURN_DELAY_MS = PAGE_TURN_DURATION_MS + RETURN_HANDOFF_GAP_MS;

function suppress(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

export interface DragToClearOptions {
  containerEl: HTMLDivElement;
  acceptZoneEl: HTMLDivElement;
  clearPreviewEl: HTMLDivElement;
  pageTurnOverlayEl: HTMLDivElement;
  // Called when the user drags past the threshold and releases — should clear canvas and save.
  onClear: () => void;
  onTutorialShow: () => void;
  onTutorialDismiss: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function dragToClear(node: HTMLButtonElement, getOptions: () => DragToClearOptions) {
  let activePointerId: number | null = null;
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
    if (activePointerId !== null) return;

    const o = getOptions();
    if (registerTap(Date.now(), o)) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    holdTimer = scheduleReset(o.onTutorialShow, HOLD_DURATION_MS);

    activePointerId = e.pointerId;
    capturePointer(node, e.pointerId);
    startPointerX = clientX;
    startPointerY = clientY;
    clearReady = false;
    document.documentElement.style.setProperty('--clear-progress', '0');

    releaseAllPointers();
    startClearSound();

    const rect = node.getBoundingClientRect();
    const center = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };

    o.containerEl.classList.add('dragging-active');
    node.classList.add('dragging');

    armAcceptZone(o, center, getAcceptRadius());

    o.onDragStart?.();

    suppress(e);
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const o = getOptions();
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

    const distance = dragDistance(clientX, clientY);
    const threshold = getAcceptRadius();

    // Continuous 0→1 drag progress drives the radial paper wash that previews
    // the clear (see .clear-preview). Inherited from :root so any element can read it.
    const normalizedDistance = distance / threshold;
    const progress = Math.min(normalizedDistance, 1);
    document.documentElement.style.setProperty('--clear-progress', `${progress}`);
    updateClearSound(normalizedDistance);

    if (distance >= threshold) {
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

  function finishDrag(o: DragToClearOptions, pointerId: number) {
    if (holdTimer !== null) {
      resetTimers.delete(holdTimer);
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (acceptZoneFrame !== null) {
      cancelAnimationFrame(acceptZoneFrame);
      acceptZoneFrame = null;
    }
    activePointerId = null;
    releasePointer(node, pointerId);

    o.acceptZoneEl.classList.remove('visible');
    o.acceptZoneEl.classList.remove('threshold-reached');
    scheduleReset(() => {
      if (activePointerId === null) o.acceptZoneEl.style.display = 'none';
    }, ACCEPT_ZONE_HIDE_DELAY_MS);

    clearReady = false;
    o.clearPreviewEl.classList.remove('committed');
    document.documentElement.style.setProperty('--clear-progress', '0');

    node.classList.remove('delete-ready');
  }

  function resetDragVisuals(o: DragToClearOptions) {
    o.containerEl.classList.remove('dragging-active');
    o.containerEl.style.transform = '';
    node.classList.remove('dragging');
  }

  // Commit exit choreography: the button's fade/shrink and the page-turn ripple
  // live in ClearButton.svelte's CSS; the delays below only hand the classes over
  // at each stage.
  function playClearExit(o: DragToClearOptions): void {
    node.classList.add('clearing');
    o.pageTurnOverlayEl.classList.add('animating');

    scheduleReset(() => {
      stopDrawSound();
    }, DRAW_SOUND_STOP_DELAY_MS);

    scheduleReset(() => {
      o.pageTurnOverlayEl.classList.remove('animating');
      o.containerEl.style.transform = '';
      node.classList.remove('dragging');
      node.classList.add('clearing-done');
    }, PAGE_TURN_DURATION_MS);

    scheduleReset(() => {
      o.containerEl.classList.remove('dragging-active');
      node.classList.remove('clearing', 'clearing-done');
      node.classList.add('clearing-return');
    }, EXIT_RETURN_DELAY_MS);
  }

  function commitClear(o: DragToClearOptions): void {
    commitClearSound();
    o.onTutorialDismiss();
    o.onClear();
    playClearExit(o);
  }

  // The return leg's easing is the only reason .clearing-return exists, so it
  // comes off when that transition ends — reading the duration off the animation
  // itself rather than re-encoding ClearButton.svelte's timing here. The icons
  // transition their own margin and bubble, hence the target/property filter.
  function onTransitionEnd(e: TransitionEvent) {
    if (e.target === node && e.propertyName === 'opacity') {
      node.classList.remove('clearing-return');
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const o = getOptions();

    const clientX = e.clientX;
    const clientY = e.clientY;
    const distance = dragDistance(clientX, clientY);
    const threshold = getAcceptRadius();

    finishDrag(o, e.pointerId);

    if (distance >= threshold) {
      commitClear(o);
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
    if (e.detail !== 0 || activePointerId !== null) return;
    commitClear(getOptions());
  }

  function onPointerCancel(e: PointerEvent) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const o = getOptions();
    finishDrag(o, e.pointerId);

    resetDragVisuals(o);
    // A drag can start as soon as the button begins its return leg, so cancelling
    // must put it back on screen rather than leave it mid-fade.
    node.classList.remove('clearing-return');
    o.pageTurnOverlayEl.classList.remove('animating');
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
  node.addEventListener('transitionend', onTransitionEnd);

  return {
    destroy() {
      if (activePointerId !== null) {
        const o = getOptions();
        finishDrag(o, activePointerId);
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
      node.removeEventListener('transitionend', onTransitionEnd);
      if (acceptZoneFrame !== null) cancelAnimationFrame(acceptZoneFrame);
      for (const id of resetTimers) clearTimeout(id);
      resetTimers.clear();
    },
  };
}
