<script lang="ts" module>
  import type { IconName } from '../icon-names';

  export interface SidebarTocItem<Id extends string = string> {
    id: Id;
    label: string;
    /** Second line under the label — the changelog's release date. */
    meta?: string;
    /** Leading spot icon — the Settings section rows. */
    icon?: IconName;
    /** Whether this item's content is new to the parent. Defined only by Settings rows. */
    unseen?: boolean;
    /** Uppercase heading the run of items sharing it opens with — /design's parts. */
    group?: string;
    /** Renders the row as an anchor; a row without one is a button that calls `onSelect`. */
    href?: string;
  }
</script>

<script lang="ts" generics="Id extends string">
  import SectionIcon from '../SectionIcon.svelte';

  // The guide-rail table of contents over one continuously scrolling document,
  // shared by the wide Settings sidebar, /design, /changelog and /privacy. A hairline
  // track runs the full list and the row holding the reading position thickens
  // and tints its own segment of it — so the highlight reads as a position in a
  // document rather than as a selection, and the track itself says the column
  // is its own scroller.
  //
  // The surfaces differ only in their data: an item with an `icon`
  // renders one, an item with `meta` gets a second line, and a run of items
  // sharing a `group` opens with a heading. There is deliberately no `variant`
  // prop — that is the drift this component exists to close.
  interface Props {
    items: readonly SidebarTocItem<Id>[];
    /** The scrollspied section. An indicator of reading position, not a page state. */
    active: Id;
    /** Accessible name for the <nav>. */
    label: string;
    /**
     * Jump handler for button rows — Settings scrolls its own pane by
     * arithmetic and unlocks Parent Center on the way. Anchor rows navigate
     * themselves and need none.
     */
    onSelect?: (id: Id, trigger: HTMLElement) => void;
  }

  let { items, active, label, onSelect }: Props = $props();

  // Consecutive items carrying the same `group` are one run under one heading,
  // so a host can label every item and never has to work out which one is
  // first. The heading breaks the track on purpose.
  const runs = $derived(
    items.reduce<{ heading?: string; items: SidebarTocItem<Id>[] }[]>((acc, item) => {
      const open = acc.at(-1);
      if (open && open.heading === item.group) open.items.push(item);
      else acc.push({ heading: item.group, items: [item] });
      return acc;
    }, [])
  );
</script>

<nav class="sidebar-toc" aria-label={label}>
  {#each runs as run, index (index)}
    {#if run.heading}
      <div class="toc-group">{run.heading}</div>
    {/if}
    <ol class="toc-list">
      {#each run.items as item (item.id)}
        {@const current = item.id === active}
        <li>
          {#if item.href}
            <a
              class="toc-row"
              class:active={current}
              class:tracks-activity={item.unseen !== undefined}
              href={item.href}
              data-section={item.id}
              aria-current={current ? 'location' : undefined}
            >
              {@render rowBody(item)}
            </a>
          {:else}
            <button
              type="button"
              class="toc-row"
              class:active={current}
              class:tracks-activity={item.unseen !== undefined}
              data-section={item.id}
              aria-current={current ? 'location' : undefined}
              onclick={(event) => onSelect?.(item.id, event.currentTarget)}
            >
              {@render rowBody(item)}
            </button>
          {/if}
        </li>
      {/each}
    </ol>
  {/each}
</nav>

{#snippet rowBody(item: SidebarTocItem)}
  {#if item.icon}
    <span class="toc-icon-wrap">
      <SectionIcon icon={item.icon} class="toc-icon" />
      {#if item.unseen !== undefined}
        <span class="section-activity-dot" class:unseen={item.unseen}></span>
      {/if}
    </span>
  {/if}
  <span class="toc-text">
    <span>{item.label}</span>
    {#if item.meta}
      <span class="toc-meta">{item.meta}</span>
    {/if}
  </span>
  {#if item.unseen}<span class="visually-hidden">new</span>{/if}
{/snippet}

<style>
  .sidebar-toc {
    /* The active row thickens its segment of the track without moving the
       label: the extra width comes back out of the row's leading padding. */
    --toc-segment-width: 3px;

    display: flex;
    flex-direction: column;
  }

  /* Outside the track — the break between groups is the point of the heading. */
  .toc-group {
    padding: 0 10px;
    margin: 18px 0 6px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-soft);
  }

  .toc-group:first-child {
    margin-top: 0;
  }

  /* No `gap`: the rows' left borders butt into one continuous track, and any
     vertical gap here breaks that line into dashes. Row padding does the
     spacing instead. */
  .toc-list {
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .toc-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    /* Tighter vertically than a settings hub row: where an icon is present it
       carries most of the row height on its own. */
    padding: 9px var(--space-4);
    border: none;
    border-left: var(--border-width) solid var(--border);
    /* The leading edge belongs to the track, so it never rounds. */
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: transparent;
    color: var(--text-soft);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    line-height: 1.3;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .toc-row:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }

  /* The rail marks a reading position, not a selection, and several sections
     can be on screen at once — so the current row takes a soft wash and a
     thickened segment rather than a solid filled pill. --brand-text on
     --brand-wash clears WCAG AA; --brand carries the segment, which holds no
     text (the 3:1 non-text floor applies). */
  .toc-row.active {
    border-left-color: var(--brand);
    border-left-width: var(--toc-segment-width);
    padding-left: calc(var(--space-4) - var(--toc-segment-width) + var(--border-width));
    background: var(--brand-wash);
    color: var(--brand-text);
  }

  .toc-row.tracks-activity.active {
    transition:
      background var(--duration-fast) ease var(--duration-base),
      color var(--duration-fast) ease var(--duration-base);
  }

  .toc-icon-wrap {
    position: relative;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
  }

  .section-activity-dot {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 2px var(--surface);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-base) var(--ease-glide);
  }

  .section-activity-dot.unseen {
    opacity: 1;
    transition-duration: 0s;
  }

  .toc-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .toc-meta {
    margin-top: 2px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .toc-row :global(.toc-icon) {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
