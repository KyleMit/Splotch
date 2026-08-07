import { createSpreadTracker } from './spreadTracker';
import { capturePointer, releasePointer } from './pointerCapture';

export const MIN_TEXT_ZOOM = 1;
export const MAX_TEXT_ZOOM = 3;

export function clampTextZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TEXT_ZOOM;
  return Math.min(MAX_TEXT_ZOOM, Math.max(MIN_TEXT_ZOOM, zoom));
}

// Given the zoom in force when the second finger landed (`baseZoom`), the finger
// spread at that instant (`baseSpread`), and the current spread, return the new
// clamped zoom. Widening the fingers (spread grows) enlarges; pinching shrinks.
export function nextTextZoom(baseZoom: number, baseSpread: number, spread: number): number {
  if (baseSpread <= 0) return clampTextZoom(baseZoom);
  return clampTextZoom(baseZoom * (spread / baseSpread));
}

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

// Pinch-to-enlarge for a scrollable text pane (ADR-0076 tier 2). Unlike the
// transform-based `pinchZoom` used for the fixed-size AI preview, this drives CSS
// `zoom`, which reflows and extends the scroll container — so one finger keeps
// scrolling natively (this action never intercepts a single pointer) and only a
// two-finger pinch is captured to resize the text. On Firefox < 126 `zoom` is a
// no-op, so the pane simply stays at its normal size (scrolling is unaffected).
//
// The argument is a *getter* read inside a $effect (like `pinchZoom`), so the
// runes it touches — `enabled`, `resetKey`, the bound `target` — stay reactive.
export function pinchTextZoom(node: HTMLElement, getOptions: () => PinchTextZoomOptions) {
  const gesture = attachPinchTextZoom(node, getOptions);

  // Calling the option getter performs the reactive reads that subscribe this
  // effect to gate changes and overlay reopens.
  $effect(() => {
    getOptions();
    gesture.reset();
  });

  return { destroy: gesture.destroy };
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
  // setting underneath it. Mark that a two-finger gesture happened and swallow
  // the one trailing click it produces (the ghost-click guard from svelte.md).
  let pinchedRecently = false;

  function apply() {
    const target = getOptions().target;
    if (target) target.style.zoom = zoom === MIN_TEXT_ZOOM ? '' : String(zoom);
  }

  function reset() {
    tracker.clear();
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
    // A fresh gesture (first finger down) clears any stale pinch flag, so a
    // pinch that produced no click doesn't swallow a later legitimate tap.
    if (tracker.pointerCount === 0) pinchedRecently = false;
    tracker.down(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tracker.pointerCount === 2) {
      pinchedRecently = true;
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
  }

  // Capture phase so it fires before the target's own click handler and can
  // stop the click from ever reaching it. Swallows exactly one click — the one
  // the just-ended pinch would otherwise leak onto the control under a finger.
  function onClickCapture(e: MouseEvent) {
    if (!pinchedRecently) return;
    pinchedRecently = false;
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
