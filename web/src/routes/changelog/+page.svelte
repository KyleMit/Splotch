<script lang="ts">
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import ReleaseHistory from '$lib/components/page/ReleaseHistory.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import releases from '$lib/releases.json';

  const contents: SidebarTocItem[] = releases.map((release) => ({
    id: release.id,
    label: `Version ${release.version}`,
    meta: release.dateLabel,
    href: `#${release.id}`,
  }));

  // The release the reading position sits in, seeded to the newest so the rail
  // is never blank at the top of the page.
  let activeRelease = $state(releases[0].id);

  // Plain ref would do for the observer, but the effect below has to start once
  // the history is in the document.
  let historyEl = $state<HTMLElement>();

  // A release becomes the current one once it has climbed into the top third of
  // the viewport; while it is still below that line the reader is reading the
  // one above it.
  const SPY_ROOT_MARGIN = '0px 0px -70% 0px';

  $effect(() => {
    const host = historyEl;
    if (!host) return;
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        // Releases run newest first, so the last one in the band is the one
        // being scrolled into. An empty band means the reader is between two
        // releases — hold the last reading rather than blanking the rail.
        const current = releases.findLast((release) => inBand.has(release.id));
        if (current) activeRelease = current.id;
      },
      { rootMargin: SPY_ROOT_MARGIN }
    );
    for (const article of host.querySelectorAll('.release')) observer.observe(article);
    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Changelog · Splotch</title>
  <meta
    name="description"
    content="The complete Splotch changelog, with notes for every public release."
  />
</svelte:head>

<div class="changelog">
  <PageShell title="Changelog" wordmark="Splotch">
    {#snippet lede()}
      Every public Splotch release, newest first, with the notes that shipped alongside it.
    {/snippet}

    <div class="changelog-body">
      <div class="contents-rail">
        <RuleLabel>Contents</RuleLabel>
        <SidebarToc items={contents} active={activeRelease} label="Changelog contents" />
      </div>

      <!-- Narrow screens get the same anchors behind one row, so the newest
           release clears the fold instead of sitting under a wall of contents.
           Closed on every load: a reader who opened it once should still land
           on the newest release next visit. -->
      <Disclosure class="contents-disclosure">
        {#snippet summary()}
          <span class="contents-eyebrow">Contents</span>
          <span class="contents-count">{releases.length} releases</span>
        {/snippet}
        <div class="contents-open">
          <SidebarToc items={contents} active={activeRelease} label="Changelog contents" />
        </div>
      </Disclosure>

      <div class="releases" bind:this={historyEl}>
        <ReleaseHistory />
      </div>
    </div>
  </PageShell>
</div>

<style>
  .changelog-body {
    /* Both off the spacing scale on purpose: the rail is the width that holds
       "Version 1.4.0" over its date without wrapping at --font-size-sm, and the
       gutter is what leaves the notes beside it inside --page-measure. */
    --rail-width: 232px;
    --rail-gutter: 56px;

    display: grid;
    grid-template-columns: var(--rail-width) minmax(0, 1fr);
    gap: var(--rail-gutter);
    align-items: start;
  }

  /* The contents leaves the reading column entirely, so "where am I / what else
     is there" is answerable at any scroll depth rather than only at the top. */
  .contents-rail {
    position: sticky;
    top: var(--space-6);
  }

  /* The label's default padding is tuned for a full-width band. */
  .contents-rail :global(.rule-label) {
    padding-bottom: var(--space-4);
  }

  /* The two treatments are the same anchors; only one is ever laid out, so
     neither the accessibility tree nor a scan ever sees both. */
  .changelog-body :global(.contents-disclosure) {
    display: none;
  }

  .changelog-body :global(.contents-disclosure summary) {
    gap: var(--space-2);
    /* The whole row is the tap target. */
    min-height: 48px;
    padding: var(--space-3) var(--space-4);
  }

  .changelog-body :global(.contents-disclosure summary::after) {
    color: var(--page-link);
    font-weight: var(--font-weight-bold);
  }

  .contents-eyebrow {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  /* Takes the row's free space so the count and the chevron read as one pair
     against the right edge. */
  .contents-count {
    margin-left: auto;
    color: var(--page-link);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .contents-open {
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  /* Clears the sticky rail's top edge when a jump parks a heading. */
  .changelog :global(.release) {
    scroll-margin-top: var(--space-6);
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

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .changelog-body :global(.contents-disclosure:hover) {
      border-color: var(--page-link);
    }
  }

  /* A 232px rail beside a fluid sheet squeezes the notes, so the whole tablet
     and phone range takes the disclosure instead — the same breakpoint the
     shell drops its fixed sheet width at. */
  @media (max-width: 920px) {
    .changelog-body {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }

    .contents-rail {
      display: none;
    }

    .changelog-body :global(.contents-disclosure) {
      display: block;
    }
  }

  @media (max-width: 420px) {
    .changelog :global(.release-header) {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
