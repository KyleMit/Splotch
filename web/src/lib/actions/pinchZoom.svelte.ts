// ── Pinch-to-zoom for the AI preview ──────────────────────────────────────
// The drawing page suppresses native pinch element-by-element (touch-action:none
// + the engine's touch preventDefault, ADR-0076) so the toddler can't zoom the
// drawing surface. That also kills native pinch on the AI result, so the preview
// runs its own gesture: two fingers scale it, one finger pans once zoomed, and
// everything is clamped to the preview's own bounds — the drawing surface stays
// locked.

import { type Point } from './spreadTracker';
import { createPinchZoom, MIN_SCALE } from './pinchZoom';
export { createPinchZoom, clampScale, clampTransform, MIN_SCALE, MAX_SCALE } from './pinchZoom';
import { capturePointer, releasePointer } from './pointerCapture';

export type { Point };

export interface PinchZoomOptions {
  // The element to transform. Lives inside `node`, which stays untransformed so
  // its rect gives stable surface-local coordinates as the target scales.
  target: HTMLElement | undefined;
  // Gate the gesture (e.g. only once the result has revealed).
  enabled: boolean;
  // Any change resets the zoom back to fit — pass the current image URL so a new
  // generation starts un-zoomed.
  resetKey?: unknown;
}

// Scoped pinch-to-zoom: `node` is the touch surface (kept at scale 1 so its
// bounding rect stays a fixed reference), `opts.target` is the child that
// actually scales and pans. The whole gesture is confined to `node`'s bounds, so
// the drawing page's element-level zoom lock (ADR-0076) is untouched.
//
// The argument is a *getter* read inside a $effect (like modalDialog), so the
// runes it touches — `enabled`, `resetKey`, the bound `target` — stay reactive.
export function pinchZoom(node: HTMLElement, getOptions: () => PinchZoomOptions) {
  // The surface stays at scale 1, so its rect is constant for the length of a
  // gesture — snapshot it on the first finger down and reuse it for every move,
  // instead of re-measuring (a layout read) on each pointer event.
  let rect: DOMRect | null = null;

  const zoom = createPinchZoom(() => {
    const r = rect ?? node.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });

  function local(e: PointerEvent): Point {
    const r = rect ?? node.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function apply(target: HTMLElement | undefined) {
    const t = zoom.transform;
    if (target) {
      const identity = t.scale === MIN_SCALE && t.x === 0 && t.y === 0;
      target.style.transform = identity ? '' : `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    }
    node.classList.toggle('zoomed', zoom.isZoomed);
  }

  function reset(target: HTMLElement | undefined) {
    zoom.reset();
    if (target) target.style.transform = '';
    node.classList.remove('zoomed');
  }

  // Intercept only when a real transform is in play — a two-finger pinch, or a
  // one-finger drag while already zoomed. A lone tap on an un-zoomed preview
  // passes straight through.
  function engaged() {
    return zoom.pointerCount >= 2 || zoom.isZoomed;
  }

  function onPointerDown(e: PointerEvent) {
    if (!getOptions().enabled) return;
    if (zoom.pointerCount === 0) rect = node.getBoundingClientRect();
    zoom.down(e.pointerId, local(e));
    capturePointer(node, e.pointerId);
    if (engaged()) e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    const o = getOptions();
    if (!o.enabled || zoom.pointerCount === 0) return;
    const wasEngaged = engaged();
    zoom.move(e.pointerId, local(e));
    if (wasEngaged || engaged()) {
      apply(o.target);
      e.preventDefault();
    }
  }

  // Deliberately unguarded by `enabled` — a pointer down while enabled still needs its capture released here if `enabled` flips false before it lifts.
  function onPointerUp(e: PointerEvent) {
    zoom.up(e.pointerId);
    releasePointer(node, e.pointerId);
    apply(getOptions().target);
    if (zoom.pointerCount === 0) rect = null;
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerUp);

  // Calling the option getter performs the reactive reads that subscribe this
  // effect to gate changes and new images. Each run returns the preview to its
  // un-zoomed, centered state.
  $effect(() => {
    const o = getOptions();
    reset(o.target);
  });

  return {
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
