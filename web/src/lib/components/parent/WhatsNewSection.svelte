<script lang="ts">
  import { onMount } from 'svelte';

  // Generated at build time from releases/*.md (see scripts/generate-releases.mjs).
  import releases from '$lib/releases.json';

  // The most recent release powers the top card; the rest stack below it so the
  // section reads as a short changelog (New / Improved / Fixed per release).
  // Cards lead with the release date — version numbers are dev-facing and live
  // in GitHub releases, behind the "See all releases" link.
  const RELEASES_URL = 'https://github.com/KyleMit/Splotch/releases';
  const RECENT_RELEASE_COUNT = 5;
  const INITIAL_RELEASE_COUNT = 1;
  const recent = releases.slice(0, RECENT_RELEASE_COUNT);
  let visibleReleaseCount = $state(INITIAL_RELEASE_COUNT);
  const RELEASE_MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // Dates in releases.json are plain YYYY-MM-DD; parse the parts directly so
  // formatting never shifts a day across timezones or initializes Intl on the
  // section's first displayed frame.
  function formatReleaseDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    return `${RELEASE_MONTHS[month - 1]} ${day}, ${year}`;
  }

  onMount(() => {
    let frame = 0;
    const revealNext = () => {
      visibleReleaseCount += 1;
      if (visibleReleaseCount < recent.length) frame = requestAnimationFrame(revealNext);
    };
    // A requestAnimationFrame callback precedes paint; the second callback guarantees the
    // current release reaches the screen before older-card DOM work starts.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(revealNext);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<section class="setting-group">
  {#each recent.slice(0, visibleReleaseCount) as release (release.version)}
    <div class="whats-new">
      <h3 class="whats-new-heading">
        <span class="whats-new-date">{formatReleaseDate(release.date)}</span>
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
    border-radius: var(--radius-md);
  }

  .whats-new-heading {
    margin: 0 0 10px 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .whats-new-date {
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--text-strong);
  }

  /* Content is build-time-rendered Markdown, so style its tags globally. */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin: 12px 0 6px 0;
    font-size: var(--font-size-md);
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
    font-size: var(--font-size-md);
    color: var(--text);
    line-height: 1.5;
    margin-bottom: 4px;
  }

  .whats-new-body :global(a) {
    color: var(--brand-text);
  }

  .all-releases {
    margin: 4px 0 0 0;
    font-size: var(--font-size-sm);
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
