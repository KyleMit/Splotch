import { browser } from '$app/environment';
import { scheduleIdle } from '$lib/idle';
import { ui, settingsModal } from '$lib/state/ui.svelte';

// Read both breakpoints in one flush: independent updates transiently mount the
// wide pane when a phone rotates between its hub and compact shells.
export function createSettingsMediaQueries(queries: { wide: string; compact: string }) {
  let wide = $state(browser ? matchMedia(queries.wide).matches : false);
  let compact = $state(browser ? matchMedia(queries.compact).matches : false);
  // Whether the pane is on screen is an input to how an arriving change is
  // applied, not to the subscription itself. Reading it inside the effect below
  // made it a dependency, so every Settings open, every close and both edges of
  // a Button Size drag tore down two MediaQueryList listeners, built two fresh
  // ones and re-evaluated both queries — on the Settings open path, which the
  // staged mount watermarks next door exist to keep under a frame budget.
  const foreground = () => settingsModal.open || ui.resizingActionButtons;

  // Cancellation is lifecycle bookkeeping, deliberately untracked.
  let cancelPending: (() => void) | undefined;

  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const wideQuery = matchMedia(queries.wide);
    const compactQuery = matchMedia(queries.compact);
    const update = () => {
      wide = wideQuery.matches;
      compact = compactQuery.matches;
    };
    const apply = () => {
      cancelPending?.();
      cancelPending = undefined;
      // Read when the change arrives rather than when the effect ran, which is
      // what lets the subscription outlive a change of foreground.
      if (foreground()) {
        update();
        return;
      }
      // The handle is cleared by the callback itself as well as by whoever
      // cancels it: a handle left behind after the update already ran reads as
      // outstanding work, and the foreground effect below would then redo it.
      cancelPending = scheduleIdle(() => {
        cancelPending = undefined;
        update();
      });
    };
    update();
    wideQuery.addEventListener('change', apply);
    compactQuery.addEventListener('change', apply);
    return () => {
      cancelPending?.();
      wideQuery.removeEventListener('change', apply);
      compactQuery.removeEventListener('change', apply);
    };
  });

  // Coming to the foreground with an idle update still pending: apply it now
  // rather than leaving the pane a frame behind the viewport it is opening
  // into. This was previously a side effect of resubscribing.
  $effect(() => {
    if (!foreground() || !cancelPending) return;
    cancelPending();
    cancelPending = undefined;
    wide = matchMedia(queries.wide).matches;
    compact = matchMedia(queries.compact).matches;
  });
  return {
    get wide() {
      return wide;
    },
    get compact() {
      return compact;
    },
  };
}
