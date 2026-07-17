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
//
// On each open the action also arms a short-lived launch dead zone around
// `origin` (see launchGuard) that swallows every tap and click at the
// just-vacated button spot — backdrop AND dialog content alike. That covers a
// toddler's repeat taps (which would dismiss the modal they just opened) and
// the opening tap's own trailing synthesized click (which would activate
// whatever content painted under the finger — issue #308).
import { guardLaunchZone, isPointInLaunchZone, clearLaunchZones } from './launchGuard';

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
    // Within the launch window, a tap where the opening button sat is a stray
    // toddler repeat — swallow it whether it landed on the backdrop or on
    // content that painted under the finger (capture phase, so content
    // handlers never see it).
    if (isPointInLaunchZone(e.clientX, e.clientY)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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

  // The opening tap itself activates on pointerup, so its trailing synthesized
  // click dispatches after showModal() and is hit-tested against the
  // freshly-painted dialog — landing on whatever control sits at the launch
  // point (issue #308: the coloring book picker opened drilled into a "random"
  // book). Its pointerdown/up targeted the launcher, so the launch-zone check
  // above never sees it; swallow the click itself. detail 0 is keyboard/AT
  // activation, which has no meaningful coordinates and is never a ghost.
  function onClick(e: MouseEvent) {
    if (e.detail === 0) return;
    if (isPointInLaunchZone(e.clientX, e.clientY)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onCancel(e: Event) {
    const o = getOptions();
    // Block Esc when dismissal is currently disallowed (e.g. an in-flight
    // request the dialog can't get back).
    if (o.allowDismiss && o.allowDismiss() === false) e.preventDefault();
  }

  function onClose() {
    // A closed dialog has no backdrop to protect; drop the zone so it can't
    // bleed into whatever modal opens next.
    clearLaunchZones();
    const o = getOptions();
    o.onClose?.();
    // Closed via Esc while the flag is still set — re-sync it.
    if (o.open) o.onRequestClose?.();
  }

  node.addEventListener('pointerdown', onPointerDown, true);
  node.addEventListener('click', onClick, true);
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
        guardLaunchZone(o.origin ?? null);
        o.onOpen?.();
        node.showModal();
      }
    } else if (node.open) {
      node.close();
    }
  });

  return {
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown, true);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('cancel', onCancel);
      node.removeEventListener('close', onClose);
    },
  };
}
