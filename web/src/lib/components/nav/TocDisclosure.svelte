<script lang="ts" generics="Id extends string">
  import { tick } from 'svelte';
  import { pushState } from '$app/navigation';
  import Disclosure from '../design/Disclosure.svelte';
  import SidebarToc, { type SidebarTocItem } from './SidebarToc.svelte';

  // The narrow-screen stand-in for the SidebarToc rail, shared by /design,
  // /changelog and /privacy: one sticky row whose collapsed state doubles as the scrollspy
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

  let open = $state(false);
  let row = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let panelMaxHeight = $state('');

  const readout = $derived(
    showCount ? `${items.length} ${noun}` : (items.find((item) => item.id === active)?.label ?? '')
  );

  // A sticky element taller than its scrollport can never be scrolled to its
  // own bottom — the pin outlives the scroll — so the panel takes the room left
  // under the row and scrolls inside itself.
  //
  // The cap is taken from the panel's own top edge as it opens, and again on
  // resize, so it always fits the viewport it was opened in. It is deliberately
  // not recomputed on scroll: that would re-lay-out the panel under a reader
  // mid-flick to win back room they can already reach by scrolling it. The cost
  // is that a panel opened before its block has pinned keeps the shorter cap it
  // was opened with, and sits above unused viewport once the block does pin.
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
  //
  // The <details> toggles natively, so before this listener exists a pick gets
  // the browser's own jump and lands a panel-height short. Accepted rather than
  // fixed: it takes an open-and-click inside the hydration window, and the
  // alternative is making the row's disclosure wait on JS.
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
    void jumpTo(href);
  }

  // Only the timing is taken off the anchor, never the navigation: the row sits
  // in the flow above every section it links to, so the panel's height has to
  // leave the document before a jump means anything — the browser computes the
  // target's position at click time and lands a full panel-height short.
  async function jumpTo(href: string) {
    // Focus moves to the summary before the panel leaves the flow. The
    // activated row is inside the collapsing panel, and a collapse that hides
    // the focused element hands focus to <body> on the browser's own schedule —
    // asynchronously, so a re-focus placed after the collapse can be undone
    // under load, dropping a keyboard user out of the tab order at the moment
    // they navigate. Handing focus over first means the panel never hides a
    // focused element. preventScroll keeps the handoff from scrolling before
    // the jump below is measured.
    row?.querySelector('summary')?.focus({ preventScroll: true });
    open = false;
    await tick();
    // Putting the fragment in the URL and in session history is what makes a
    // narrow-screen pick as shareable, and as reversible with Back, as the
    // anchor the wide rail hands the browser. pushState rather than assigning
    // location.hash: a fragment navigation runs the browser's focusing steps
    // for the target, and a plain section is not focusable, so the browser
    // moves focus to <body> — on its own schedule, which can land after the
    // handoff above and undo it. pushState records the same history entry with
    // no navigation, leaving this function the only thing touching focus.
    // Guarded so re-picking the current section doesn't stack a Back-trapping
    // duplicate entry; the scroll below still takes the reader there.
    if (window.location.hash !== href) pushState(href, {});
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
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
    /* The list outruns the panel wherever the viewport is short — a landscape
       phone hides two thirds of it — and a row clipped mid-height leaves the
       panel looking finished, since touch scrollbars don't paint until the flick
       starts. That is the same hard cut this row replaced on the chip strip, so
       it does not get to come back here. The two `scroll` shades pin to the
       scrollport's edges while the two `local` covers scroll with the list and
       mask whichever end is at rest, so each shade shows only while there is
       more list that way — and it needs no scroll listener. Same idiom, for the
       same reason, as WideShell's settings nav column; ScrollCue is the wrong
       primitive for a column scrolled from both ends, speaking as it does only
       for the bottom. */
    background:
      linear-gradient(var(--surface) 40%, transparent) top / 100% 24px no-repeat local,
      linear-gradient(transparent, var(--surface) 60%) bottom / 100% 24px no-repeat local,
      linear-gradient(var(--border), transparent) top / 100% 9px no-repeat scroll,
      linear-gradient(transparent, var(--border)) bottom / 100% 9px no-repeat scroll;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .toc-disclosure :global(.toc-shell:hover) {
      border-color: var(--page-link, var(--brand-text));
    }
  }
</style>
