<script lang="ts">
  import { onMount } from 'svelte';
  import AssetSections from '$lib/components/styleguide/AssetSections.svelte';
  import ChromeSections from '$lib/components/styleguide/ChromeSections.svelte';
  import ColorSections from '$lib/components/styleguide/ColorSections.svelte';
  import PrimitiveSections from '$lib/components/styleguide/PrimitiveSections.svelte';
  import RecipeSections from '$lib/components/styleguide/RecipeSections.svelte';
  import ScaleSections from '$lib/components/styleguide/ScaleSections.svelte';
  import TypeSections from '$lib/components/styleguide/TypeSections.svelte';
  import VoiceSections from '$lib/components/styleguide/VoiceSections.svelte';
  import BrandMark from '$lib/components/page/BrandMark.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import { applyTheme, type ResolvedTheme } from '$lib/theme';

  // The header toggle is binary Light/Dark — the 3-way choice (with System)
  // stays with the app Settings, which owns the stored preference. This one
  // restamps data-theme ephemerally for preview only; the drawing page
  // re-applies the parent's real preference on mount.
  function appliedTheme(): ResolvedTheme {
    const stamped = document.documentElement.dataset.theme;
    if (stamped === 'light' || stamped === 'dark') return stamped;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Starts on the SSR value and adopts the applied theme (stamped data-theme,
  // else the OS preference) only after mount: an init-time mismatch would be
  // invisible where it matters — hydration doesn't repair attributes, so the
  // server-rendered aria-checked would stick until the next state change
  // (design.spec.ts covers the dark-scheme first load).
  let theme = $state<ResolvedTheme>('light');

  onMount(() => {
    theme = appliedTheme();
  });

  function setTheme(next: ResolvedTheme) {
    theme = next;
    applyTheme(next);
  }

  const themeOptions: SegmentedPickerOption<ResolvedTheme>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
  ];

  const sections = [
    { id: 'color', label: 'Color', part: 'foundations' },
    { id: 'palette', label: 'Crayon palette', part: 'foundations' },
    { id: 'paper', label: 'Paper', part: 'foundations' },
    { id: 'type', label: 'Type scale', part: 'foundations' },
    { id: 'space', label: 'Spacing & radius', part: 'foundations' },
    { id: 'elevation', label: 'Elevation', part: 'foundations' },
    { id: 'motion', label: 'Motion', part: 'foundations' },
    { id: 'stacking', label: 'Stacking', part: 'foundations' },
    { id: 'icons', label: 'Icons', part: 'foundations' },
    { id: 'recipes', label: 'Recipes', part: 'foundations' },
    { id: 'primitives', label: 'Primitives', part: 'components' },
    { id: 'furniture', label: 'Settings furniture', part: 'components' },
    { id: 'chrome', label: 'Chrome classes', part: 'components' },
    { id: 'named', label: 'Named chrome', part: 'components' },
    { id: 'voice', label: 'Voice & copy', part: 'brand' },
    { id: 'mascot', label: 'Mascot & wordmark', part: 'brand' },
  ] as const;

  type SectionId = (typeof sections)[number]['id'];

  const PART_LABELS = {
    foundations: 'Foundations',
    components: 'Components & chrome',
    brand: 'Brand & voice',
  } as const satisfies Record<(typeof sections)[number]['part'], string>;

  // The sidebar is the shared guide-rail table of contents; every item names
  // its part and the component opens each run with that heading.
  const tocItems: SidebarTocItem<SectionId>[] = sections.map((section) => ({
    id: section.id,
    label: section.label,
    href: `#${section.id}`,
    group: PART_LABELS[section.part],
  }));

  let active = $state<SectionId>('color');
  // Whether any section has crossed the line yet. The collapsed contents row
  // names what the page holds until then and the section being read after — so
  // it is derived apart from `active`, which is seeded and can't say "the hero".
  let entered = $state(false);
  // Plain element ref: only the scrollspy handler reads it, nothing reacts.
  let siteHeader: HTMLElement | undefined;

  // How far under the sticky header a heading may sit and still count as the
  // one being read. Deeper than the clearance TocDisclosure parks a jumped-to
  // heading at, so arriving from the contents marks the section it landed on.
  const SPY_BAND_PX = 56;

  $effect(() => {
    // Anchor jumps glide instead of teleporting. Stamped on <html>
    // imperatively rather than via :global(html) CSS, which would leak past
    // this page once its chunk loads.
    const root = document.documentElement;
    root.style.scrollBehavior = 'smooth';

    // rAF-throttled scrollspy; the handle is intentionally untracked.
    let raf = 0;
    const spy = () => {
      raf = 0;
      // Measured rather than declared: the header is a row taller below the
      // 980px breakpoint, where it carries the contents row as well.
      const line = (siteHeader?.getBoundingClientRect().bottom ?? 0) + SPY_BAND_PX;
      let next: SectionId = sections[0].id;
      let crossed = false;
      for (const { id } of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) {
          next = id;
          crossed = true;
        }
      }
      active = next;
      entered = crossed;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      root.style.scrollBehavior = '';
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  });
</script>

<svelte:head>
  <title>Splotch design system</title>
  <meta
    name="description"
    content="The Splotch visual language — tokens, components, and voice — rendered live from the app's own sources."
  />
</svelte:head>

<div class="page">
  <header class="site-header" bind:this={siteHeader}>
    <div class="header-row">
      <div class="header-left">
        <div class="theme-toggle">
          <SegmentedPicker
            label="Theme"
            fill={false}
            options={themeOptions}
            selected={theme}
            onSelect={setTheme}
          />
        </div>
        <span class="header-label">Design system</span>
      </div>
      <a class="header-brand" href="#top" aria-label="Back to top">
        <BrandMark wordmark="Splotch" />
      </a>
    </div>
    <!-- The second row of the sticky header, so the contents needs no offset of
         its own: it is already inside the block that pins. -->
    <TocDisclosure
      class="header-toc"
      items={tocItems}
      {active}
      showCount={!entered}
      label="Contents"
      noun="sections"
    />
  </header>

  <div class="shell" id="top">
    <div class="toc">
      <a class="back" href="/">← Back to drawing</a>
      <SidebarToc items={tocItems} {active} label="Contents" />
    </div>

    <main class="styleguide">
      <div class="hero">
        <a class="back mobile-back" href="/">← Back to drawing</a>
        <h1>Splotch design system</h1>
        <p class="lede">
          The visual language, rendered live from its sources. If it's not on this page, it's not
          part of the visual language.
        </p>
        <p class="sources">
          Sources: <code>lib/design/tokens.ts</code> → <code>tokens.css</code>
          (<code>npm run gen:tokens</code>) · <code>lib/palette.ts</code> · the icon set · the shipped
          components
        </p>
      </div>

      <aside class="defaults" aria-label="Default choices">
        <h2>Not sure? Start here</h2>
        <p>
          Most styling decisions should never reach the tables below. A card is
          <code>--surface</code> with a <code>--border</code> hairline, <code>--radius-lg</code>
          corners, and <code>--space-4</code> padding. UI chrome is <code>--font-size-sm</code>,
          prose is <code>--font-size-md</code>, both in <code>--text</code>; headings are
          <code>--text-strong</code> at <code>--font-weight-bold</code>; a title is
          <code>--font-size-xl</code> unless it heads a whole page. The primary action is the
          <code>Button</code> primitive's <code>brand</code> variant. Transitions run
          <code>--duration-base</code>; anything that pops in takes <code>--ease-pop</code>. Reach
          past a default only when its rule below says so.
        </p>
      </aside>

      <div class="part-divider" id="foundations">
        <span class="eyebrow">Part 1</span>
        <h2>Foundations</h2>
        <p>
          The vocabulary every style is built from. Consume these by reference (<code>var(--…)</code
          >, imports), never by copied value.
        </p>
      </div>
      <ColorSections {theme} />
      <AssetSections group="materials" />
      <TypeSections />
      <ScaleSections />
      <AssetSections group="icons" />
      <RecipeSections />

      <div class="part-divider" id="components">
        <span class="eyebrow">Part 2</span>
        <h2>Components &amp; chrome</h2>
        <p>
          The shared building blocks: the primitives in <code>lib/components/design/</code>, the
          settings furniture, and the global chrome classes in <code>app.css</code> — plus a named index
          of the deliberately bespoke chrome.
        </p>
      </div>
      <PrimitiveSections />
      <ChromeSections />

      <div class="part-divider" id="brand">
        <span class="eyebrow">Part 3</span>
        <h2>Brand &amp; voice</h2>
        <p>How Splotch sounds and signs its name — the copy rules and the brand marks.</p>
      </div>
      <VoiceSections />

      <footer>
        <span>
          Rendered live from <code>tokens.ts</code> · <code>palette.ts</code> · the icon set. If it's
          not here, it's not part of the language.
        </span>
        <a class="back-to-top" href="#top">Back to top ↑</a>
      </footer>
    </main>
  </div>
</div>

<style>
  /* Page-local layout constants (from the design handoff): 980px is the one
     wide/narrow breakpoint, and the shell runs to 1200px with a 216px sidebar
     and an 820px content column. */

  .page {
    /* Where a jumped-to heading parks: clear of the sticky header, plus air.
       Declared here rather than in each section component — the value has to
       agree with this page's chrome, and this route is what owns that. */
    --heading-park: 96px;

    /* The shallowest the scrollspy's line ever sits: the header alone, at the
       wide breakpoint, plus its arrival band. Reserving against the shallowest
       is what makes the tail below sufficient at every width. */
    --spy-shallowest-line: 140px;
    /* Room that already exists past the last section and counts toward its
       reserve. The shell's own bottom padding only — the footer's height varies
       with wrapping, and undercounting is the safe direction to be wrong in. */
    --shell-tail: 80px;

    min-height: 100vh;
    background: var(--app-bg);
    color: var(--text-strong);
    font-size: var(--font-size-md);
    line-height: 1.62;
    text-wrap: pretty;
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* Single-digit on purpose (the token lint bans raw multi-digit z-index):
     nothing in the content column stacks above the root context, so one step
     over the transformed specimens is enough. */
  .site-header {
    position: sticky;
    top: 0;
    z-index: 9;
    background: var(--surface);
    border-bottom: var(--border-width) solid var(--border);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  }

  .header-row {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 10px clamp(16px, 4vw, 28px);
    min-height: 44px;
  }

  .header-left {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .header-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The primitive's segment skin, re-shaped into the header's pill track. */
  .theme-toggle :global(.picker.segment.md) {
    border-radius: var(--radius-pill);
  }

  /* 44px, not the prototype's 32px: nothing interactive goes below the
     design system's touch-target floor, headers included. */
  .theme-toggle :global(.picker.segment.md .option) {
    border-radius: var(--radius-pill);
    min-height: 44px;
    padding: 6px var(--space-3);
  }

  .header-brand {
    flex-shrink: 0;
    text-decoration: none;
  }

  /* Lines the contents row up on the header's own gutter and measure. */
  .site-header :global(.header-toc) {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 28px) 10px;
  }

  .shell {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 40px;
    padding: 0 clamp(16px, 4vw, 28px) var(--shell-tail);
  }

  .toc {
    display: none;
    position: sticky;
    top: 88px;
    width: 216px;
    flex-shrink: 0;
    max-height: calc(100vh - 112px);
    overflow-y: auto;
    padding: 28px 0 24px;
  }

  .back {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--brand-text);
    text-decoration: none;
    margin-bottom: var(--space-5);
  }

  .styleguide {
    flex: 1;
    min-width: 0;
    max-width: 820px;
  }

  /* A scrollspy keyed on "the heading's top has crossed the line" cannot promote
     a section with less below it than a scrollport: the scroll clamps while the
     last headings are still under the line, so they can never be read out and
     picking one from the contents names a different section on arrival.
     Reserving a scrollport's worth from the last section's top is what lets it —
     and every section above it — climb to the line; min-height adds nothing once
     a section's own content is that tall. */
  .styleguide :global([data-sg-section]) {
    scroll-margin-top: var(--heading-park);
  }

  .styleguide :global(section[data-sg-section]:last-of-type) {
    min-height: calc(100dvh - var(--spy-shallowest-line) - var(--shell-tail));
  }

  .hero {
    padding: 40px 0 var(--space-2);
  }

  .mobile-back {
    display: block;
    margin-bottom: 14px;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-bold);
    line-height: 1.08;
    letter-spacing: -0.015em;
    color: var(--text-strong);
    text-wrap: balance;
  }

  .lede {
    margin: 14px 0 0;
    max-width: 62ch;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--text);
  }

  .sources {
    margin: 10px 0 0;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .defaults {
    margin-top: var(--space-6);
    padding: 18px 22px;
    background: var(--brand-wash);
    border-radius: var(--radius-lg);
  }

  .defaults h2 {
    margin: 0 0 var(--space-2);
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .defaults p {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--text);
  }

  .part-divider {
    margin-top: 56px;
    padding-bottom: var(--space-2);
    border-bottom: var(--border-width) solid var(--border);
  }

  .eyebrow {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brand-text);
  }

  .part-divider h2 {
    margin: 2px 0 6px;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  .part-divider p {
    margin: 0 0 var(--space-2);
    max-width: 62ch;
    font-size: var(--font-size-sm);
    color: var(--text);
  }

  footer {
    margin-top: 64px;
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--border);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .back-to-top {
    color: var(--brand-text);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
  }

  /* Below the breakpoint the header carries the contents row too, so a heading
     has a row more chrome to clear. */
  @media (max-width: 979px) {
    .page {
      --heading-park: 160px;
    }
  }

  @media (min-width: 980px) {
    .site-header :global(.header-toc) {
      display: none;
    }

    .toc {
      display: block;
    }

    .mobile-back {
      display: none;
    }
  }
</style>
