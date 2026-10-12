import type { Modal } from './modal.svelte';
import { resolvedTheme } from './appearance.svelte';
import type { ResolvedTheme } from '../theme';

// A closed dialog's themed artwork has no reason to follow a theme flip while
// nobody can see it: every re-sourced <img> is a DOM mutation plus a style
// invalidation inside the one frame the whole document restyles in. The value
// tracks resolvedTheme() only while the modal is open and catches up in the
// pre-render effect of the open that reveals it, so the first painted frame
// of the dialog already carries the current theme's art (issue 1696).
export function createDialogTheme(modal: Modal): { readonly current: ResolvedTheme } {
  let current = $state<ResolvedTheme>(resolvedTheme());
  $effect.pre(() => {
    if (modal.open) current = resolvedTheme();
  });
  return {
    get current() {
      return current;
    },
  };
}
