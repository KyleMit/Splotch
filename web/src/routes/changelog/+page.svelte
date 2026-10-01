<script lang="ts">
  import BackToTopLink from '$lib/components/page/BackToTopLink.svelte';
  import SquiggleRule from '$lib/components/design/SquiggleRule.svelte';
  import { paletteHex } from '$lib/palette';
  import { parseReleaseHue } from '$lib/releaseHues';
  import { formatReleaseAgo } from '$lib/releaseAgo';
  import { createReleaseNavigation } from '$lib/releaseNavigation';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import SocialCard from '$lib/components/page/SocialCard.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import ReleaseHistory from '$lib/components/page/ReleaseHistory.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
  import releases from '$lib/releases.json';

  const DESCRIPTION = 'The complete Splotch changelog, with notes for every public release.';

  const contents: SidebarTocItem[] = releases.map((release) => ({
    id: release.id,
    label: `Version ${release.version}`,
    meta: release.dateLabel,
    hue: parseReleaseHue(release.hue),
    href: `#${release.id}`,
  }));

  const oldestRelease = releases[releases.length - 1];

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

  let navigation = $state<ReturnType<typeof createReleaseNavigation>>();
  $effect(() => {
    if (!historyEl) return;
    const controller = createReleaseNavigation(historyEl);
    navigation = controller;
    const now = new Date();
    for (const placeholder of historyEl.querySelectorAll<HTMLElement>('[data-ago-for]')) {
      const date = placeholder.dataset.agoFor;
      if (!date) throw new Error('Missing relative release date');
      placeholder.textContent = formatReleaseAgo(date, now);
    }
    return () => controller.dispose();
  });

  $effect(() => {
    const host = historyEl;
    if (!host) return;
    const articles = [...host.querySelectorAll<HTMLElement>('.release')];
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
        const passed = articles.findLast((article) => {
          const fold = article.closest('details');
          return (
            !(fold instanceof HTMLDetailsElement && !fold.open) &&
            article.getBoundingClientRect().bottom <= 0
          );
        });
        if (current) activeRelease = current.id;
        else if (passed) activeRelease = passed.id;
      },
      { rootMargin: SPY_ROOT_MARGIN }
    );
    observer.observe(host);
    for (const article of articles) observer.observe(article);
    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Changelog · Splotch</title>
  <meta name="description" content={DESCRIPTION} />
</svelte:head>

<SocialCard path="/changelog" title="Splotch Changelog" description={DESCRIPTION} />

<div
  class="changelog"
  id="top"
  style:--spy-reserve="{SPY_BAND_BOTTOM_PERCENT}dvh"
  style:--hue-purple={paletteHex('Purple')}
  style:--hue-blue={paletteHex('Blue')}
  style:--hue-green={paletteHex('Green')}
  style:--hue-orange={paletteHex('Orange')}
  style:--hue-pink={paletteHex('Pink')}
  style:--hue-red={paletteHex('Red')}
