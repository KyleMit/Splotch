<script lang="ts">
  import PageShell from '$lib/components/page/PageShell.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import ReleaseHistory from '$lib/components/page/ReleaseHistory.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
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

  // Whether the reader has reached the history at all. The collapsed contents
  // row states how many releases there are until then and names the one being
  // read after — so it is derived apart from activeRelease, which is seeded and
  // therefore can't say "nowhere yet".
  let inHistory = $state(false);

  // Plain ref would do for the observer, but the effect below has to start once
  // the history is in the document.
  let historyEl = $state<HTMLElement>();

  // A release becomes the current one once it has climbed into the top third of
  // the viewport; while it is still below that line the reader is reading the
  // one above it.
  const SPY_BAND_BOTTOM_PERCENT = 70;
  const SPY_ROOT_MARGIN = `0px 0px -${SPY_BAND_BOTTOM_PERCENT}% 0px`;

  $effect(() => {
    const host = historyEl;
    if (!host) return;
    const inBand: Record<string, boolean> = {};
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // The history as a whole, observed alongside its releases: it is in
          // the band for exactly as long as the reader is somewhere inside it,
          // which makes the answer symmetric — scrolling back to the hero
          // returns the row to the count. Reading the same thing off the newest
          // release instead would miss it, because a jump that skips a crossing
          // outright leaves that release's own state unchanged and unreported.
          // The reading holds only while the container reaches the band at the
          // bottom of the page: enough content below the history would lift its
          // bottom edge clear, and the row would revert to the count there.
          if (entry.target === host) inHistory = entry.isIntersecting;
          else inBand[entry.target.id] = entry.isIntersecting;
        }
        // Releases run newest first, so the last one in the band is the one
        // being scrolled into. An empty band means the reader is between two
        // releases — hold the last reading rather than blanking the rail.
        const current = releases.findLast((release) => inBand[release.id]);
        if (current) activeRelease = current.id;
      },
      { rootMargin: SPY_ROOT_MARGIN }
    );
    observer.observe(host);
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

<div class="changelog" style:--spy-reserve="{SPY_BAND_BOTTOM_PERCENT}dvh">
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
      <TocDisclosure
        class="contents-disclosure"
        items={contents}
        active={activeRelease}
        showCount={!inHistory}
        label="Changelog contents"
        noun="releases"
        stickyTop="0px"
      />

      <div class="releases" bind:this={historyEl}>
        <ReleaseHistory />
      </div>
    </div>

    <!-- The cue retires at the end of the *scroll*, which here is past the end of
         the reading: `.release:last-of-type` takes a `--spy-reserve` min-height so
         the scroll spy can mark the oldest release active, and its notes rarely
         fill that. So the last few hundred pixels are reserved emptiness the cue
         still reports as more-below. Accepted rather than worked around: the ramp
         paints --surface over blank --surface, so it is invisible across the band
         itself, and the only artifact is the closing lines dimming as they pass
         under it. Anchoring the sentinel to the notes instead would need ScrollCue
         to take a target, which is a wider seam than this buys. -->
    <ScrollCue />
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

  /* Where a jumped-to release parks. The disclosure computes its own jumps, so
     this is for the jumps it doesn't make: the rail's anchors and a deep link
     into the page. On wide that only has to clear the rail's top offset. */
  .changelog :global(.release) {
    scroll-margin-top: var(--release-park, var(--space-6));
    padding: var(--space-8) 0;
    border-top: var(--border-width) solid var(--page-rule);
  }

  /* Nothing follows the oldest release, so without a reserve the scroll clamps
     while it is still below the spy band and it can never become the reading
     position. A band's worth of room under its own top is exactly what it needs
     to climb in; min-height adds nothing once its notes are that long. */
  .changelog :global(.release:last-of-type) {
    min-height: var(--spy-reserve);
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

  /* A 232px rail beside a fluid sheet squeezes the notes, so the whole tablet
     and phone range takes the disclosure instead — the same breakpoint the
     shell drops its fixed sheet width at. The grid goes with it: a sticky row
     is pinned only as far as its containing block reaches, and a grid item's
     area is exactly its own height. */
  @media (max-width: 920px) {
    /* The contents row pins at --space-6 and stands ~52px tall, so a heading has
       to clear both of them plus air. The gap is asserted in changelog.spec.ts,
       which reads the row and the heading rather than this number. */
    .changelog {
      --release-park: 96px;
    }

    .changelog-body {
      display: block;
    }

    .contents-rail {
      display: none;
    }

    /* Pinned, the row needs a ground of its own — /design's rides inside the
       header and gets one for free, while this one would have the release notes
       scrolling through the gap above it. So it pins flush to the top and pads
       itself down to the rail's offset, which puts that gap inside its own box
       and under its own background. The gutters need no cover: the sheet's
       padding means nothing is laid out beside the row to show through. */
    .changelog-body :global(.contents-disclosure) {
      display: block;
      padding-top: var(--space-6);
      background: var(--page-sheet);
      margin-bottom: var(--space-6);
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
