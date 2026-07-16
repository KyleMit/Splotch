<script lang="ts">
  // Generated at build time from releases/*.md (see scripts/generate-releases.mjs).
  import releases from '$lib/releases.json';

  // The most recent release powers the top card; the rest stack below it so the
  // section reads as a short changelog (New / Improved / Fixed per version).
  const RELEASES_URL = 'https://github.com/KyleMit/Splotch/releases';
  const recent = releases.slice(0, 5);
</script>

<section class="setting-group">
  {#each recent as release (release.version)}
    <div class="whats-new">
      <h3 class="whats-new-heading">
        <span class="whats-new-version">v{release.version}</span>
      </h3>
      <!-- eslint-disable-next-line svelte/no-at-html-tags bodyHtml is our own first-party Markdown rendered to HTML at build time -->
      <div class="whats-new-body">{@html release.bodyHtml}</div>
    </div>
  {/each}

  <p class="all-releases">
    <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">See all releases →</a>
  </p>
</section>

<style>
  .whats-new {
    margin-bottom: 16px;
    padding: 16px;
    background: var(--surface-2);
    border-radius: 12px;
  }

  .whats-new-heading {
    margin: 0 0 10px 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .whats-new-version {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-strong);
  }

  /* Content is build-time-rendered Markdown, so style its tags globally. */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin: 12px 0 6px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-strong);
  }

  .whats-new-body :global(h2:first-child),
  .whats-new-body :global(h3:first-child) {
    margin-top: 0;
  }

  .whats-new-body :global(ul) {
    margin: 0;
    padding-left: 20px;
  }

  .whats-new-body :global(li) {
    font-size: 14px;
    color: var(--text);
    line-height: 1.5;
    margin-bottom: 4px;
  }

  .whats-new-body :global(a) {
    color: var(--brand-text);
  }

  .all-releases {
    margin: 4px 0 0 0;
    font-size: 13px;
  }

  .all-releases a {
    color: var(--brand-text);
    text-decoration: none;
    font-weight: 600;
  }

  @media (hover: hover) {
    .all-releases a:hover {
      text-decoration: underline;
    }
  }
</style>
