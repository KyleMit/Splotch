export function createAiPreviewLoader(
  exportDrawing: () => Promise<Blob | null>,
  commit: (blob: Blob, url: string) => void
) {
  let activeLoadId = 0;

  return {
    async load() {
      const loadId = ++activeLoadId;
      const blob = await exportDrawing();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (loadId !== activeLoadId) {
        URL.revokeObjectURL(url);
        return;
      }
      commit(blob, url);
    },
    invalidate() {
      activeLoadId++;
    },
  };
}

// ── Pinch-to-zoom for the AI preview ──────────────────────────────────────
// The drawing page suppresses native pinch element-by-element (touch-action:none
// + the engine's touch preventDefault, ADR-0076) so the toddler can't zoom the
// drawing surface. That also kills native pinch on the AI result, so the preview
// runs its own gesture: two fingers scale it, one finger pans once zoomed, and
// everything is clamped to the preview's own bounds — the drawing surface stays
// locked.

export interface Point {
  x: number;
  y: number;
}

// Applied as `translate(x, y) scale(scale)` with a top-left transform origin, so
// a content point `c` maps to surface point `scale * c + (x, y)`.
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const IDENTITY_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

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

function spread(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A DOM-free gesture accumulator: feed it pointer positions (in surface-local
// coordinates) and read back the clamped transform. The Svelte action wires real
// PointerEvents to it; tests drive it with synthetic points.
export function createPinchZoom(getBounds: () => Bounds) {
  const pointers = new Map<number, Point>();
  let transform: Transform = { ...IDENTITY_TRANSFORM };
  // Snapshot at the start of each gesture segment (whenever a finger lands or
  // lifts) so scaling and panning stay relative to that instant — no jumps when
  // the finger count changes mid-gesture.
  let base: { transform: Transform; centroid: Point; spread: number; count: number } | null = null;

  function rebase() {
    const pts = [...pointers.values()];
    if (pts.length === 0) {
      base = null;
      return;
    }
    base = {
      transform: { ...transform },
      centroid: centroid(pts),
      spread: pts.length >= 2 ? spread(pts[0], pts[1]) : 0,
      count: pts.length,
    };
  }

  function recompute() {
    if (!base) return;
    const pts = [...pointers.values()];
    if (pts.length === 0) return;

    const now = centroid(pts);
    let scale = base.transform.scale;
    if (base.count >= 2 && pts.length >= 2 && base.spread > 0) {
      scale = clampScale(base.transform.scale * (spread(pts[0], pts[1]) / base.spread));
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
      return pointers.size;
    },
    get isZoomed() {
      return transform.scale > MIN_SCALE;
    },
    down(id: number, p: Point) {
      pointers.set(id, p);
      rebase();
    },
    move(id: number, p: Point) {
      if (!pointers.has(id)) return;
      pointers.set(id, p);
      recompute();
    },
    up(id: number) {
      if (!pointers.delete(id)) return;
      rebase();
    },
    reset() {
      pointers.clear();
      base = null;
      transform = { ...IDENTITY_TRANSFORM };
    },
  };
}
