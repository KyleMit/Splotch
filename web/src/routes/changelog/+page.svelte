<script lang="ts">
  import PageShell from '$lib/components/page/PageShell.svelte';
  import ReleaseHistory from '$lib/components/page/ReleaseHistory.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import releases from '$lib/releases.json';
</script>

<svelte:head>
  <title>Changelog · Splotch</title>
  <meta
    name="description"
    content="The complete Splotch changelog, with notes for every public release."
  />
</svelte:head>

<div class="changelog">
  <PageShell class="changelog-palette" title="Changelog" wordmark="Splotch">
    {#snippet lede()}
      Every public Splotch release, newest first, with the notes that shipped alongside it.
    {/snippet}

    <nav class="contents" aria-label="Changelog contents">
      <RuleLabel>Contents</RuleLabel>
      <ol>
        {#each releases as release (release.version)}
          <li>
            <a href={`#${release.id}`}>
              <span>Version {release.version}</span>
              <span class="contents-date">{release.dateLabel}</span>
            </a>
          </li>
        {/each}
      </ol>
    </nav>

    <ReleaseHistory />
  </PageShell>
</div>

<style>
  /* Deliberately light-only, matching /privacy. The legal and release-history
     pages use one stable reading palette in both app themes. */
  .changelog :global(.changelog-palette) {
    --page-ground: #f0efed;
    --page-sheet: #ffffff;
    --page-ink: #26262e;
    --page-body: #55555f;
    --page-muted: #6c6c76;
    --page-rule: #eeeae4;
    --page-link: #7c4dcf;
    --page-link-hover: #6b3fbf;
    --page-accent: #7c4dcf;
    --page-accent-hover: #6b3fbf;
    --page-on-accent: #ffffff;
    --page-shadow: 0 1px 2px rgba(93, 84, 68, 0.05), 0 10px 30px rgba(93, 84, 68, 0.07);
  }

  .contents {
    margin-bottom: var(--space-8);
  }

  .contents :global(.rule-label) {
    padding-bottom: var(--space-4);
  }

  .contents ol {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2) var(--space-4);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .contents a {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--border-width) solid var(--page-rule);
    border-radius: var(--radius-sm);
    color: var(--page-link);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
  }

  .contents-date {
    color: var(--page-muted);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .changelog :global(.release) {
    scroll-margin-top: var(--space-4);
    padding: var(--space-8) 0;
    border-top: var(--border-width) solid var(--page-rule);
  }

  .changelog :global(.release-header) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .changelog :global(.release-header h2) {
    margin: 0;
    color: var(--page-ink);
    font-size: var(--font-size-xl);
    line-height: 1.25;
  }

  .changelog :global(.release-header time) {
    flex-shrink: 0;
    color: var(--page-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .changelog :global(.release-notes h3) {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--page-ink);
    font-size: var(--font-size-lg);
  }

  .changelog :global(.release-notes h3:first-child) {
    margin-top: 0;
  }

  .changelog :global(.release-notes p),
  .changelog :global(.release-notes ul) {
    max-width: var(--page-measure);
    color: var(--page-body);
  }

  .changelog :global(.release-notes ul) {
    margin: 0;
    padding-left: 1.2em;
  }

  .changelog :global(.release-notes li) {
    margin-bottom: var(--space-2);
  }

  @media (hover: hover) {
    .contents a:hover {
      color: var(--page-link-hover);
      text-decoration: underline;
    }
  }

  @media (max-width: 680px) {
    .contents ol {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 420px) {
    .contents a,
    .changelog :global(.release-header) {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
