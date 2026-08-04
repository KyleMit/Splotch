<script lang="ts">
  import { onMount } from 'svelte';

  // Generated at build time from releases/*.md (see scripts/generate-releases.mjs).
  import releases from '$lib/releases.json';
  import CurrentReleaseNotes, { RELEASE_NOTE_SECTION_COUNT } from './CurrentReleaseNotes.svelte';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';

  // The current release stays in-app; the complete history lives behind the
  // GitHub link so opening this low-frequency section never parses older HTML.
  const RELEASES_URL = 'https://github.com/KyleMit/Splotch/releases';
  const INITIAL_RELEASE_SECTION_COUNT = 1;
  const currentRelease = releases[0];
  let visibleReleaseSections = $state(INITIAL_RELEASE_SECTION_COUNT);

  onMount(() => {
    let frame = 0;
    const revealNext = () => {
      visibleReleaseSections += 1;
      if (visibleReleaseSections < RELEASE_NOTE_SECTION_COUNT) {
        frame = requestAnimationFrame(revealNext);
      }
    };
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(revealNext);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<section class="setting-group">
  {#if currentRelease}
    <div class="whats-new">
      <h3 class="whats-new-heading">
        <span class="whats-new-date">{currentRelease.dateLabel}</span>
      </h3>
      <div class="whats-new-body">
        <CurrentReleaseNotes visibleSections={visibleReleaseSections} />
      </div>
    </div>
  {/if}

  <p class="all-releases">
    <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" use:parentalGateLink
      >See all releases →</a
    >
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
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  /* Content is build-time-rendered Markdown, so style its tags globally. */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin: 12px 0 6px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
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
    font-size: var(--font-size-sm);
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
    font-weight: var(--font-weight-semibold);
  }

  @media (hover: hover) {
    .all-releases a:hover {
      text-decoration: underline;
    }
  }
</style>
