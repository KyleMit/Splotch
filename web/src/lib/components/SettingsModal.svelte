<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';
  import SectionIcon from './SectionIcon.svelte';
  import { ui, settingsModal } from '$lib/state/ui.svelte';
  import AppearanceSection from './settings/AppearanceSection.svelte';
  import SoundSection from './settings/SoundSection.svelte';
  import SavingSection from './settings/SavingSection.svelte';
  import ColoringSection from './settings/ColoringSection.svelte';
  import ControlsSection from './settings/ControlsSection.svelte';
  import AiKeyManager from './settings/AiKeyManager.svelte';
  import ParentCenterSection from './settings/ParentCenterSection.svelte';
  import ParentCenterLock from './settings/ParentCenterLock.svelte';
  import SetupInstructions from './settings/SetupInstructions.svelte';
  import WhatsNewSection from './settings/WhatsNewSection.svelte';
  import ReportForm from './settings/ReportForm.svelte';
  import AboutSection from './settings/AboutSection.svelte';
  import CompactShell from './settings/CompactShell.svelte';
  import { SECTIONS, sectionSubtitle, type SectionId, type SectionMeta } from './settings/sections';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { TABLET_MIN_SIDE_PX } from '$lib/breakpoints';
  import { requireParentalGate, requiresParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';

  // Not every section takes `open` (only AiKeyManager/SetupInstructions/ReportForm do); passing it
  // uniformly is fine — Svelte drops props a component doesn't declare — but the generated types
  // can't express that, so the map admits both prop shapes and the render site widens to the one
  // that carries `open`.
  type SectionComponent = Component<Record<string, never>> | Component<{ open?: boolean }>;

  const SECTION_CONTENT: Record<SectionId, SectionComponent> = {
    appearance: AppearanceSection,
    sound: SoundSection,
    saving: SavingSection,
    coloring: ColoringSection,
    controls: ControlsSection,
    ai: AiKeyManager,
    parentCenter: ParentCenterSection,
    setup: SetupInstructions,
    whatsnew: WhatsNewSection,
    feedback: ReportForm,
    about: AboutSection,
  };

  const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s] as const)) as Record<
    SectionId,
    SectionMeta
  >;

  // Seeds from the live viewport at construction time (before first paint) so
  // a flag that's already true on open renders its shell on the first frame —
  // no narrow-then-wide flash — then keeps itself live via a `change` listener
  // until the component is destroyed.
  function mediaQueryFlag(query: string): { readonly current: boolean } {
    let current = $state(browser ? matchMedia(query).matches : false);
    $effect(() => {
      if (typeof matchMedia === 'undefined') return;
      const mql = matchMedia(query);
      const apply = () => (current = mql.matches);
      apply();
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    });
    return {
      get current() {
        return current;
      },
    };
  }

  // Two shells, one section list (ADR-0061). Below the breakpoint it's a hub
  // that drills into a full-page section; at or above it's a persistent sidebar
  // + content pane. The choice is viewport width, so a rotate re-picks it live.
  const WIDE_QUERY = '(min-width: 700px)';
  const wide = mediaQueryFlag(WIDE_QUERY);

  // A landscape *phone* has plenty of width (so it would match WIDE_QUERY) but
  // almost no height — the full section list is unusably cramped there. Detect
  // it by orientation plus the shared tablet-class floor, and swap in a
  // stripped-down shell of quick toggles. A landscape tablet keeps its height at
  // or above that floor, so it stays on the sidebar shell untouched. The bound
  // is derived from the threshold rather than restated, so retuning the floor
  // cannot leave shell selection disagreeing with the orientation defaults.
  const COMPACT_QUERY = `(orientation: landscape) and (max-height: ${TABLET_MIN_SIDE_PX - 1}px)`;
  const compact = mediaQueryFlag(COMPACT_QUERY);

  // 'hub' = the phone top-level list; a section id = that section is drilled
  // into. Only the phone shell navigates: the wide shell stacks every section in
  // one scroll, so its sidebar moves the scroll position instead of this.
  let view = $state<'hub' | SectionId>('hub');

  // The section whose content the drilled-in phone view shows.
  let activeSection = $derived<SectionId>(view === 'hub' ? SECTIONS[0].id : view);
  let activeMeta = $derived(SECTION_BY_ID[activeSection]);

  // The wide sidebar is a table of contents over the continuous pane: this is
  // the section the reading position currently sits in, an indicator rather than
  // a page state.
  let spiedSection = $state<SectionId>(SECTIONS[0].id);

  // The phone shell gates the drill-in, but the wide shell stacks every section
  // in reach of a scroll, so Parent Center's own controls stay behind the lock
  // card until the gate this open is solved.
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

  let paneEl = $state<HTMLElement>();
  // Read only by the scrollspy and the jump, both of which run off events.
  const sectionEls: Partial<Record<SectionId, HTMLElement>> = {};

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

  // scrollIntoView rather than arithmetic on scrollTop: the browser does the
  // measurement in layout space, so neither the fly-in's transform nor a
  // pinch-zoomed pane can skew where the jump lands.
  function scrollToSection(id: SectionId, behavior: ScrollBehavior) {
    sectionEls[id]?.scrollIntoView({ behavior, block: 'start' });
  }

  // Each reopen lands on the hub (phone) / the top of the pane (tablet). The
  // dialog is closed, never unmounted, so both the nav and the pane keep the
  // offsets the parent left them at — which would reopen with the first section
  // highlighted while the pane still shows wherever they stopped reading.
  let navEl = $state<HTMLElement>();
  $effect(() => {
    if (!settingsModal.open) return;
    // Clearing a consumed request must not rerun this open-transition effect and
    // immediately replace the requested section with the default hub.
    const requestedSection = untrack(() => ui.requestedSettingsSection);
    view = requestedSection ?? 'hub';
    ui.requestedSettingsSection = null;
    parentCenterUnlocked = false;
    navEl?.scrollTo({ top: 0 });

    // A deep-linked section scrolls into place instead of swapping in. The
    // dialog has no layout until the frame after `open` flips, so the pane
    // cannot be scrolled from here.
    const landing = requestedSection ?? SECTIONS[0].id;
    spiedSection = landing;
    const frame = requestAnimationFrame(() => scrollToSection(landing, 'auto'));
    return () => cancelAnimationFrame(frame);
  });

  function openSection(id: SectionId, trigger: HTMLElement) {
    if (id !== 'parentCenter') {
      view = id;
      return;
    }
    requireParentalGate('parentCenter', () => (view = id), buttonCenter(trigger));
  }

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

  function backToHub() {
    view = 'hub';
  }

  // Tier-2 accessibility (ADR-0076): let a low-vision parent pinch to enlarge the
  // reading content. The bound element gets CSS `zoom`; both full-size scroll shells
  // (wide sidebar pane, phone hub/section scroll) bind it. The compact
  // landscape-phone shell is deliberately excluded — it has no vertical room to zoom
  // into; rotate to portrait for the full zoomable settings. Zoom resets to normal
  // whenever the overlay closes and whenever the phone shell drills into another
  // section; a wide table-of-contents jump keeps it, since that stays inside one
  // continuous document.
  let zoomTarget = $state<HTMLElement>();
  const textZoom = () => ({
    target: zoomTarget,
    enabled: settingsModal.open,
    resetKey: view,
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
</script>

{#snippet sectionContent(id: SectionId)}
  {@const Section = SECTION_CONTENT[id] as Component<{ open?: boolean }>}
  <Section open={settingsModal.open} />
{/snippet}

<dialog
  class="settings-modal modal-dialog modal-fly-in modal-shell"
  class:resizing={ui.resizingActionButtons}
  class:wide={wide.current}
  class:compact={compact.current}
  id="settingsModal"
  use:modalDialog={() => ({
    open: settingsModal.open,
    origin: settingsModal.origin,
    onRequestClose: settingsModal.hide,
  })}
>
  <div class="settings-content">
    <button class="settings-close modal-close-btn" aria-label="Close" onclick={settingsModal.hide}>
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if compact.current}
      <CompactShell />
    {:else if wide.current}
      <!-- Tablet / desktop: table of contents + one continuously scrolling pane. -->
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
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
              {@const meta = SECTION_BY_ID[section.id]}
              <section
                class="settings-section"
                data-section={section.id}
                aria-labelledby={sectionHeadingId(section.id)}
                bind:this={sectionEls[section.id]}
              >
                <h3 class="settings-pane-title" id={sectionHeadingId(section.id)}>
                  {meta.title ?? meta.label}
                </h3>
                {#if section.id === 'parentCenter' && !parentCenterRevealed}
                  <ParentCenterLock onUnlock={unlockParentCenter} />
                {:else}
                  {@render sectionContent(section.id)}
                {/if}
              </section>
            {/each}
          </div>
        </div>
      </div>
    {:else if view === 'hub'}
      <!-- Phone: top-level hub list. -->
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
      <div class="settings-scroll" use:pinchTextZoom={textZoom}>
        <div class="settings-zoom" bind:this={zoomTarget}>
          <ul class="hub-list">
            {#each SECTIONS as section (section.id)}
              <li>
                <button
                  class="hub-row"
                  data-section={section.id}
                  onclick={(event) => openSection(section.id, event.currentTarget)}
                >
                  <span class="hub-icon">
                    <SectionIcon icon={section.icon} class="hub-icon-svg" />
                  </span>
                  <span class="hub-text">
                    <span class="hub-title">{section.label}</span>
                    <span class="hub-subtitle">{sectionSubtitle(section.id)}</span>
                  </span>
                  <Icon name="chevron-right" class="hub-chevron" />
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {:else}
      <!-- Phone: drilled into a single section, with a back arrow. -->
      <header class="settings-header settings-header-sub">
        <button class="settings-back" onclick={backToHub} aria-label="Back">
          <Icon name="chevron-left" class="settings-back-icon" />
        </button>
        <h2>{activeMeta.title ?? activeMeta.label}</h2>
      </header>
      <div class="settings-scroll" use:pinchTextZoom={textZoom}>
        <div class="settings-zoom" bind:this={zoomTarget}>
          {@render sectionContent(activeSection)}
        </div>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .settings-modal {
    width: min(92vw, 500px);
    max-height: 85vh;
    overflow: hidden;
  }

  .settings-modal.wide {
    width: min(94vw, 860px);
  }

  /* Landscape phone: wider than the portrait card (width is the plentiful
     axis there) but nowhere near the tablet two-pane. */
  .settings-modal.compact {
    width: min(94vw, 640px);
  }

  /* While the parent drags the Button Size slider, the modal melts away to just
     that slider so the action buttons resize in full view behind it. The slider
     keeps its on-screen position (it stays under the finger); everything else in
     the card — heading, nav, other settings — is hidden, and the card surface
     and backdrop go transparent so the canvas and buttons show through. The
     slider still occupies its normal slot in the (now invisible) layout, so no
     repositioning gymnastics are needed. */
  .settings-modal.resizing {
    background: transparent;
    box-shadow: none;
  }

  .settings-modal.resizing::backdrop {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .settings-modal.resizing .settings-content {
    visibility: hidden;
  }

  .settings-modal.resizing :global(.button-size-setting) {
    visibility: visible;
    background: var(--surface);
    border-radius: var(--radius-lg);
    /* A tight, even lift that hugs the rounded card — not the heavy, downward
       shadow that bled into a rectangular band below the control. */
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  }

  /* The content is a flex column capped at the modal height: the header stays
     put while the hub list / section body / content pane scrolls under it. */
  .settings-content {
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    position: relative;
    overflow: hidden;
  }

  .settings-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 28px 32px 18px;
    padding-right: var(--modal-close-clearance-x);
  }

  .settings-header h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  .settings-header-sub h2 {
    font-size: var(--font-size-lg);
  }

  .settings-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin-left: -8px;
    border: none;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--brand);
    cursor: pointer;
    flex-shrink: 0;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .settings-back:hover {
      background: var(--surface-hover);
    }
  }

  .settings-back:active {
    transform: scale(0.92);
  }

  :global(.settings-back-icon) {
    width: 22px;
    height: 22px;
  }

  :global(.settings-back-icon svg) {
    fill: var(--brand);
  }

  /* Phone: the single scroll region (hub list or a section body). overflow (not
     just -y) so a pinch-enlarged (.settings-zoom) body can be scrolled sideways too;
     at rest the content is container-width, so no horizontal bar shows. */
  .settings-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 24px 28px;
  }

  /* ── Phone hub list ─────────────────────────────────────────────────────── */
  .hub-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hub-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 16px;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .hub-row:hover {
      background: var(--surface-hover);
    }
  }

  .hub-row:active {
    transform: scale(0.99);
  }

  /* Untiled: the icon takes the space the tile's padding used to. The box stays
     44px as the optical column that keeps every row's title left-aligned — it is
     layout, not a hit target (the row itself is the target). */
  .hub-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }

  :global(.hub-icon-svg) {
    width: 38px;
    height: 38px;
  }

  :global(.hub-icon .hub-icon-svg svg) {
    fill: var(--brand-text);
  }

  .hub-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .hub-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }

  .hub-subtitle {
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.hub-chevron) {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  :global(.hub-chevron svg) {
    fill: var(--text-soft);
  }

  /* ── Tablet two-pane ────────────────────────────────────────────────────── */
  .settings-split {
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

  /* Every section is stacked in the one pane, so the whitespace and the headings
     do the separating — deliberately more air than any gap inside a section, and
     well past the --space-8 ceiling, so no divider rule is needed. */
  .settings-section + .settings-section {
    margin-top: 60px;
  }

  /* Where a table-of-contents jump parks the heading: just clear of the pane's
     top edge rather than flush against it. scrollIntoView reads this. */
  .settings-section {
    scroll-margin-top: 12px;
  }

  .settings-pane-title {
    margin: 0 0 20px 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }

  /* Shared setting-card tokens for the section bodies. The sections only ever
     render inside this modal, so scoping the :global reach here keeps these
     rules in one place instead of copied into each section component. */
  .settings-content :global(.setting-group) {
    margin-bottom: 24px;
  }

  .settings-content :global(.setting-group:last-child) {
    margin-bottom: 0;
  }

  .settings-content :global(.setting-group > .setting + .setting) {
    margin-top: 6px;
  }

  .settings-content :global(.setting) {
    padding: 12px 16px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 480px) {
    .settings-header {
      padding: 24px 20px 16px;
      padding-right: var(--modal-close-clearance-x);
    }

    .settings-scroll {
      padding: 0 20px 24px;
    }
  }
</style>
