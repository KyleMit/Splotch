import { adoptPointerStroke, getActiveCanvas } from '$lib/drawing/engine';

// Drag a color straight onto the canvas (issue #185): a press that begins on a
// palette swatch and crosses onto the canvas mid-drag selects that color and
// becomes a live stroke — a more discoverable, tactile selection for toddlers.
//
// The pressed pointer is watched at the window level: a touch press implicitly
// captures to the swatch button, so its moves retarget there — but they still
// bubble — while mouse/pen moves target whatever they cross; window sees both.
// Each move is hit-tested via elementFromPoint (like the engine's
// adoptStrayPenStream), so a floating control over the canvas never triggers
// the handoff. When the pointer reaches exposed canvas, onDragToCanvas selects
// the color — pushing it into the engine synchronously; the reactive bridges in
// DrawingCanvas flush too late for this stream — then adoptPointerStroke starts
// the stroke and captures the rest of the stream to the canvas.
//
// A tap never moves onto the canvas, so tap selection (scribbleTap) is
// untouched, and Scribble protection needs nothing new: the palette's
// scribbleGuard cancels a stylus drag's touch stream for its whole lifetime
// (touch events keep targeting the element the touch started on, ADR-0038).
export function dragColorToCanvas(node: HTMLElement, onDragToCanvas: () => void) {
  let current = onDragToCanvas;
  let activeId: number | null = null;

  const stopTracking = () => {
    activeId = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    const canvas = getActiveCanvas();
    if (!canvas || document.elementFromPoint(e.clientX, e.clientY) !== canvas) return;
    stopTracking();
    current();
    adoptPointerStroke(e);
  };

  const end = (e: PointerEvent) => {
    if (e.pointerId === activeId) stopTracking();
  };

  const down = (e: PointerEvent) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  node.addEventListener('pointerdown', down);

  return {
    update(next: () => void) {
      current = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      stopTracking();
    },
  };
}
