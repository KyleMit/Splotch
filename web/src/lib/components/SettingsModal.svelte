<script lang="ts">
  import { untrack } from 'svelte';
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';
  import SectionIcon from './SectionIcon.svelte';
  import { ui, settingsModal } from '$lib/state/ui.svelte';
  import SectionBody from './settings/SectionBody.svelte';
  import CompactShell from './settings/CompactShell.svelte';
  import WideShell from './settings/WideShell.svelte';
  import { SECTIONS, sectionHeading, sectionSubtitle, type SectionId } from './settings/sections';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { TABLET_MIN_SIDE_PX } from '$lib/breakpoints';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';

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

  // The section the drilled-in phone view shows, and the one the wide pane parks
  // on when it opens.
  let activeSection = $derived<SectionId>(view === 'hub' ? SECTIONS[0].id : view);

  // Each reopen lands on the hub (phone) / the requested section, else the top
  // of the pane (tablet).
  $effect(() => {
    if (!settingsModal.open) return;
    // Clearing a consumed request must not rerun this open-transition effect and
    // immediately replace the requested section with the default hub.
    const requestedSection = untrack(() => ui.requestedSettingsSection);
    view = requestedSection ?? 'hub';
    ui.requestedSettingsSection = null;
  });

  function openSection(id: SectionId, trigger: HTMLElement) {
    if (id !== 'parentCenter') {
      view = id;
      return;
    }
    requireParentalGate('parentCenter', () => (view = id), buttonCenter(trigger));
  }

  function backToHub() {
    view = 'hub';
  }

  // Tier-2 accessibility (ADR-0076): let a low-vision parent pinch to enlarge the
  // reading content. The bound element gets CSS `zoom`; the phone hub/section
  // scroll binds it here and the wide pane binds its own. The compact
  // landscape-phone shell is deliberately excluded — it has no vertical room to zoom
  // into; rotate to portrait for the full zoomable settings. Zoom resets to normal
  // whenever the overlay closes and whenever the phone shell drills into another
  // section.
  let zoomTarget = $state<HTMLElement>();
  const textZoom = () => ({
    target: zoomTarget,
    enabled: settingsModal.open,
    resetKey: view,
  });

  // The phone shell's scroll region outruns the card far more often than not,
  // and a row ending flush with the card's edge reads as the end of the list.
  // A fade over the bottom strip says otherwise — but only while there is
  // something below to reach, so it never dims a list that has already ended.
  let scrollEl = $state<HTMLElement>();
  let moreBelow = $state(false);
  // Fractional scroll geometry (pinch zoom, fractional device pixels) never
  // lands exactly on the end of the range.
  const SCROLL_END_SLACK_PX = 2;
  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    const sync = () => {
      moreBelow = el.scrollHeight - el.clientHeight - el.scrollTop > SCROLL_END_SLACK_PX;
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    // The content can grow without the scroller resizing: a section reveals a
    // sub-panel, or a pinch rescales `.settings-zoom`.
    const growth = new ResizeObserver(sync);
    growth.observe(el);
    for (const child of el.children) growth.observe(child);
    return () => {
      el.removeEventListener('scroll', sync);
      growth.disconnect();
    };
  });
</script>

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
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
      <WideShell landingSection={activeSection} />
    {:else if view === 'hub'}
      <!-- Phone: top-level hub list. -->
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
      <div class="settings-scroll" bind:this={scrollEl} use:pinchTextZoom={textZoom}>
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
      <div class="settings-scroll-fade" class:visible={moreBelow} aria-hidden="true"></div>
    {:else}
      <!-- Phone: drilled into a single section, with a back arrow. -->
      <header class="settings-header settings-header-sub">
        <button class="settings-back" onclick={backToHub} aria-label="Back">
          <Icon name="chevron-left" class="settings-back-icon" />
        </button>
        <h2>{sectionHeading(activeSection)}</h2>
      </header>
      <div class="settings-scroll" bind:this={scrollEl} use:pinchTextZoom={textZoom}>
        <div class="settings-zoom" bind:this={zoomTarget}>
          <SectionBody id={activeSection} open={settingsModal.open} />
        </div>
      </div>
      <div class="settings-scroll-fade" class:visible={moreBelow} aria-hidden="true"></div>
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

  /* The scroll region's continuation cue, painted over its bottom strip and
     carried only while `moreBelow` says there is something under it. */
  .settings-scroll-fade {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: var(--space-6);
    background: linear-gradient(to top, var(--surface), transparent);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-glide);
    pointer-events: none;
  }

  .settings-scroll-fade.visible {
    opacity: 1;
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

  /* Wraps rather than ellipsizing on one line: the summary is what says what a
     section does, and the longest of them ("Choose when grown-up checks appear",
     a theme plus a rotation lock) lose that meaning mid-word at phone widths.
     Two lines is the ceiling — a third would push the row past the icon column
     it is set beside. */
  .hub-subtitle {
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  :global(.hub-chevron) {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  :global(.hub-chevron svg) {
    fill: var(--text-soft);
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
