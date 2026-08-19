<script lang="ts">
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';
  import type { CommonIconName } from './iconTypes';
  import SectionIcon from './SectionIcon.svelte';
  import { ui, settingsModal } from '$lib/state/ui.svelte';
  import SectionBody from './settings/SectionBody.svelte';
  import CompactShell from './settings/CompactShell.svelte';
  import WideShell from './settings/WideShell.svelte';
  import ToggleSwitch from './settings/ToggleSwitch.svelte';
  import './SettingsModal.ai.css';
  import ScrollCue from './design/ScrollCue.svelte';
  import { SECTIONS, sectionHeading, sectionSubtitle, type SectionId } from './settings/sections';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { TABLET_MIN_SIDE_PX } from '$lib/breakpoints';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { settings, setSound } from '$lib/state/settings.svelte';
  import { resolvedTheme, setResolvedTheme } from '$lib/state/appearance.svelte';
  import { hasSectionActivity, markSectionSeen } from '$lib/state/sectionsSeen.svelte';

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

  // Whether the overlay was open the last time the landing effect ran.
  // Deliberately untracked: nothing renders it, and tracking it would make the
  // effect below its own dependency.
  let wasOpen = false;

  // The landing view, for both ways a section is reached. Opening Settings lands
  // on the hub (phone) / the deep-linked section, never wherever the last visit
  // stopped reading. A request can also arrive while the overlay is already open,
  // with no open transition behind it: a Grown-Ups Only challenge raised over a
  // Settings action (sending feedback, following a link out) offers its own way
  // into Parent Center. The open transition is latched rather than read from a
  // second effect so both cases stay in one place — consuming the request reruns
  // this, and without the latch that rerun would read "nothing requested, still
  // open" and bounce the parent straight back to the hub.
  $effect(() => {
    const open = settingsModal.open;
    const requestedSection = ui.requestedSettingsSection;
    const opening = open && !wasOpen;
    wasOpen = open;
    if (!open) return;
    if (requestedSection) {
      markSectionSeen(requestedSection);
      view = requestedSection;
      ui.requestedSettingsSection = null;
      return;
    }
    if (opening) view = 'hub';
  });

  function openSection(id: SectionId, trigger: HTMLElement) {
    if (id !== 'parentCenter') {
      markSectionSeen(id);
      view = id;
      return;
    }
    requireParentalGate(
      'parentCenter',
      () => {
        markSectionSeen(id);
        view = id;
      },
      buttonCenter(trigger)
    );
  }

  function backToHub() {
    view = 'hub';
  }

  // A hub row answers its section inline, with a switch beside the drill-in,
  // only where the boolean is legible from the row's own name *and* worth
  // flipping mid-session. That is these two and no others: Auto-Save is
  // set-and-forget, and "Tool Drawer" doesn't say what Advanced Controls would
  // be turning on. Night Mode is binary over the *resolved* theme — the same
  // quick toggle CompactShell and /design's header carry, with the same
  // accepted trade that flipping it while on System pins the preference; the
  // three-way choice including System stays in the Appearance section.
  interface HubToggle {
    id: string;
    label: string;
    checked: () => boolean;
    onToggle: (next: boolean) => void;
    /** Rides in the thumb where the switch has no label of its own beside it. */
    thumbIcon?: () => CommonIconName;
  }

  const HUB_TOGGLES: Partial<Record<SectionId, HubToggle>> = {
    appearance: {
      id: 'hubNightToggle',
      label: 'Night Mode',
      checked: () => resolvedTheme() === 'dark',
      onToggle: (next) => setResolvedTheme(next ? 'dark' : 'light'),
      thumbIcon: () => (resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'),
    },
    sound: {
      id: 'hubSoundToggle',
      label: 'Sound',
      checked: () => settings.soundEnabled,
      onToggle: setSound,
    },
  };

  // The switch rows cluster at the top of the list, so the first row without one
  // opens the drill-ins and takes the extra gap that reads as a group break.
  const firstDrillIn = SECTIONS.findIndex((section) => !HUB_TOGGLES[section.id]);
  const groupBreakIndex = firstDrillIn > 0 ? firstDrillIn : -1;

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
</script>

<dialog
  class="settings-modal modal-dialog modal-fly-in modal-shell {view === 'ai' ? 'ai-section' : ''}"
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
      <div class="settings-scroll" use:pinchTextZoom={textZoom}>
        <div class="settings-zoom" bind:this={zoomTarget}>
          <ul class="hub-list">
            {#each SECTIONS as section, index (section.id)}
              {@const toggle = HUB_TOGGLES[section.id]}
              {@const unseen = hasSectionActivity(section.id)}
              <li class:group-break={index === groupBreakIndex}>
                <div class="hub-tile">
                  <button
                    class="hub-row"
                    data-section={section.id}
                    onclick={(event) => openSection(section.id, event.currentTarget)}
                  >
                    <span class="hub-icon">
                      <SectionIcon icon={section.icon} class="hub-icon-svg" />
                      <span class="section-activity-dot" class:unseen></span>
                    </span>
                    <span class="hub-text">
                      <span class="hub-title">{section.label}</span>
                      <span class="hub-subtitle">{sectionSubtitle(section.id)}</span>
                    </span>
                    {#if unseen}<span class="visually-hidden">new</span>{/if}
                  </button>
                  {#if toggle}
                    <span class="hub-action">
                      <span class="hub-split"></span>
                      <ToggleSwitch
                        id={toggle.id}
                        label={toggle.label}
                        checked={toggle.checked()}
                        onToggle={toggle.onToggle}
                        thumbIcon={toggle.thumbIcon?.()}
                      />
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </div>
        <!-- Last child of the scroller, and outside the zoom target: the cue
             plants its sentinel at the end of the scrolling content, and keeps
             its own size while a pinch rescales the reading content under it. -->
        <ScrollCue />
      </div>
    {:else}
      <!-- Phone: drilled into a single section, with a back arrow. -->
      <header class="settings-header settings-header-sub">
        <button class="settings-back" onclick={backToHub} aria-label="Back">
          <Icon name="chevron-left" class="settings-back-icon" />
        </button>
        <h2>{sectionHeading(activeSection)}</h2>
      </header>
      <div class="settings-scroll" use:pinchTextZoom={textZoom}>
        <div class="settings-zoom" bind:this={zoomTarget}>
          <SectionBody id={activeSection} open={settingsModal.open} />
        </div>
        <ScrollCue />
      </div>
    {/if}
  </div>
</dialog>

<style>
  /* A closed <dialog> is display: none by UA rule, which would leave the
     prewarmed pane's first style and layout unpaid until showModal() — the
     dominant share of a first-open long task that measured ~2× a reopen's
     under 4× CPU throttle. Keeping the closed card laid out but invisible
     pays that at idle instead: visibility excludes it from paint, hit
     testing, focus, and the accessibility tree, and the box matches the open
     state's (same fixed centering), so the open edge reuses it all. Opacity
     was measured as the hiding mechanism and rejected: WebKit keeps painting
     inside an opacity-0 card, which moved the paint bill to the idle prewarm
     slices and the close edge on the physical iPad, and bought the open edge
     ~3 ms. The paint the card still owes on opening is staged instead — see
     WideShell's presentation watermark. npm run perf:web:settings scores
     first open against reopen to keep the residual visible. */
  .settings-modal:not([open]) {
    display: block;
    visibility: hidden;
  }

  .settings-modal {
    --card-height-cap: 85vh;

    /* Where 85vh outruns the content: enough height for the wide shell's
       sidebar to show its whole section list (through About — header + rows +
       pane padding measured ~670px at the large-tablet type step) with a
       little air, and no more. Past that, extra height is just empty pane
       below the reading content. settings-mount.spec.ts holds this ceiling to
       the sidebar still fitting whole, so a new section fails the spec rather
       than silently clipping the list. */
    --wide-card-height-ceiling: 720px;

    width: min(92vw, 500px);
    max-height: var(--card-height-cap);
    overflow: hidden;
  }

  .settings-modal.wide {
    width: min(94vw, 860px);
  }

  /* The wide pane stacks all eleven sections, so its settled content overflows
     both height bounds on every viewport that selects this shell — the settled
     card height is always this min(). Claiming it up front keeps the card from
     ratcheting taller as the fill mounts each section behind the fly-in. Scoped
     off the compact landscape-phone shell, whose short quick-toggle card stays
     content-sized (and whose selector must also keep winning the width rules
     above on equal specificity). */
  .settings-modal.wide:not(.compact) {
    height: min(var(--card-height-cap), var(--wide-card-height-ceiling));
  }

  .settings-modal.wide:not(.compact) .settings-content {
    height: 100%;
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
    max-height: var(--card-height-cap);
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

  /* The two switch rows lead the list; this reads the gap after them as the
     break between "flip it here" and "go configure". */
  .hub-list .group-break {
    margin-top: 10px;
  }

  /* Android's split row: the body still drills in, and the trailing switch acts
     on the spot. The tile carries the surface so both halves sit on one card,
     with a hairline between them saying they are two targets. A row without a
     switch is the same tile with the body filling it. */
  .hub-tile {
    display: flex;
    align-items: center;
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .hub-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
    padding: 16px;
    border: none;
    border-radius: var(--radius-lg);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast) ease;
  }

  .hub-action {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-right: 16px;
    flex-shrink: 0;
  }

  .hub-split {
    width: var(--border-width);
    height: 36px;
    background: var(--border);
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
    position: relative;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }

  .section-activity-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 2px var(--surface-2);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-base) var(--ease-glide);
  }

  .section-activity-dot.unseen {
    opacity: 1;
    transition-duration: 0s;
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
     the tools in the drawer) lose that meaning mid-word at phone widths.
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
