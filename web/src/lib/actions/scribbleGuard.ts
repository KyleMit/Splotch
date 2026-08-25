import { flushSync } from 'svelte';
import { forgetPenPointer } from '$lib/drawing/engine';
import { pointerWasResumed } from '$lib/drawing/strokeMath';

// Browsers tolerate small click movement; match that forgiveness before a
// control exit irreversibly turns the press into a drag.
const TAP_MOVEMENT_TOLERANCE_PX = 8;

// How long after a finished press its trailing synthesized click is consumed.
// The click is NOT dispatched synchronously after pointerup — on-device it
// arrived two tasks later (+2ms), which made a zero-delay timer clear too
// early and double-fire the control — and legacy WebKit could delay synthesis
// by its 350ms double-tap window, so the consume window must outlast both.
const PRESS_CLICK_CONSUME_WINDOW_MS = 700;

// iPadOS Scribble claims an Apple Pencil stroke that starts within ~450ms of a
// pen TAP anywhere on the page: the stroke's pointer events still arrive, the
// engine paints it, but the system never presents those frames — the ink is
// invisible and never appears (only re-damaging the pixels shows it). The tap
// is what arms Scribble, so the control being tapped must cancel the tap's
// parallel TOUCH stream; preventDefault on the pointer events does nothing
// (documented at https://mikepk.com/2020/10/iOS-safari-scribble-bug/ and
// confirmed on-device).
//
// Scoped to stylus touches: cancelling touchstart suppresses the synthesized
// click, so finger taps must pass through untouched for click-driven controls
// and assistive tech. Apply to controls a pen taps right before drawing (the
// color palette); the canvas guards itself inside the engine.
// Safari-only field (the whole point: Scribble only exists there).
type StylusAwareTouch = Touch & { touchType?: 'direct' | 'stylus' };

interface ScribbleTapStreamHandlers {
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
  cancel: (event: PointerEvent) => void;
}

interface ScribbleTapHandlers {
  activate: () => void;
  onPressStart?: () => void;
  onPressCancel?: () => void;
}

type ScribbleTapHandler = (() => void) | ScribbleTapHandlers;

function createScribbleTapDispatcher(ownerWindow: Window) {
  const handlersByPointerId = new Map<number, ScribbleTapStreamHandlers>();
  let subscriptionCount = 0;

  const move = (event: PointerEvent) => handlersByPointerId.get(event.pointerId)?.move(event);
  const up = (event: PointerEvent) => handlersByPointerId.get(event.pointerId)?.up(event);
  const cancel = (event: PointerEvent) => handlersByPointerId.get(event.pointerId)?.cancel(event);

  function addWindowListeners() {
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', up, true);
    ownerWindow.addEventListener('pointercancel', cancel, true);
  }

  function removeWindowListeners() {
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', up, true);
    ownerWindow.removeEventListener('pointercancel', cancel, true);
  }

  return {
    subscribe(handlers: ScribbleTapStreamHandlers) {
      let active = true;
      let claimedPointerId: number | undefined;
      if (subscriptionCount === 0) addWindowListeners();
      subscriptionCount += 1;

      function release(pointerId: number) {
        if (claimedPointerId === pointerId && handlersByPointerId.get(pointerId) === handlers) {
          handlersByPointerId.delete(pointerId);
        }
        if (claimedPointerId === pointerId) claimedPointerId = undefined;
      }

      return {
        claim(pointerId: number) {
          if (!active) return;
          if (claimedPointerId !== undefined) release(claimedPointerId);
          claimedPointerId = pointerId;
          handlersByPointerId.set(pointerId, handlers);
        },
        release,
        destroy() {
          if (!active) return;
          active = false;
          if (claimedPointerId !== undefined) release(claimedPointerId);
          subscriptionCount -= 1;
          if (subscriptionCount === 0) removeWindowListeners();
        },
      };
    },
  };
}

const scribbleTapDispatchers = new WeakMap<
  Window,
  ReturnType<typeof createScribbleTapDispatcher>
>();

function dispatcherFor(ownerWindow: Window) {
  let dispatcher = scribbleTapDispatchers.get(ownerWindow);
  if (!dispatcher) {
    dispatcher = createScribbleTapDispatcher(ownerWindow);
    scribbleTapDispatchers.set(ownerWindow, dispatcher);
  }
  return dispatcher;
}

export function scribbleGuard(node: HTMLElement) {
  const cancel = (e: TouchEvent) => {
    const touches = Array.from(e.changedTouches) as StylusAwareTouch[];
    if (touches.length > 0 && touches.every((t) => t.touchType === 'stylus')) {
      e.preventDefault();
    }
  };
  const opts: AddEventListenerOptions = { passive: false };
  node.addEventListener('touchstart', cancel, opts);
  node.addEventListener('touchmove', cancel, opts);
  node.addEventListener('touchend', cancel, opts);
  return {
    destroy() {
      node.removeEventListener('touchstart', cancel);
      node.removeEventListener('touchmove', cancel);
      node.removeEventListener('touchend', cancel);
    },
  };
}

