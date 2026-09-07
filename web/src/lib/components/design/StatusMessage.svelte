<script lang="ts">
  import type { Snippet } from 'svelte';

  // Design-system status-message primitive (ADR-0071): the wash-filled banner a
  // form shows after a submit resolves. Render it only when there is a message
  // — an empty one would still announce itself to a screen reader.
  //
  // Errors take role="alert" (interrupt) while successes and warnings take role="status"
  // (queue behind whatever is speaking).
  interface Props {
    status: 'success' | 'error' | 'warning';
    children: Snippet;
  }

  let { status, children }: Props = $props();
</script>

<p
  class={['status-message', status]}
  role={status === 'error' ? 'alert' : 'status'}
  aria-live={status === 'error' ? 'assertive' : 'polite'}
>
  {@render children()}
</p>

<style>
  .status-message {
    margin: var(--space-3) 0 0 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .success {
    background: var(--success-wash);
    color: var(--success-text);
  }

  .error {
    background: var(--danger-wash);
    color: var(--danger-text);
  }
  .warning {
    background: var(--warning-wash);
    color: var(--warning-text);
    border: var(--border-width) solid var(--warning-border);
    line-height: 1.45;
    font-weight: var(--font-weight-medium);
  }

  .warning :global(strong) {
    font-weight: var(--font-weight-bold);
  }

  .warning :global(code) {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: inherit;
    background: var(--warning-chip);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }
</style>
