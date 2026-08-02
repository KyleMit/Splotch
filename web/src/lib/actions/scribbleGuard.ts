import { flushSync } from 'svelte';
import { forgetPenPointer } from '$lib/drawing/engine';
import { pointerWasResumed } from '$lib/drawing/strokeMath';

// Browsers tolerate small click movement; match that forgiveness before a
// control exit irreversibly turns the press into a drag.
const TAP_MOVEMENT_TOLERANCE_PX = 8;

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
export function scribbleTap(node: HTMLElement, activate: () => void) {
  let current = activate;
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

  function finishPress(shouldActivate: boolean) {
    if (!press) return;
    press = undefined;
    if (shouldActivate) {
      current();
      flushSync();
    }
  }

  function eventHitsControl(e: PointerEvent): boolean {
    const hit = node.ownerDocument.elementFromPoint(e.clientX, e.clientY);
    return hit === node || (hit !== null && node.contains(hit));
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
    const isMissingPenLift =
      press.pointerType === 'pen' &&
      e.pointerType === 'pen' &&
      e.buttons !== 0 &&
      !press.dragged &&
      pointerWasResumed(now - press.lastTime, jump, minViewportSide());

    if (isMissingPenLift) {
      // The move belongs to the next physical contact. Keep it away from the
      // canvas until activation and its reactive engine bridge have flushed.
      e.preventDefault();
      e.stopImmediatePropagation();
      forgetPenPointer(e.pointerId);
      finishPress(true);
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

  function up(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    finishPress(!press.dragged && eventHitsControl(e));
  }

  function cancel(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finishPress(false);
  }

  function down(e: PointerEvent) {
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
  }

  const click = (e: MouseEvent) => {
    if (e.detail === 0) current();
  };
  // Lifetime-scoped capture listeners make their ordering stable. A resumed
  // move is selected and flushed before target-phase drawing can observe it.
  ownerWindow?.addEventListener('pointermove', move, true);
  ownerWindow?.addEventListener('pointerup', up, true);
  ownerWindow?.addEventListener('pointercancel', cancel, true);
  node.addEventListener('pointerdown', down);
  node.addEventListener('click', click);
  return {
    update(next: () => void) {
      current = next;
    },
    destroy() {
      press = undefined;
      ownerWindow?.removeEventListener('pointermove', move, true);
      ownerWindow?.removeEventListener('pointerup', up, true);
      ownerWindow?.removeEventListener('pointercancel', cancel, true);
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('click', click);
    },
  };
}
