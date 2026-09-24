<script lang="ts" generics="Id extends string">
  import BrandMark from '$lib/components/page/BrandMark.svelte';
  import type { SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import type { ResolvedTheme } from '$lib/theme';
  import { setTheme } from '$lib/state/settings.svelte';
  import '$lib/components/deferredIcons';

  interface Props {
    theme: ResolvedTheme;
    items: readonly SidebarTocItem<Id>[];
    active: Id;
    showCount: boolean;
    /** The root <header>, read by the host's scrollspy for its bottom edge. */
    element?: HTMLElement;
  }

  let { theme, items, active, showCount, element = $bindable() }: Props = $props();

  const themeOptions: SegmentedPickerOption<ResolvedTheme>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
  ];
</script>

<header class="site-header" bind:this={element}>
  <div class="header-row">
    <div class="header-left">
      <div class="theme-toggle">
        <SegmentedPicker
          label="Theme"
          fill={false}
          labels="collapsible"
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
  <TocDisclosure class="header-toc" {items} {active} {showCount} label="Contents" noun="sections" />
</header>

<style>
  /* Single-digit on purpose (the token lint bans raw multi-digit z-index):
     nothing in the content column stacks above the root context, so one step
     over the transformed specimens is enough. */
  .site-header {
    /* The header row's height, declared here on the ancestor both rows share
       rather than content-sized on the row: the contents row under it
       subtracts it from its panel's cap, and a custom property only inherits
       downward. It is the theme pill's 44px options inside the picker track's
       padding, plus the row's own. */
    --header-row-height: 72px;

    position: sticky;
    top: 0;
    z-index: 9;
    background: var(--surface);
    border-bottom: var(--border-width) solid var(--border);
    box-shadow: 0 1px 4px rgb(0 0 0 / 5%);
  }

  .header-row {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 10px clamp(16px, 4vw, 28px);
    height: var(--header-row-height);
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

  /* Lines the contents row up on the header's own gutter and measure. The
     header row above it is what its open panel has to leave room for. */
  .site-header :global(.header-toc) {
    --toc-row-inset: var(--header-row-height);

    max-width: 1200px;
    margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 28px) 10px;
  }

  /* "Design system" measures ~99px in this row's own type, which is what runs
     the header out of room on a phone. The words go first and the sun and moon
     carry the segments; the label only goes where even that leaves it clipped.
     Losing it costs nothing a reader needs — the H1 below and the contents row
     both name this page. */
  @media (max-width: 479px) {
    .theme-toggle :global(.option-label) {
      display: none;
    }
  }

  @media (max-width: 389px) {
    .header-label {
      display: none;
    }
  }
</style>
