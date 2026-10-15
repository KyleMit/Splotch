import { PRESS_CLICK_CONSUME_WINDOW_MS } from './clickConsumeWindow';
import { capturePointer, releasePointer } from './pointerCapture';
import { createSpreadTracker } from './spreadTracker';
import { MIN_TEXT_ZOOM, nextTextZoom } from './textZoom';

export interface PinchTextZoomOptions {
  // The element whose CSS `zoom` is driven — the content inside the scroll
  // container, so enlarging it grows the container's scroll extent and the text
  // stays reachable by ordinary one-finger scrolling (no custom pan needed).
  target: HTMLElement | undefined;
  // Gate the gesture (e.g. only while the overlay is open).
  enabled: boolean;
  // Any change resets the zoom back to 1 — pass the overlay's open flag so it
  // returns to normal size whenever it closes and reopens.
  resetKey?: unknown;
}

// The gesture itself, with no reactive context of its own — the $effect above is
// the only rune in `pinchTextZoom`, so splitting it off lets the pointer
// bookkeeping be unit-tested against a real element (`pinchTextZoom.svelte.test.ts`).
export function attachPinchTextZoom(node: HTMLElement, getOptions: () => PinchTextZoomOptions) {
  const tracker = createSpreadTracker();
  let zoom = MIN_TEXT_ZOOM;
  // Snapshot at the moment the pinch becomes two-fingered, so scaling is relative
  // to that instant and never jumps as fingers are added or lifted.
  let baseZoom = MIN_TEXT_ZOOM;
  let baseSpread = 0;
  // A pinch can start with the primary finger resting on a hub row / toggle /
  // link while the second finger does the spreading. That primary pointer still
  // fires a `click` when it lifts, which would open the section or flip the
  // setting underneath it. Remember that the gesture became a pinch, and once
  // its last finger lifts swallow the one trailing pointer click it produces
  // (the ghost-click guard from svelte.md) — only within the click window, so a
  // pinch that leaked no click cannot eat the next mouse tap, and only a
  // pointer-synthesized click (detail >= 1), so keyboard and assistive-tech
  // activation always get through.
  let pinched = false;
  let consumeClicksUntil = 0;

  function apply() {
    const target = getOptions().target;
    if (target) target.style.zoom = zoom === MIN_TEXT_ZOOM ? '' : String(zoom);
  }

  function reset() {
    tracker.clear();
    pinched = false;
    consumeClicksUntil = 0;
    zoom = MIN_TEXT_ZOOM;
    baseZoom = MIN_TEXT_ZOOM;
    baseSpread = 0;
    apply();
  }

  // Re-snapshot the base whenever the finger count changes so a lifted or added
  // finger doesn't warp the running zoom.
  function rebase() {
    baseZoom = zoom;
    baseSpread = tracker.spread();
  }

  function onPointerDown(e: PointerEvent) {
    if (!getOptions().enabled || e.pointerType !== 'touch') return;
    // A fresh gesture (first finger down) clears any stale pinch latch, so a
    // pinch that produced no click doesn't swallow a later legitimate tap.
    if (tracker.pointerCount === 0) {
      pinched = false;
      consumeClicksUntil = 0;
    }
    tracker.down(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tracker.pointerCount === 2) {
      pinched = true;
      rebase();
      // Only the finger that completes the pair is captured; the earlier one is
      // deliberately left alone so a lone finger keeps scrolling natively. Its lift
      // still arrives here regardless: a touch pointer's events go to the element
      // it went down on for the pointer's whole life (implicit pointer capture),
      // and if the pane's scroll claims it instead the tracker hears
      // `pointercancel`. Those are the only two ways a finger leaves, so nothing
      // is left stranded in the tracker — `tests/settings-zoom.spec.ts` holds that
      // down with real compositor touch.
      capturePointer(node, e.pointerId);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!tracker.move(e.pointerId, { x: e.clientX, y: e.clientY })) return;
    // Only a genuine two-finger pinch drives the zoom; a lone finger falls
    // through to the browser's native scroll.
    if (tracker.pointerCount < 2) return;
    zoom = nextTextZoom(baseZoom, baseSpread, tracker.spread());
    apply();
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent) {
    if (!tracker.up(e.pointerId)) return;
    releasePointer(node, e.pointerId);
    if (tracker.pointerCount >= 2) rebase();
    if (tracker.pointerCount === 0 && pinched) {
      pinched = false;
      consumeClicksUntil = performance.now() + PRESS_CLICK_CONSUME_WINDOW_MS;
    }
  }

  // Capture phase so it fires before the target's own click handler and can
  // stop the click from ever reaching it. Swallows exactly one click — the one
  // the just-ended pinch would otherwise leak onto the control under a finger.
  function onClickCapture(e: MouseEvent) {
    if (e.detail === 0) return;
    if (performance.now() >= consumeClicksUntil) return;
    consumeClicksUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerUp);
  node.addEventListener('click', onClickCapture, true);

  return {
    reset,
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('click', onClickCapture, true);
    },
  };
}
