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
