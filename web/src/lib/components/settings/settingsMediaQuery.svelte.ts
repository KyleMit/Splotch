import { browser } from '$app/environment';
import { uiState, settingsModal } from '$lib/state/ui.svelte';

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
  const foreground = () => settingsModal.open || uiState.resizingActionButtons;

  // Whether a change arrived while the pane was in the background. Lifecycle
  // bookkeeping, deliberately untracked.
  let stale = false;

  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const wideQuery = matchMedia(queries.wide);
    const compactQuery = matchMedia(queries.compact);
    const update = () => {
      wide = wideQuery.matches;
      compact = compactQuery.matches;
    };
    // A closed pane is not swapped at all: its shell is invisible, and a
    // rotation is exactly when a change arrives, so remounting it then (even
    // from an idle callback, which mounts synchronously past its deadline) put
    // a section view's mount inside the rotation's scored frames. The swap
    // waits for the pane to come forward instead.
    const apply = () => {
      // Read when the change arrives rather than when the effect ran, which is
      // what lets the subscription outlive a change of foreground.
      if (foreground()) {
        stale = false;
        update();
        return;
      }
      stale = true;
    };
    update();
    wideQuery.addEventListener('change', apply);
    compactQuery.addEventListener('change', apply);
    return () => {
      wideQuery.removeEventListener('change', apply);
      compactQuery.removeEventListener('change', apply);
    };
  });

  // Coming to the foreground after a change landed in the background: apply it
  // now, in the open flush, so the pane opens into the shell its viewport picks.
  $effect(() => {
    if (!foreground() || !stale) return;
    stale = false;
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
