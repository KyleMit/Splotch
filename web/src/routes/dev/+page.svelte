<script lang="ts">
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { DEV_HARNESSES } from './dev-harnesses';

  // Index of the dev-only harnesses under routes/dev/*. It sits behind the same
  // gate as the harnesses themselves, so it never ships to real users (an
  // ungated index would be a real route advertising them).
</script>

<svelte:head>
  <title>Dev harnesses · Splotch</title>
</svelte:head>

<PageShell title="Dev harnesses" wordmark="Splotch dev">
  {#snippet lede()}
    Development-only pages for working on the app, unlocked under <code>vite dev</code> or with
    <code>PUBLIC_ENABLE_DEV_HARNESS=true</code>. They 404 in production.
  {/snippet}

  <RuleLabel>Harnesses</RuleLabel>

  <ul class="harnesses">
    {#each DEV_HARNESSES as harness (harness.href)}
      <li>
        <a href={harness.href}>{harness.name}</a>
        <code>{harness.href}</code>
        <p class="blurb">{harness.blurb}</p>
      </li>
    {/each}
  </ul>

  <p class="elsewhere">
    Not a harness: the design-system styleguide is public at <a href="/design">/design</a>.
  </p>
</PageShell>

<style>
  /* Everything colored here reads PageShell's --page-* palette, so the index
     follows the parent's night-mode preference like every other page. */

  .harnesses {
    max-width: var(--page-measure);
    margin: 0 0 var(--space-8);
    padding: 0;
    list-style: none;
  }

  /* Name and path share the first line, blurb runs under both. */
  .harnesses li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3) 0;
  }

  .harnesses li + li {
    border-top: var(--border-width) solid var(--page-rule);
  }

  .blurb {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--page-body);
    font-size: var(--font-size-sm);
  }

  .elsewhere {
    margin: 0;
    max-width: var(--page-measure);
    color: var(--page-muted);
    font-size: var(--font-size-sm);
  }

  a {
    color: var(--page-link);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--page-muted);
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. The entries rest without an
     underline, so its arrival is the hover signal — the themed link ramp has no
     deeper shade to move to. */
  @media (hover: hover) {
    a:hover {
      text-decoration: underline;
    }
  }
</style>
