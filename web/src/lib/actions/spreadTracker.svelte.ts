import { SvelteMap } from 'svelte/reactivity';

export interface Point {
  x: number;
  y: number;
}

// The pointer bookkeeping shared by both pinch gestures: which fingers are down,
// where they are, and how far the first two are apart. Deliberately DOM-free and
// free of any gesture math — each caller layers its own (`pinchZoom`'s 2D
// pan+zoom transform, `pinchTextZoom`'s 1D zoom ratio) on top.
//
// The map is a private detail so neither caller inherits the other's reactivity
// assumptions; only `pointerCount` and a snapshot array are exposed. It is a
// SvelteMap so `pointerCount` stays reactive for `pinchZoom`'s
// `pointerCount`/`isZoomed` getters.
export function createSpreadTracker() {
  const pointers = new SvelteMap<number, Point>();

  return {
    get pointerCount() {
      return pointers.size;
    },
    points(): Point[] {
      return [...pointers.values()];
    },
    // Every finger currently down, so a caller can act on the ones that landed
    // before its gesture engaged — `pinchTextZoom` captures them all at that
    // moment so none of their lifts can escape the element.
    ids(): number[] {
      return [...pointers.keys()];
    },
    down(id: number, p: Point) {
      pointers.set(id, p);
    },
    // Returns false for a pointer this tracker never saw go down, so a caller can
    // ignore events from a gesture it isn't part of.
    move(id: number, p: Point): boolean {
      if (!pointers.has(id)) return false;
      pointers.set(id, p);
      return true;
    },
    up(id: number): boolean {
      return pointers.delete(id);
    },
    // Distance between the first two fingers; 0 until a second one lands.
    spread(): number {
      const it = pointers.values();
      const a = it.next().value;
      const b = it.next().value;
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    },
    clear() {
      pointers.clear();
    },
  };
}
