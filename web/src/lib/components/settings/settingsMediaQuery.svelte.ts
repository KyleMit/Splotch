import { browser } from '$app/environment';
import { scheduleIdle } from '$lib/idle';
import { ui, settingsModal } from '$lib/state/ui.svelte';

// Seeds from the live viewport at construction time (before first paint) so
// a flag that's already true on open renders its shell on the first frame —
// no narrow-then-wide flash. Closed shell reconstruction belongs to prewarming,
// so it cannot block the drawing surface's first frame after rotation.
export function settingsMediaQueryFlag(query: string): { readonly current: boolean } {
  let current = $state(browser ? matchMedia(query).matches : false);
  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mql = matchMedia(query);
    const foreground = settingsModal.open || ui.resizingActionButtons;
    // Cancellation is lifecycle bookkeeping, deliberately untracked.
    let cancelPending: (() => void) | undefined;
    const apply = () => {
      cancelPending?.();
      if (foreground) current = mql.matches;
      else cancelPending = scheduleIdle(() => (current = mql.matches));
    };
    current = mql.matches;
    mql.addEventListener('change', apply);
    return () => {
      cancelPending?.();
      mql.removeEventListener('change', apply);
    };
  });
  return {
    get current() {
      return current;
    },
  };
}
