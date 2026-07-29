<script lang="ts">
  import type { Snippet } from 'svelte';

  // A section marker for the standalone pages inside PageShell: the label
  // survives only as a small-caps word with a hairline running out to the edge.
  // A real <h2> — the sections below it carry <h3>s that would otherwise dangle
  // off the hero's <h1>.
  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<h2 class="rule-label"><span>{@render children()}</span></h2>

<style>
  .rule-label {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0;
    padding-bottom: 30px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .rule-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--page-rule);
  }
</style>
