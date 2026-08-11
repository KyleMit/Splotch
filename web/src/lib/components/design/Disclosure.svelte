<script lang="ts">
  import type { Snippet } from 'svelte';

  // Design-system disclosure primitive (ADR-0071): a bordered <details> panel
  // whose summary carries the '›' chevron that rotates open. It owns only what
  // every site shares — the shell, the hidden native marker, and the chevron —
  // so each caller keeps its own padding/type/color/background under the
  // forwarded `class`, which reaches these elements via `:global()`.
  interface Props {
    summary: Snippet;
    children: Snippet;
    class?: string;
    /** Bindable so a caller can close the panel itself — TocDisclosure has to
        collapse before it measures a jump. */
    open?: boolean;
  }

  let { summary, children, class: className, open = $bindable(false) }: Props = $props();
</script>

<details class={['disclosure', className]} bind:open>
  <summary>{@render summary()}</summary>
  {@render children()}
</details>

<style>
  .disclosure {
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  /* Flex is load-bearing, not cosmetic: an inline box is not transformable, so
     the chevron's rotate() no-ops unless the ::after is blockified as a flex
     item. Owning it here keeps callers from each having to blockify it. */
  .disclosure summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .disclosure summary::-webkit-details-marker {
    display: none;
  }

  .disclosure summary::after {
    content: '›';
    color: var(--text-soft);
    transition: transform var(--duration-base) ease;
  }

  .disclosure[open] summary::after {
    transform: rotate(90deg);
  }
</style>
