// ── Pinch-to-zoom for the AI preview ──────────────────────────────────────
// The drawing page suppresses native pinch element-by-element (touch-action:none
// + the engine's touch preventDefault, ADR-0076) so the toddler can't zoom the
// drawing surface. That also kills native pinch on the AI result, so the preview
// runs its own gesture: two fingers scale it, one finger pans once zoomed, and
// everything is clamped to the preview's own bounds — the drawing surface stays
// locked.

import { createSpreadTracker, type Point } from './spreadTracker';
import { capturePointer, releasePointer } from './pointerCapture';

export type { Point };

// Applied as `translate(x, y) scale(scale)` with a top-left transform origin, so
// a content point `c` maps to surface point `scale * c + (x, y)`.
interface Transform {
  scale: number;
  x: number;
  y: number;
}

interface Bounds {
  width: number;
  height: number;
}

// MIN_SCALE/MAX_SCALE/clampScale/clampTransform are exported so
// pinchZoom.svelte.test.ts can unit-test the pure gesture math directly (incl.
// edge cases like NaN) rather than only through createPinchZoom's pointer-event
// surface.
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
const IDENTITY_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// Keep the scaled content covering the surface: it may never be dragged past an
// edge, and at scale 1 the only legal offset is (0, 0) — so a stray one-finger
// pan can't nudge an un-zoomed preview.
export function clampTransform(t: Transform, bounds: Bounds): Transform {
  const scale = clampScale(t.scale);
  const minX = bounds.width * (1 - scale);
  const minY = bounds.height * (1 - scale);
  return {
    scale,
    x: Math.min(0, Math.max(minX, t.x)),
    y: Math.min(0, Math.max(minY, t.y)),
  };
}

function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// A DOM-free gesture accumulator: feed it pointer positions (in surface-local
// coordinates) and read back the clamped transform. The Svelte action wires real
// PointerEvents to it; tests drive it with synthetic points.
export function createPinchZoom(getBounds: () => Bounds) {
  const tracker = createSpreadTracker();
  let transform: Transform = { ...IDENTITY_TRANSFORM };
  // Snapshot at the start of each gesture segment (whenever a finger lands or
  // lifts) so scaling and panning stay relative to that instant — no jumps when
  // the finger count changes mid-gesture.
  let base: { transform: Transform; centroid: Point; spread: number; count: number } | null = null;

  function rebase() {
    const pts = tracker.points();
    if (pts.length === 0) {
      base = null;
      return;
    }
    base = {
      transform: { ...transform },
      centroid: centroid(pts),
      spread: tracker.spread(),
      count: pts.length,
    };
  }

  function recompute() {
    if (!base) return;
    const pts = tracker.points();
    if (pts.length === 0) return;

    const now = centroid(pts);
    let scale = base.transform.scale;
    if (base.count >= 2 && pts.length >= 2 && base.spread > 0) {
      scale = clampScale(base.transform.scale * (tracker.spread() / base.spread));
    }

    // Hold the content point that sat under the gesture's start centroid beneath
    // the fingers as they move and scale.
    const cx = (base.centroid.x - base.transform.x) / base.transform.scale;
    const cy = (base.centroid.y - base.transform.y) / base.transform.scale;
    transform = clampTransform(
      { scale, x: now.x - scale * cx, y: now.y - scale * cy },
      getBounds()
    );
  }

  return {
    get transform() {
      return transform;
    },
    get pointerCount() {
      return tracker.pointerCount;
    },
    get isZoomed() {
      return transform.scale > MIN_SCALE;
    },
    down(id: number, p: Point) {
      tracker.down(id, p);
      rebase();
    },
    move(id: number, p: Point) {
      if (!tracker.move(id, p)) return;
      recompute();
    },
    up(id: number) {
      if (!tracker.up(id)) return;
      rebase();
    },
    reset() {
      tracker.clear();
      base = null;
      transform = { ...IDENTITY_TRANSFORM };
    },
  };
}

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