>
  <PageShell title="Changelog">
    {#snippet lede()}
      Every public Splotch release, newest first, with the notes that
      shipped&nbsp;alongside&nbsp;it.
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
        beforeJump={(href) => navigation?.reveal(href) ?? Promise.resolve()}
        onJump={(href) => navigation?.arrive(href)}
      />

      <div class="releases" bind:this={historyEl}>
        <ReleaseHistory />
        <footer class="history-end">
          <SquiggleRule />
          <p>That's every release since {oldestRelease.dateLabel}.</p>
          <BackToTopLink />
        </footer>
      </div>
    </div>

    <!-- The cue retires at the end of the *scroll*, which here is past the end of
         the reading: `.history-end` takes a `--spy-reserve` min-height so the
         scroll spy can mark the oldest release active, and its end note fills
         little of that. So the last few hundred pixels are reserved emptiness
         under the note that the cue still reports as more-below. Accepted rather
         than worked around: the ramp paints --surface over blank --surface, so it
         is invisible across the band itself, and the only artifact is the note
         dimming as it passes under it. Anchoring the sentinel to the note instead
         would need ScrollCue to take a target, which is a wider seam than this
         buys. -->
    <ScrollCue />
  </PageShell>
</div>

<style>
  .changelog-body {
    display: grid;
    grid-template-columns: var(--page-rail-width) minmax(0, 1fr);
    gap: var(--page-rail-gutter);
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
    position: relative;
  }

  /* Above the newest release the contents row (narrow) or the hero (wide)
     already rules the column off; a hairline right under it would read as a
     double strike, as /privacy reasons for its first section. */
  .changelog :global(.release-history > .release:first-child) {
    padding-top: 0;
  }

  /* No release follows the oldest one, so without a reserve the scroll clamps
     while it is still below the spy band and it can never become the reading
     position. The reserve sits under an end note rather than inside the oldest
     release, so the page closes on a stated ending instead of a screen of
     blank sheet that reads as a failed load. */
  .history-end {
    min-height: max(0px, calc(var(--spy-reserve) - var(--page-footer-reserve)));
    padding-top: var(--space-6);
    position: relative;
    text-align: center;
  }

  .history-end p {
    color: var(--page-muted);
    font-size: var(--font-size-sm);
  }

  .changelog :global(.release-header) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .releases {
    isolation: isolate;
  }
  .changelog :global(.release > .squiggle-rule),
  .history-end :global(.squiggle-rule) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
  .changelog :global(.release > .squiggle-rule) {
    --squiggle-color: var(--release-hue);
  }
  .changelog :global(.release-history > .release:first-child > .squiggle-rule) {
    display: none;
  }
  .changelog :global(.release[data-hue='Purple']) {
    --release-hue: var(--hue-purple);
  }
  .changelog :global(.release[data-hue='Blue']) {
    --release-hue: var(--hue-blue);
  }
  .changelog :global(.release[data-hue='Green']) {
    --release-hue: var(--hue-green);
  }
  .changelog :global(.release[data-hue='Orange']) {
    --release-hue: var(--hue-orange);
  }
  .changelog :global(.release[data-hue='Pink']) {
    --release-hue: var(--hue-pink);
  }
  .changelog :global(.release[data-hue='Red']) {
    --release-hue: var(--hue-red);
  }
  .changelog :global(.release-title) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .changelog :global(.release-date) {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .changelog :global(.release-ago) {
    min-height: 1.62em;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    color: var(--page-link);
  }
  .changelog :global(.release-notes .release-section-heading),
  .changelog :global(.release-latest) {
    display: inline-flex;
    padding: 3px 14px;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--tape-ink);
    background: color-mix(in srgb, var(--section-hue) var(--tape-strength), var(--page-sheet));
    clip-path: polygon(3% 0, 100% 8%, 97% 100%, 0 90%);
    transform: rotate(var(--section-tilt));
  }
  .changelog :global(.release-latest) {
    --section-hue: var(--hue-pink);
    --section-tilt: 3deg;
    padding: 2px var(--space-3);
    font-size: var(--font-size-xs);
  }
  .changelog :global(.release-section-icon) {
    display: none;
  }
  .changelog :global([data-section='New']),
  .changelog :global([data-section='New'] + ul) {
    --section-hue: var(--hue-green);
    --section-tilt: -1.5deg;
  }
  .changelog :global([data-section='Improved']),
  .changelog :global([data-section='Improved'] + ul) {
    --section-hue: var(--hue-blue);
    --section-tilt: 1deg;
  }
  .changelog :global([data-section='Fixed']),
  .changelog :global([data-section='Fixed'] + ul) {
    --section-hue: var(--hue-orange);
    --section-tilt: -1deg;
  }
  .changelog :global(.release-notes li::before) {
    content: '';
    position: absolute;
    left: -20px;
    top: calc((1.62em - 10px) / 2);
    width: 10px;
    height: 10px;
    border-radius: var(--radius-blob-1);
    background: var(--section-hue, var(--release-hue));
  }
  .changelog :global(.release-notes li:nth-child(3n + 2)::before) {
    border-radius: var(--radius-blob-2);
  }
  .changelog :global(.release-notes li:nth-child(3n)::before) {
    border-radius: var(--radius-blob-3);
  }
  .changelog :global(.release[data-arrived])::after {
    content: '';
    position: absolute;
    inset: 16px -14px;
    border-radius: var(--radius-lg);
    background: var(--arrival-wash);
    z-index: -1;
    pointer-events: none;
    animation: release-arrive 2s ease-out 0.4s forwards;
  }
  @keyframes release-arrive {
    to {
      opacity: 0;
    }
  }
  :global(:root[data-reduce-motion]) .changelog :global(.release[data-arrived])::after {
    animation: none;
  }
  .changelog :global(.older-blob svg) {
    fill: var(--on-brand);
  }
  .changelog :global(.release-older) {
    position: relative;
    padding-top: 18px;
    text-align: center;
  }
  .changelog :global(.release-older > .squiggle-rule) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
  .changelog :global(.release-older[open] > .squiggle-rule) {
    display: none;
  }
  .changelog :global(.release-older[open]) {
    padding-top: 0;
  }
  .changelog :global(.release-older[open] > summary) {
    display: none;
  }
  .changelog :global(.release-older .release) {
    text-align: left;
  }
  .changelog :global(.release-older-toggle) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: 10px 18px;
    border-radius: var(--radius-md);
    background: var(--brand-wash);
    color: var(--brand-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    list-style: none;
  }
  .changelog :global(.release-older-toggle::-webkit-details-marker) {
    display: none;
  }
  .changelog :global(.older-blob) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: var(--brand-solid);
    color: var(--on-brand);
    border-radius: var(--radius-blob-1);
  }
  .changelog :global(.older-blob .older-icon) {
    width: 16px;
    height: 16px;
    transform: rotate(-90deg);
  }
  @media (forced-colors: active) {
    .changelog :global(.release-notes .release-section-heading),
    .changelog :global(.release-latest) {
      clip-path: none;
      transform: none;
      border: 2px solid CanvasText;
    }
    .changelog :global(.release-notes li::before),
    .changelog :global(.older-blob) {
      border: 1px solid CanvasText;
    }
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
    padding-left: 20px;
    list-style: none;
  }

  .changelog :global(.release-notes li) {
    position: relative;
    margin-bottom: var(--space-2);
  }

  /* Same reason as /privacy's last-child rule: the last item's margin would
     stack on the release padding and push the rule off centre. */
  .changelog :global(.release-notes li:last-child) {
    margin-bottom: 0;
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
      --toc-row-inset: var(--space-4);
      padding-top: var(--toc-row-inset);
      background: var(--page-sheet);
      margin-bottom: var(--space-4);
    }
  }

  @media (max-width: 420px) {
    .changelog :global(.release-date) {
      align-items: flex-start;
    }
    .changelog :global(.release-header) {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
