<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    as?: 'h2' | 'h3' | 'h4';
    count?: number | string;
    /** The heavier tier for section heads inside Settings, where the extra
        weight helps a heading hold against the controls under it. */
    strong?: boolean;
    class?: string;
  }

  let { children, as = 'h2', count, strong = false, class: className }: Props = $props();
</script>

<svelte:element this={as} class={['rule-label', className, { strong }]}>
  <span
    >{@render children()}{#if count !== undefined}{` · ${count}`}{/if}</span
  >
</svelte:element>

<style>
  .rule-label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1.2;
    color: var(--label-ink);
  }

  .rule-label.strong {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.1em;
    color: var(--text);
  }

  .rule-label::after {
    content: '';
    flex: 1;
    height: var(--border-width);
    background: var(--border);
  }
</style>
