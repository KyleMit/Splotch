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
//   onRequestClose  called to dismiss — should flip `open` to false.
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
import type { Origin } from '$lib/state/modal.svelte';

interface ModalOptions {
  open: boolean;
  onRequestClose: () => void;
  origin?: Origin | null;
  onOpen?: () => void;
  onClose?: () => void;
  allowDismiss?: () => boolean;
  blockBackdropAt?: (x: number, y: number) => boolean;
}

// Absent gate means dismissal is allowed.
function dismissAllowed(o: ModalOptions) {
  return o.allowDismiss?.() !== false;
}

export function waitForDialogClose(node: HTMLDialogElement): Promise<void> {
  if (!node.open) return Promise.resolve();
  return new Promise((resolve) => node.addEventListener('close', () => resolve(), { once: true }));
}

function closeAfterContentRetirementPaint(node: HTMLDialogElement, getOptions: () => ModalOptions) {
  const contentRoots = [...node.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  for (const root of contentRoots) root.style.visibility = 'hidden';
  const restoreContent = () => {
    for (const root of contentRoots) root.style.removeProperty('visibility');
  };
  let timer: number | undefined;
  const frame = requestAnimationFrame(() => {
    timer = window.setTimeout(() => {
      if (!getOptions().open && node.open) node.close();
    });
  });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    restoreContent();
  };
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
    // A dialog may deliberately render a top-layer control outside its own
    // border box. This handler captures the event before the control sees it,
    // so treating it as a backdrop tap would swallow it — it is content.
    if (e.target !== node) return;
    // Taps on the content fall through to the dialog's own controls.
    if (isInsideDialog(e.clientX, e.clientY)) return;
    // Tap landed on the backdrop. Always swallow it so it can't leak to the
    // canvas underneath, then decide whether it also dismisses.
    e.preventDefault();
    e.stopPropagation();
    const o = getOptions();
    if (o.blockBackdropAt?.(e.clientX, e.clientY)) return;
    if (!dismissAllowed(o)) return;
    o.onRequestClose();
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
    if (!dismissAllowed(o)) e.preventDefault();
  }

  function onClose() {
    // A closed dialog has no backdrop to protect; drop the zone so it can't
    // bleed into whatever modal opens next.
    clearLaunchZones();
    const o = getOptions();
    o.onClose?.();
    // Closed via Esc while the flag is still set — re-sync it.
    if (o.open) o.onRequestClose();
  }

  node.addEventListener('pointerdown', onPointerDown, true);
  node.addEventListener('click', onClick, true);
  node.addEventListener('cancel', onCancel);
  node.addEventListener('close', onClose);

  $effect(() => {
    const o = getOptions();
    if (o.open) {
      if (o.origin) {
        node.style.setProperty('--origin-x', `${o.origin.x - window.innerWidth / 2}px`);
        node.style.setProperty('--origin-y', `${o.origin.y - window.innerHeight / 2}px`);
      } else {
        node.style.removeProperty('--origin-x');
        node.style.removeProperty('--origin-y');
      }
      if (!node.open) {
        guardLaunchZone(o.origin ?? null);
        o.onOpen?.();
        node.showModal();
      }
    } else if (node.open) {
      return closeAfterContentRetirementPaint(node, getOptions);
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