// Companion for click-driven controls under scribbleGuard: cancelling a stylus
// tap's touchstart also suppresses its synthesized click, so activation moves
// to pointerup. The press must have started on the same control with the same
// pointer (a drag that merely ends on the control sees no matching pointerdown
// and never fires it). click stays wired for keyboard/assistive-tech activation
// — those clicks have detail 0, no pointer press — while a real pointer's
// trailing click (detail ≥ 1) is ignored, so the control never double-fires
// where the guard is inert (finger, mouse, stylus outside iPadOS).
export function scribbleTap(node: HTMLElement, handler: ScribbleTapHandler) {
  let current = handler;
  let press:
    | {
        pointerId: number;
        pointerType: string;
        startX: number;
        startY: number;
        lastX: number;
        lastY: number;
        lastTime: number;
        dragged: boolean;
      }
    | undefined;
  const ownerWindow = node.ownerDocument.defaultView;

  const activate = () => (typeof current === 'function' ? current() : current.activate());

  const cancelPreparation = () => {
    if (typeof current !== 'function') current.onPressCancel?.();
  };

  // A trailing synthesized click is consumed by the press that produced it —
  // whether that press activated or was deliberately cancelled (a drag-off) —
  // so it can never double-fire or resurrect a rejected drag. One press
  // consumes at most one click, inside a bounded window.
  let pressConsumesClickUntil = 0;

  function finishPress(shouldActivate: boolean) {
    if (!press) return;
    stream?.release(press.pointerId);
    press = undefined;
    pressConsumesClickUntil = performance.now() + PRESS_CLICK_CONSUME_WINDOW_MS;
    if (shouldActivate) activate();
    else cancelPreparation();
  }

  function eventHitsControl(e: PointerEvent): boolean {
    const hit = node.ownerDocument.elementFromPoint(e.clientX, e.clientY);
    return node.contains(hit);
  }

  function minViewportSide(): number {
    const root = node.ownerDocument.documentElement;
    return Math.min(
      root.clientWidth || ownerWindow?.innerWidth || 0,
      root.clientHeight || ownerWindow?.innerHeight || 0
    );
  }

  function move(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    const now = Date.now();
    const jump = Math.hypot(e.clientX - press.lastX, e.clientY - press.lastY);
    let isMissingPenLift = false;
    if (
      press.pointerType === 'pen' &&
      e.pointerType === 'pen' &&
      e.buttons !== 0 &&
      !press.dragged
    ) {
      const viewportSide = minViewportSide();
      isMissingPenLift =
        viewportSide > 0 && pointerWasResumed(now - press.lastTime, jump, viewportSide);
    }

    if (isMissingPenLift) {
      // The engine's window-capture adopter runs first; for a control-targeted
      // stream its live-pointer gate declines adoption. Consume the resumed
      // move before target phase, then forget and flush the activated state.
      e.preventDefault();
      e.stopImmediatePropagation();
      forgetPenPointer(e.pointerId);
      finishPress(true);
      flushSync();
      return;
    }

    if (
      !press.dragged &&
      Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > TAP_MOVEMENT_TOLERANCE_PX &&
      !eventHitsControl(e)
    ) {
      press.dragged = true;
    }
    press.lastX = e.clientX;
    press.lastY = e.clientY;
    press.lastTime = now;
  }

  // iPadOS expands touch targets: a finger landing a hair outside the control
  // still gets its whole pointer stream targeted at the control by WebKit's own
  // hit-test (observed on-device: down and up delivered 1px above the undo
  // button, with the synthesized click landing inside it). A geometric re-test
  // with the raw coordinates vetoes that snap — and the detail>=1 click guard
  // below has already removed the browser's fallback — so the control plays its
  // press feedback and then swallows the tap. A press that never travelled
  // activates on the browser's targeting alone; the re-test still gates
  // releases that actually moved.
  function pressStayedPut(e: PointerEvent): boolean {
    return (
      press !== undefined &&
      Math.hypot(e.clientX - press.startX, e.clientY - press.startY) <= TAP_MOVEMENT_TOLERANCE_PX
    );
  }

  function up(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    finishPress(!press.dragged && (pressStayedPut(e) || eventHitsControl(e)));
  }

  function cancel(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finishPress(false);
  }

  function down(e: PointerEvent) {
    if (press) finishPress(false);
    press = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: Date.now(),
      dragged: false,
    };
    stream?.claim(e.pointerId);
    if (typeof current !== 'function') current.onPressStart?.();
  }

  // detail 0 is keyboard/assistive-tech activation. A detail>=1 click with no
  // press to consume it is iOS resolving a near-miss tap to this control after
  // touch-target expansion aimed the pointer stream elsewhere — observed
  // on-device as a click synthesized dead-center on the undo button while its
  // pointerdown landed a pixel outside (issue 1237). The browser's tap
  // resolution is the authority; discarding it leaves a control that plays no
  // feedback and does nothing.
  const click = (e: MouseEvent) => {
    if (e.detail === 0) {
      activate();
      return;
    }
    if (performance.now() < pressConsumesClickUntil) {
      pressConsumesClickUntil = 0;
      return;
    }
    activate();
  };
  // Direct pointer-id routing keeps the drawing hot path at one window handler.
  const stream = ownerWindow
    ? dispatcherFor(ownerWindow).subscribe({ move, up, cancel })
    : undefined;
  node.addEventListener('pointerdown', down);
  node.addEventListener('click', click);
  return {
    update(next: ScribbleTapHandler) {
      current = next;
    },
    destroy() {
      if (press) finishPress(false);
      stream?.destroy();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('click', click);
    },
  };
}
