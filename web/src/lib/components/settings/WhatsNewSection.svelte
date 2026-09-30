<script lang="ts">
  import { onMount } from 'svelte';

  // Generated at build time from releases/*.md (see tools/release/gen-release-notes.mjs).
  import releases from '$lib/releases.json';
  import CurrentReleaseNotes, { RELEASE_NOTE_SECTION_COUNT } from './CurrentReleaseNotes.svelte';
  import Icon from '../Icon.svelte';
  import type { SectionHeadingLevel } from './SectionBody.svelte';
  import '$lib/components/deferredIcons';

  // Called once the staged reveal below has no more blocks to add. A parent that
  // stages this section's own mount needs to know it keeps growing after it is
  // attached, or its idea of a complete pane is wrong by however many frames
  // that takes — WideShell's aria-busy is exactly that idea.
  //
  // Deliberately a line comment: a JSDoc block anywhere in this component's
  // props makes knip stop seeing the CurrentReleaseNotes import, and report the
  // generated file as unused (npm run lint:dead).
  //
  // sectionHeadingLevel is the level of the heading the shell puts over this
  // section. The release date sits one level under it and the release's own
  // sections one level under the date, so a screen reader's heading list files
  // the notes inside the section in either shell.
  interface Props {
    sectionHeadingLevel: SectionHeadingLevel;
    onSettled?: () => void;
  }
  let { sectionHeadingLevel, onSettled }: Props = $props();

  const RELEASE_HEADINGS = {
    2: { date: 'h3', sections: 4 },
    3: { date: 'h4', sections: 5 },
  } as const satisfies Record<SectionHeadingLevel, { date: string; sections: number }>;
  const releaseHeadings = $derived(RELEASE_HEADINGS[sectionHeadingLevel]);

  const INITIAL_RELEASE_SECTION_COUNT = 1;
  const currentRelease = releases[0];
  let visibleReleaseSections = $state(INITIAL_RELEASE_SECTION_COUNT);

  onMount(() => {
    let frame = 0;
    const revealNext = () => {
      visibleReleaseSections += 1;
      if (visibleReleaseSections < RELEASE_NOTE_SECTION_COUNT) {
        frame = requestAnimationFrame(revealNext);
        return;
      }
      frame = 0;
      onSettled?.();
    };
    if (visibleReleaseSections >= RELEASE_NOTE_SECTION_COUNT) {
      onSettled?.();
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(revealNext);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<section class="setting-group">
  {#if currentRelease}
    <div class="whats-new">
      <svelte:element this={releaseHeadings.date} class="whats-new-heading">
        <span class="whats-new-date">{currentRelease.dateLabel}</span>
      </svelte:element>
      <div class="whats-new-body">
        <CurrentReleaseNotes
          headingLevel={releaseHeadings.sections}
          visibleSections={visibleReleaseSections}
        />
      </div>
    </div>
  {/if}

  <p class="all-releases">
    <a href="/changelog">
      See all releases
      <Icon name="chevron-right" class="all-releases-icon" aria-hidden="true" />
    </a>
  </p>
</section>

<style>
  .whats-new {
    margin-bottom: 16px;
    padding: 16px;
    background: var(--surface-2);
    border-radius: var(--radius-lg);
  }

  /* The heading's level follows the shell, so every property the UA stylesheet
     varies by level is set here. */
  .whats-new-heading {
    margin: 0 0 10px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  /* Content is build-time-rendered Markdown at a level that follows the shell,
     so style every heading level it can reach. */
  .whats-new-body :global(:is(h3, h4, h5, h6)) {
    margin: 12px 0 6px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  .whats-new-body :global(:is(h3, h4, h5, h6):first-child) {
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

  .whats-new-body :global(li:last-child) {
    margin-bottom: 0;
  }

  .whats-new-body :global(a) {
    color: var(--brand-text);
  }

  .all-releases {
    margin: 4px 0 0;
    font-size: var(--font-size-sm);
  }

  .all-releases a {
    display: inline-flex;
    align-items: center;
    color: var(--brand-text);
    text-decoration: none;
    font-weight: var(--font-weight-semibold);
  }

  /* An icon, not a "→" glyph the Quicksand subsets do not carry. */
  .all-releases :global(.all-releases-icon) {
    width: 18px;
    height: 18px;
    margin-right: -4px;
  }

  .all-releases :global(.all-releases-icon svg) {
    fill: currentColor;
  }

  @media (hover: hover) {
    .all-releases a:hover {
      text-decoration: underline;
    }
  }
</style>
