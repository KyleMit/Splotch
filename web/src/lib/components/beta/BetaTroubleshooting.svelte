<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';

  // The collapsed panel each platform's instructions close with: a summary line
  // naming the failures a tester actually hits, and a stack of `.row` answers.
  interface Props {
    troubleSummary: Snippet;
    children: Snippet;
  }

  let { troubleSummary, children }: Props = $props();
</script>

<div class="trouble">
  <Disclosure class="beta-disclosure">
    {#snippet summary()}
      <span class="trouble-heading">
        <h3 class="trouble-label">Troubleshooting</h3>
        <span class="trouble-sub">
          {@render troubleSummary()}
        </span>
      </span>
      <span class="chev-disc">
        <Icon name="chevron-right" class="chev" aria-hidden="true" />
      </span>
    {/snippet}

    <div class="rows">{@render children()}</div>
  </Disclosure>
</div>

<style>
  .trouble {
    margin-top: 48px;
  }

  .trouble :global(.beta-disclosure) {
    border: var(--border-width) solid var(--page-rule);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    transition:
      background var(--duration-base) ease,
      border-color var(--duration-base) ease;
  }

  .trouble :global(.beta-disclosure > summary) {
    gap: 16px;
    padding: 18px 20px;
  }

  .trouble :global(.beta-disclosure > summary::after) {
    content: none;
  }

  .trouble-heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .trouble-label {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .trouble-sub {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.45;
    color: var(--page-muted);
  }

  .chev-disc {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 32px;
    height: 32px;
    border: var(--border-width) solid var(--page-rule);
    border-radius: 50%;
    background: var(--page-sheet);
  }

  .trouble :global(.chev) {
    width: 18px;
    height: 18px;
    transition: transform var(--duration-base) ease;
  }

  .trouble :global(.chev svg) {
    fill: var(--page-muted);
  }

  .trouble :global(.beta-disclosure[open] .chev) {
    transform: rotate(90deg);
  }

  .rows {
    padding: 0 20px 8px;
  }

  .rows :global(.row) {
    border-top: var(--border-width) solid var(--page-rule);
    margin-top: 20px;
    padding-top: 20px;
  }

  .rows :global(.row h4) {
    margin: 0 0 4px;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .rows :global(.row p) {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--page-body);
  }

  .rows :global(a) {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  @media (hover: hover) {
    .trouble :global(.beta-disclosure:hover) {
      background: var(--surface-hover);
      border-color: var(--border-warm-strong);
    }

    .rows :global(a:hover) {
      text-decoration-thickness: 2px;
    }
  }

  @media (max-width: 480px) {
    .trouble-sub :global(.trouble-sub-clause) {
      display: none;
    }
  }
</style>
