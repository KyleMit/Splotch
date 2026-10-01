<script lang="ts">
  import { DRAWING_ROUTE } from '$lib/boot/appSurfaceRoute';
  import Button from '../design/Button.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import PageShell from './PageShell.svelte';
</script>

<svelte:head>
  <title>Page not found · Splotch</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageShell title="This page wandered off" collapsibleLede={false}>
  {#snippet lede()}The link may be old. These are still here:{/snippet}

  <div class="not-found">
    <SplotchyIcon class="not-found-mark" aria-hidden="true" />
    <ul class="not-found-links" role="list">
      <li><Button variant="brand" size="lg" href={DRAWING_ROUTE}>Start drawing</Button></li>
      <li><Button variant="wash" size="lg" href="/changelog">Changelog</Button></li>
      <li><Button variant="wash" size="lg" href="/privacy">Privacy</Button></li>
    </ul>
  </div>
</PageShell>

<style>
  .not-found {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
    padding-bottom: var(--space-8);
  }

  .not-found :global(.not-found-mark) {
    width: 80px;
    height: 80px;
    transform: rotate(-8deg);
  }

  .not-found-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (max-width: 540px) {
    .not-found-links li:first-child {
      flex-basis: 100%;
    }
  }

  @media (max-height: 500px) {
    .not-found {
      gap: var(--space-4);
    }

    .not-found :global(.not-found-mark) {
      width: 56px;
      height: 56px;
    }
  }
</style>
