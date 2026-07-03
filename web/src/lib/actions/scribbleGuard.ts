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

// Companion for click-driven controls under scribbleGuard: cancelling a stylus
// tap's touchstart also suppresses its synthesized click, so activation moves
// to pointerup. The press must have started on the same control with the same
// pointer (pen gets no implicit capture, so a drag that merely ends on the
// control sees no matching pointerdown and never fires it; sliding off clears
// the press via pointerleave). click stays wired for keyboard/assistive-tech
// activation — those clicks have detail 0, no pointer press — while a real
// pointer's trailing click (detail ≥ 1) is ignored, so the control never
// double-fires where the guard is inert (finger, mouse, stylus outside iPadOS).
export function scribbleTap(node: HTMLElement, activate: () => void) {
  let current = activate;
  let pressedId: number | null = null;
  const down = (e: PointerEvent) => {
    pressedId = e.pointerId;
  };
  const clearPress = () => {
    pressedId = null;
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pressedId) return;
    pressedId = null;
    current();
  };
  const click = (e: MouseEvent) => {
    if (e.detail === 0) current();
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', clearPress);
  node.addEventListener('pointerleave', clearPress);
  node.addEventListener('click', click);
  return {
    update(next: () => void) {
      current = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', clearPress);
      node.removeEventListener('pointerleave', clearPress);
      node.removeEventListener('click', click);
    },
  };
}
