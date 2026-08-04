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
  }

  let { summary, children, class: className }: Props = $props();
</script>

<details class={['disclosure', className]}>
  <summary>{@render summary()}</summary>
  {@render children()}
</details>

<style>
  .disclosure {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .disclosure summary {
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
