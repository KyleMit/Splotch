// Shared wiring for the app's native <dialog> modals. Five dialogs all need the
// same scaffolding: open/close the dialog in response to a reactive flag, animate
// it out from the button that opened it (--origin-x/y), dismiss it when the
// backdrop is tapped (swallowing that tap so it never reaches the drawing canvas
// underneath), and re-sync the flag when the dialog is closed via Esc. This action
// owns all of that; each component supplies only its reactive options.
//
// Usage:
//   <dialog use:modalDialog={() => ({ open: ui.fooOpen, origin: ui.fooOrigin,
//                                     onRequestClose: closeFoo })}>
//
// The argument is a *getter* — the action reads it inside a $effect, so any runes
// it touches become reactive dependencies.
//
// Options:
//   open            (required) whether the dialog should be shown.
//   onRequestClose  (required) called to dismiss — should flip `open` to false.
//                   Invoked on a backdrop tap and on an Esc close.
//   origin          {x, y} screen point to fly in from; omit for no fly-in.
//   onOpen          side-effect fired just before showModal() on each open.
//   onClose         side-effect fired on the dialog's `close` event (Esc and
//                   programmatic close alike).
//   allowDismiss    () => boolean gate for *both* backdrop tap and Esc. When it
//                   returns false the dismissal is blocked (the backdrop tap is
//                   still swallowed; Esc is preventDefault'd).
//   blockBackdropAt (x, y) => boolean positional veto for backdrop dismissal only:
//                   return true to swallow a tap in that region without dismissing.
interface ModalOptions {
  open: boolean;
  onRequestClose?: () => void;
  origin?: { x: number; y: number } | null;
  onOpen?: () => void;
  onClose?: () => void;
  allowDismiss?: () => boolean;
  blockBackdropAt?: (x: number, y: number) => boolean;
}

export function modalDialog(node: HTMLDialogElement, getOptions: () => ModalOptions) {
  function isInsideDialog(x: number, y: number) {
    const r = node.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onPointerDown(e: PointerEvent) {
    // Taps on the content fall through to the dialog's own controls.
    if (isInsideDialog(e.clientX, e.clientY)) return;
    // Tap landed on the backdrop. Always swallow it so it can't leak to the
    // canvas underneath, then decide whether it also dismisses.
    e.preventDefault();
    e.stopPropagation();
    const o = getOptions();
    if (o.blockBackdropAt?.(e.clientX, e.clientY)) return;
    if (o.allowDismiss && o.allowDismiss() === false) return;
    o.onRequestClose?.();
  }

  function onCancel(e: Event) {
    const o = getOptions();
    // Block Esc when dismissal is currently disallowed (e.g. an in-flight
    // request the dialog can't get back).
    if (o.allowDismiss && o.allowDismiss() === false) e.preventDefault();
  }

  function onClose() {
    const o = getOptions();
    o.onClose?.();
    // Closed via Esc while the flag is still set — re-sync it.
    if (o.open) o.onRequestClose?.();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('cancel', onCancel);
  node.addEventListener('close', onClose);

  $effect(() => {
    const o = getOptions();
    if (o.open) {
      if (!node.open) {
        if (o.origin) {
          node.style.setProperty('--origin-x', `${o.origin.x - window.innerWidth / 2}px`);
          node.style.setProperty('--origin-y', `${o.origin.y - window.innerHeight / 2}px`);
        }
        o.onOpen?.();
        node.showModal();
      }
    } else if (node.open) {
      node.close();
    }
  });

  return {
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('cancel', onCancel);
      node.removeEventListener('close', onClose);
    },
  };
}
