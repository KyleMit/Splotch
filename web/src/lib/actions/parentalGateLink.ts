import { requireParentalGate } from '$lib/state/parentalGate.svelte';
import { buttonCenter } from '$lib/state/modal.svelte';

// Gate an external link at its operation boundary (ADR-0094): the click is
// intercepted and the Grown-Ups Only challenge follows Parent Center's
// external-links policy. On success the original
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
      'externalLinks',
      () => {
        approved = true;
        node.click();
      },
      buttonCenter(node),
      { immediate: true }
    );
  }

  node.addEventListener('click', onClick);
  return {
    destroy() {
      node.removeEventListener('click', onClick);
    },
  };
}
