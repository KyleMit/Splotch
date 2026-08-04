import { requireParentalGate } from '$lib/state/parentalGate.svelte';
import { buttonCenter } from '$lib/state/ui.svelte';

// Gate an external link at its operation boundary (ADR-0094): the click is
// intercepted and the Grown-Ups Only challenge opens with `force: true` —
// links out of the app re-prove adulthood on every activation, regardless of
// any remembered unlock (App Store Guideline 5.1.4). On success the original
// anchor is re-activated, so native anchor semantics (target, rel, the
// WebView's external-browser handling) stay intact.
export function parentalGateLink(node: HTMLAnchorElement) {
  // One-shot latch: the replayed click after a solve must pass through.
  // Deliberately untracked — nothing renders it.
  let approved = false;

  function onClick(event: MouseEvent) {
    if (approved) {
      approved = false;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    requireParentalGate(
      () => {
        approved = true;
        node.click();
      },
      buttonCenter(node),
      { force: true }
    );
  }

  node.addEventListener('click', onClick);
  return {
    destroy() {
      node.removeEventListener('click', onClick);
    },
  };
}
