<script lang="ts">
  import type { Snippet } from 'svelte';

  // Design-system status-message primitive (ADR-0071): the wash-filled banner a
  // form shows after a submit resolves. Render it only when there is a message
  // — an empty one would still announce itself to a screen reader.
  //
  // Errors take role="alert" (interrupt) while successes take role="status"
  // (queue behind whatever is speaking).
  interface Props {
    status: 'success' | 'error';
    children: Snippet;
  }

  let { status, children }: Props = $props();
</script>

<p
  class="status-message"
  class:error={status === 'error'}
  class:success={status === 'success'}
  role={status === 'error' ? 'alert' : 'status'}
  aria-live={status === 'error' ? 'assertive' : 'polite'}
>
  {@render children()}
</p>

<style>
  .status-message {
    margin: var(--space-3) 0 0 0;
    padding: 10px var(--space-3);
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
</style>
