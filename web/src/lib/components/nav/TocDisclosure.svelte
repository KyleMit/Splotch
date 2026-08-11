<script lang="ts" generics="Id extends string">
  import { tick } from 'svelte';
  import Disclosure from '../design/Disclosure.svelte';
  import SidebarToc, { type SidebarTocItem } from './SidebarToc.svelte';

  // The narrow-screen stand-in for the SidebarToc rail, shared by /design and
  // /changelog: one sticky row whose collapsed state doubles as the scrollspy
  // readout. It states what the page holds while the reader is still above the
  // first section, and names the section they are in once they are inside one.
  // Opened, it shows the same rail the wide layout uses — same rows, groups and
  // active treatment — so neither surface carries a second table of contents.
  interface Props {
    items: readonly SidebarTocItem<Id>[];
    /** The scrollspied section — the same value the wide rail is given. */
    active: Id;
    /**
     * True while the reader is still above the first section, where "what's
     * here" is the useful fact and "where am I" has no answer yet. Derived by
     * the host separately from `active`, never modelled as an absent `active`:
     * the rail seeds that so it is never blank, and a null there would blank
     * the rail to feed this row.
     */
    showCount: boolean;
    /** Accessible name for the panel's <nav>. */
    label: string;
    /** Plural noun the count is counted in — "sections", "releases". */
    noun: string;
    /**
     * Sticky offset, as a CSS length. Omitted where the host's own chrome is
     * the sticky block this row rides inside (/design's header).
     */
    stickyTop?: string;
    /** The host's breakpoint switch between this row and its rail. */
    class?: string;
  }

  let { items, active, showCount, label, noun, stickyTop, class: className }: Props = $props();

  // Floor for the open panel, however little room the viewport leaves: a short
  // internal scroller still beats a sliver.
  const PANEL_MIN_PX = 160;
  // Breathing room between the open panel's bottom edge and the viewport's.
  const PANEL_TAIL_PX = 8;
  // Clearance between the collapsed row's bottom edge and a heading jumped to
  // from the panel — enough to also clear whatever the host pads below the row.
  const JUMP_CLEARANCE_PX = 24;

  let open = $state(false);
  let row = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let panelMaxHeight = $state('');

  const readout = $derived(
    showCount ? `${items.length} ${noun}` : (items.find((item) => item.id === active)?.label ?? '')
  );

  // A sticky element taller than its scrollport can never be scrolled to its
  // own bottom — the pin outlives the scroll — so the panel takes the room left
  // under the row and scrolls inside itself. Measured from where the panel
  // actually sits rather than from the sticky offset, which spares this
  // component the host's chrome arithmetic.
  $effect(() => {
    if (!open) return;
    const cap = () => {
      if (!panel) return;
      const room = window.innerHeight - panel.getBoundingClientRect().top - PANEL_TAIL_PX;
      panelMaxHeight = `${Math.max(PANEL_MIN_PX, room)}px`;
    };
    cap();
    window.addEventListener('resize', cap);
    return () => window.removeEventListener('resize', cap);
  });

  // Delegated rather than per-row, so the rows stay the rail's plain anchors —
  // they keep their href for the prerendered page and for open-in-new-tab —
  // while the jump itself waits for the panel to leave the flow. Attached
  // imperatively because this is delegation over real anchors, not a click
  // handler on a static element.
  $effect(() => {
    const host = panel;
    if (!host) return;
    host.addEventListener('click', onPanelClick);
    return () => host.removeEventListener('click', onPanelClick);
  });

  function onPanelClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = (event.target as Element).closest('a[href^="#"]')?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    void jumpTo(decodeURIComponent(href.slice(1)));
  }

  // Where the collapsed row's bottom edge comes to rest once the block it rides
  // in is pinned — which is not where the row is right now, since a reader at
  // the top of the page has not yet scrolled it up to its offset. Walking to the
  // sticky ancestor covers both hosts: /changelog's row is itself the sticky
  // block, /design's is the last line of a sticky header. The distance between
  // the two is layout-invariant, so it reads correctly pinned or not.
  function pinnedLine(bounds: DOMRect): number {
    for (let el: HTMLElement | null = row!; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.position !== 'sticky') continue;
      const offset = Number.parseFloat(style.top);
      if (Number.isFinite(offset)) {
        return offset + bounds.bottom - el.getBoundingClientRect().top;
      }
    }
    return bounds.bottom;
  }

  // The row sits in the flow above every section it links to, so the panel's
  // height has to leave the document before the target's position means
  // anything — measuring while open lands a full panel-height short.
  async function jumpTo(id: string) {
    open = false;
    await tick();
    const target = document.getElementById(id);
    if (!target || !row) return;
    const line = pinnedLine(row.getBoundingClientRect()) + JUMP_CLEARANCE_PX;
    window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - line });
  }
</script>

<div
  class={['toc-disclosure', stickyTop !== undefined && 'pinned', className]}
  style:top={stickyTop}
  bind:this={row}
>
  <Disclosure class="toc-shell" bind:open>
    {#snippet summary()}
      <span class="eyebrow">Contents</span>
      <span class="readout">{readout}</span>
    {/snippet}
    <div class="panel" bind:this={panel} style:max-height={panelMaxHeight}>
      <SidebarToc {items} {active} {label} />
    </div>
  </Disclosure>
</div>

<style>
  .pinned {
    position: sticky;
    /* Single-digit on purpose (the token lint bans raw multi-digit z-index):
       one step over the page's own content is all a pinned row needs. */
    z-index: 8;
  }

  /* Opaque: pinned, it has the page's content running underneath it. */
  .toc-disclosure :global(.toc-shell) {
    background: var(--surface);
  }

  .toc-disclosure :global(.toc-shell summary) {
    gap: var(--space-2);
    /* The whole row is the tap target. */
    min-height: 48px;
    padding: var(--space-3) var(--space-4);
  }

  /* PageShell renames --brand-text to --page-link inside its sheet; the
     fallback is that same token under its app-wide name, for /design, which
     wears no shell. */
  .toc-disclosure :global(.toc-shell summary::after) {
    color: var(--page-link, var(--brand-text));
    font-weight: var(--font-weight-bold);
  }

  .eyebrow {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--page-muted, var(--text-soft));
  }

  /* Takes the row's free space so the readout and the chevron read as one pair
     against the right edge, and ellipsises rather than wrapping the row open. */
  .readout {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--page-link, var(--brand-text));
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .panel {
    /* border-box is load-bearing, not tidiness: max-height is measured from the
       panel's own top edge, so under content-box this padding would be added on
       top of it and hang the panel past the bottom of the viewport. */
    box-sizing: border-box;
    padding: var(--space-2) var(--space-2) var(--space-3);
    border-top: var(--border-width) solid var(--border);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .toc-disclosure :global(.toc-shell:hover) {
      border-color: var(--page-link, var(--brand-text));
    }
  }
</style>
