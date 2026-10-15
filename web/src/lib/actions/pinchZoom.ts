import { createSpreadTracker, type Point } from './spreadTracker';

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
