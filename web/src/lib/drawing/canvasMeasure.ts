// The canvas's measured geometry: the cached client rect the pointer hot path
// maps through, and the rule for when that rect is usable at all.
//
// A client rect with no area is not a layout, it's the absence of one. The
// document can report it while the page is still being restored (the
// `visibilitychange` that re-entry fires lands before the WebView has re-laid
// out), while an ancestor is display:none, or before the first style pass. It
// carries no geometry — neither a size to build surfaces from nor an origin to
// map pointers through — so it is refused and the last real one is kept.
//
// Rebuilding the engine from one is unrecoverable, which is why the deferred
// re-measure below exists. Adopting it collapses the paper to 0×0 — pinning
// paperIsSized() false, resizing every live tile to nothing, and scaling the
// fitted view to zero — after which strokes still track, record, and fire their
// callbacks into surfaces with no area. Input keeps flowing and the chrome keeps
// reacting, so the app looks alive while the canvas silently eats every stroke,
// and nothing re-runs the rebuild: an installed PWA at a fixed size gets no
// later resize or rotation, so it stays dead until the app is reloaded.

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasMeasureHost {
  canvas: () => HTMLCanvasElement | undefined;
  /** Backing-store size the cached rect is scaled against. */
  viewport: () => { width: number; height: number };
}

export function rectIsMeasured(rect: { width: number; height: number }): boolean {
  return rect.width > 0 && rect.height > 0;
}

export function createCanvasMeasure(host: CanvasMeasureHost) {
  // Cached so the pointer hot path never calls getBoundingClientRect() (each
  // call forces a synchronous reflow). Recomputed only on
  // resize/scroll/orientation change — see refresh().
  let rect: CanvasRect = { left: 0, top: 0, width: 0, height: 0 };
  let scaleX = 1;
  let scaleY = 1;
  let pending: ResizeObserver | null = null;

  function cancel() {
    pending?.disconnect();
    pending = null;
  }

  return {
    get rect(): Readonly<CanvasRect> {
      return rect;
    },

    // Snapshot the client rect and the backing-pixel scale factors. Called only
    // off the hot path, so toScreen() can stay reflow-free.
    refresh(next?: DOMRect) {
      const canvas = host.canvas();
      if (!canvas) return;
      next ??= canvas.getBoundingClientRect();
      if (!rectIsMeasured(next)) return;
      rect = { left: next.left, top: next.top, width: next.width, height: next.height };
      const viewport = host.viewport();
      scaleX = viewport.width / next.width;
      scaleY = viewport.height / next.height;
    },

    // Backing-store (screen) coordinates of a pointer event — the physical space
    // the edge-swipe gesture geometry runs in (OS gesture bands sit at device
    // edges, which a locked paper's rotation would otherwise move).
    toScreen(event: PointerEvent) {
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
    },

    // Whether `next` can be built from. When it can't, `rebuild` is armed for
    // the first layout that gives the canvas a box: a ResizeObserver rather than
    // a polled frame, because it fires on the very layout that produces the box,
    // and its initial callback covers a canvas that already had one by the time
    // it was armed. Arming is one-shot until the next accepted rect — a live
    // engine's ordinary resizes go through the window listener, not this.
    accept(next: DOMRect, rebuild: (rect: DOMRect) => void): boolean {
      if (rectIsMeasured(next)) {
        cancel();
        return true;
      }
      const canvas = host.canvas();
      if (!canvas || pending) return false;
      pending = new ResizeObserver(() => {
        const measured = canvas.getBoundingClientRect();
        if (rectIsMeasured(measured)) rebuild(measured);
      });
      pending.observe(canvas);
      return false;
    },

    cancel,
  };
}
