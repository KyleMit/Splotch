import { browser } from '$app/environment';
import { scheduleIdle } from '$lib/idle';
import { ui, settingsModal } from '$lib/state/ui.svelte';

// Read both breakpoints in one flush: independent updates transiently mount the
// wide pane when a phone rotates between its hub and compact shells.
export function createSettingsMediaQueries(queries: { wide: string; compact: string }) {
  let wide = $state(browser ? matchMedia(queries.wide).matches : false);
  let compact = $state(browser ? matchMedia(queries.compact).matches : false);
  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const wideQuery = matchMedia(queries.wide);
    const compactQuery = matchMedia(queries.compact);
    const foreground = settingsModal.open || ui.resizingActionButtons;
    // Cancellation is lifecycle bookkeeping, deliberately untracked.
    let cancelPending: (() => void) | undefined;
    const update = () => {
      wide = wideQuery.matches;
      compact = compactQuery.matches;
    };
    const apply = () => {
      cancelPending?.();
      if (foreground) update();
      else cancelPending = scheduleIdle(update);
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
  return {
    get wide() {
      return wide;
    },
    get compact() {
      return compact;
    },
  };
}
