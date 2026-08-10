<script lang="ts">
  import SectionIcon from '../SectionIcon.svelte';
  import SectionBody from './SectionBody.svelte';
  import ParentCenterLock from './ParentCenterLock.svelte';
  import { SECTIONS, sectionHeading, type SectionId } from './sections';
  import { settingsModal } from '$lib/state/ui.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { requireParentalGate, requiresParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';

  interface Props {
    /** Where the pane parks on each open — the deep-linked section, else the first. */
    landingSection: SectionId;
  }

  let { landingSection }: Props = $props();

  // The sidebar is a table of contents over the continuous pane: this is the
  // section the reading position currently sits in, an indicator rather than a
  // page state.
  let spiedSection = $state<SectionId>(SECTIONS[0].id);

  // The phone shell gates the drill-in, but this shell stacks every section in
  // reach of a scroll, so Parent Center's own controls stay behind a lock card
  // until the gate this open is solved (ADR-0094 puts the gate at the operation
  // boundary, and reaching these controls is that boundary).
  let parentCenterUnlocked = $state(false);
  let parentCenterRevealed = $derived(
    parentCenterUnlocked || !requiresParentalGate('parentCenter')
  );

  // How far past the pane's top edge the reading line sits. The highlight flips
  // as a heading approaches that line rather than after it has scrolled away.
  const SCROLLSPY_LINE_INSET_PX = 130;
  // Fractional device pixels and pinch-zoomed content leave scrollTop a hair
  // short of the true end, so "scrolled to the bottom" needs a tolerance.
  const SCROLL_END_EPSILON_PX = 2;
  // Where a table-of-contents jump parks the heading: just clear of the pane's
  // top edge rather than flush against it.
  const SECTION_JUMP_INSET_PX = 12;

  // Plain refs, deliberately untracked: the reopen reset reads the nav inside a
  // frame callback and the scrollspy reads the sections off events, so nothing
  // re-renders when either arrives. The pane and its zoom target are `$state`
  // because the scrollspy effect below has to start once they exist.
  let navEl: HTMLElement | undefined;
  const sectionEls: Partial<Record<SectionId, HTMLElement>> = {};
  let paneEl = $state<HTMLElement>();
  let zoomTarget = $state<HTMLElement>();

  const sectionHeadingId = (id: SectionId) => `settingsSection-${id}`;

  // The card flies in scaled from its opening button, so a rect read while that
  // animation runs is not in CSS pixels. The pane's own visual-to-layout ratio
  // converts the reading line into whatever space the current frame is in.
  function paneVisualScale(pane: HTMLElement): number {
    const height = pane.clientHeight;
    return height ? pane.getBoundingClientRect().height / height : 1;
  }

  function spiedSectionAt(pane: HTMLElement): SectionId {
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_END_EPSILON_PX) {
      return SECTIONS[SECTIONS.length - 1].id;
    }
    const line = pane.getBoundingClientRect().top + SCROLLSPY_LINE_INSET_PX * paneVisualScale(pane);
    let current: SectionId = SECTIONS[0].id;
    for (const section of SECTIONS) {
      const el = sectionEls[section.id];
      if (el && el.getBoundingClientRect().top <= line) current = section.id;
    }
    return current;
  }

  // Arithmetic on the pane's own scrollTop, never `scrollIntoView`: that method
  // scrolls *every* scrollable ancestor, and the card and the dialog are both
  // `overflow: hidden` boxes — so it dragged the Settings header and the close
  // button clean out of the top of the card. Dividing the rect delta by the
  // pane's visual scale lands the arithmetic in layout pixels, so neither the
  // fly-in's transform nor a pinch-zoomed pane skews where the jump lands.
  function scrollToSection(id: SectionId, behavior: ScrollBehavior) {
    const el = sectionEls[id];
    const pane = paneEl;
    if (!el || !pane) return;
    const offset =
      (el.getBoundingClientRect().top - pane.getBoundingClientRect().top) / paneVisualScale(pane);
    pane.scrollTo({ top: pane.scrollTop + offset - SECTION_JUMP_INSET_PX, behavior });
  }

  // The dialog is closed, never unmounted, so both the nav and the pane keep the
  // offsets the parent left them at — which would reopen with the landing
  // section highlighted while the pane still shows wherever they stopped
  // reading. A deep-linked section scrolls into place instead of swapping in.
  $effect(() => {
    if (!settingsModal.open) return;
    const landing = landingSection;
    parentCenterUnlocked = false;
    spiedSection = landing;
    // A still-closed dialog is `display: none`, so both scrollers report 0 and
    // ignore a scrollTo — and the browser then restores the offsets it kept the
    // moment the card gets a layout box. Waiting a frame is what makes the reset
    // stick rather than be overwritten.
    const frame = requestAnimationFrame(() => {
      navEl?.scrollTo({ top: 0 });
      scrollToSection(landing, 'auto');
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    const pane = paneEl;
    const content = zoomTarget;
    if (!pane || !content) return;
    let frame = 0;
    const spy = () => {
      frame = 0;
      spiedSection = spiedSectionAt(pane);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    pane.addEventListener('scroll', schedule, { passive: true });
    // A conditional reveal inside a section (volume slider, advanced controls,
    // force-landscape row, AI toggles) moves every section below it, so the spy
    // re-reads on content growth as well as on scroll.
    const growth = new ResizeObserver(schedule);
    growth.observe(content);
    return () => {
      pane.removeEventListener('scroll', schedule);
      growth.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  });

  function unlockParentCenter(trigger: HTMLElement, then?: () => void) {
    requireParentalGate(
      'parentCenter',
      () => {
        parentCenterUnlocked = true;
        then?.();
      },
      buttonCenter(trigger)
    );
  }

  function jumpToSection(id: SectionId, trigger: HTMLElement) {
    if (id !== 'parentCenter' || parentCenterRevealed) {
      scrollToSection(id, 'smooth');
      return;
    }
    unlockParentCenter(trigger, () => scrollToSection(id, 'smooth'));
  }

  // Tier-2 accessibility (ADR-0076). No `resetKey`: a table-of-contents jump
  // stays inside one continuous document, so only closing the overlay (which
  // flips `enabled`) returns the text to its normal size.
  const textZoom = () => ({ target: zoomTarget, enabled: settingsModal.open });
</script>

<!-- Tablet / desktop: table of contents + one continuously scrolling pane. -->
<div class="settings-split">
  <nav class="settings-nav" aria-label="Settings sections" bind:this={navEl}>
    {#each SECTIONS as section (section.id)}
      <button
        class="settings-nav-item"
        data-section={section.id}
        class:active={section.id === spiedSection}
        aria-current={section.id === spiedSection ? 'location' : undefined}
        onclick={(event) => jumpToSection(section.id, event.currentTarget)}
      >
        <SectionIcon icon={section.icon} class="settings-nav-icon" />
        <span>{section.label}</span>
      </button>
    {/each}
  </nav>
  <div class="settings-pane" use:pinchTextZoom={textZoom} bind:this={paneEl}>
    <div class="settings-zoom" bind:this={zoomTarget}>
      {#each SECTIONS as section (section.id)}
        <section
          class="settings-section"
          data-section={section.id}
          aria-labelledby={sectionHeadingId(section.id)}
          bind:this={sectionEls[section.id]}
        >
          <h3 class="settings-pane-title" id={sectionHeadingId(section.id)}>
            {sectionHeading(section.id)}
          </h3>
          {#if section.id === 'parentCenter' && !parentCenterRevealed}
            <ParentCenterLock onUnlock={unlockParentCenter} />
          {:else}
            <SectionBody id={section.id} open={settingsModal.open} />
          {/if}
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .settings-split {
    /* Every section is stacked in the one pane, so the whitespace and the
       headings do the separating — deliberately more air than any gap inside a
       section, and well past the --space-8 ceiling, so no divider is needed. */
    --section-gap: 60px;

    flex: 1;
    min-height: 0;
    display: flex;
    gap: 8px;
    padding: 0 24px 24px;
  }

  /* The pane is the primary scroller; the nav becomes one wherever the column
     cannot hold the full section list. That includes landscape iPad Safari once
     browser chrome reduces the available height. Contained, so scrolling past
     either end never chains out to the pane.

     The edge shades are the affordance for it, since a row clipped at a gap
     leaves the column looking finished and touch scrollbars don't paint until
     the flick starts. The two `local` covers scroll with the list and sit over
     the shade at whichever end is already at rest, so each shade appears only
     while there is more list that way — the pattern needs no scroll listener. */
  .settings-nav {
    flex-shrink: 0;
    width: 232px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    background:
      linear-gradient(var(--surface) 40%, transparent) top / 100% 24px no-repeat local,
      linear-gradient(transparent, var(--surface) 60%) bottom / 100% 24px no-repeat local,
      linear-gradient(var(--border), transparent) top / 100% 9px no-repeat scroll,
      linear-gradient(transparent, var(--border)) bottom / 100% 9px no-repeat scroll;
  }

  .settings-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    /* Tighter vertically than the hub rows: the taller icon carries most of the
       row height on its own. */
    padding: 8px 14px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-soft);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .settings-nav-item:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }

  /* The nav indicates where the reading position is, not which page is open, and
     several sections can be on screen at once — so the current one takes a soft
     brand wash with a rail rather than a solid filled pill. --brand-text on
     --brand-wash clears WCAG AA; --brand carries the rail, which holds no text. */
  .settings-nav-item.active {
    background: var(--brand-wash);
    color: var(--brand-text);
    box-shadow: inset 3px 0 0 var(--brand);
  }

  :global(.settings-nav-icon) {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
  }

  .settings-pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    /* overflow (not just -y) so a pinch-enlarged (.settings-zoom) pane scrolls sideways
       too; at rest the content is pane-width, so no horizontal bar shows. */
    overflow: auto;
    padding: 4px 8px 4px 16px;
  }

  .settings-section + .settings-section {
    margin-top: var(--section-gap);
  }

  .settings-pane-title {
    margin: 0 0 20px 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }
</style>
