<script lang="ts">
  import { tick } from 'svelte';
  import DialogHeader from './design/DialogHeader.svelte';
  import { clearRequestedSettingsSection, settingsModal, uiState } from '$lib/state/ui.svelte';
  import SectionBody from './settings/SectionBody.svelte';
  import CompactShell from './settings/CompactShell.svelte';
  import WideShell from './settings/WideShell.svelte';
  import HubList from './settings/HubList.svelte';
  import './SettingsModal.ai.css';
  import ScrollCue from './design/ScrollCue.svelte';
  import { SECTIONS, sectionHeading, type SectionId } from './settings/sections';
  import {
    DIALOG_CLOSING_CLASS,
    modalDialog,
    waitForDialogRetirement,
  } from '$lib/actions/modalDialog.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { PHONE_LANDSCAPE_QUERY } from '$lib/breakpoints';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { markSectionSeen } from '$lib/state/sectionsSeen.svelte';
  import { createSettingsMediaQueries } from './settings/settingsMediaQuery.svelte';

  // Two shells, one section list (ADR-0061). Below the breakpoint it's a hub
  // that drills into a full-page section; at or above it's a persistent sidebar
  // + content pane. The choice is viewport width, so a rotate re-picks it live.
  const WIDE_QUERY = '(min-width: 700px)';

  // A landscape *phone* has plenty of width (so it would match WIDE_QUERY) but
  // almost no height — the full section list is unusably cramped there. Detect
  // it with the app-wide phone-landscape query and swap in a stripped-down
  // shell of quick toggles. A landscape tablet keeps its height at or above the
  // tablet-class floor, so it stays on the sidebar shell untouched. Sharing the
  // one query is what keeps shell selection agreeing with the layout store's
  // phone-landscape classification at every viewport height, fractional ones
  // included.
  const shell = createSettingsMediaQueries({ wide: WIDE_QUERY, compact: PHONE_LANDSCAPE_QUERY });

  // 'hub' = the phone top-level list; a section id = that section is drilled
  // into. Only the phone shell navigates: the wide shell stacks every section in
  // one scroll, so its sidebar moves the scroll position instead of this.
  let view = $state<'hub' | SectionId>('hub');

  // The section the drilled-in phone view shows, and the one the wide pane parks
  // on when it opens.
  let activeSection = $derived<SectionId>(view === 'hub' ? SECTIONS[0].id : view);

  // Intentionally untracked: read only to tell an open transition from a request
  // arriving while already open.
  let dialogEl: HTMLDialogElement;

  // Counts opens for the wide shell, which re-stages its pane on each one.
  let openGeneration = $state(0);

  function landOn(section: SectionId) {
    markSectionSeen(section);
    view = section;
    clearRequestedSettingsSection();
  }

  let sectionHeadingEl = $state<HTMLHeadingElement>();

  // Each phone-shell move unmounts the control that held focus — the hub row
  // on a drill-in, the Back button on the way out — which drops a keyboard or
  // screen-reader user on <body>. Focus lands on what replaced it instead. A
  // Grown-Ups Only challenge still flying out restores focus to its own opener
  // as it closes, so landing waits that exit out rather than being overwritten.
  async function landFocus(target: () => HTMLElement | null | undefined) {
    await tick();
    const retiring = [
      ...document.querySelectorAll<HTMLDialogElement>(`dialog[open].${DIALOG_CLOSING_CLASS}`),
    ].filter((dialog) => dialog !== dialogEl);
    await Promise.all(retiring.map(waitForDialogRetirement));
    target()?.focus();
  }

  function drillInto(section: SectionId) {
    markSectionSeen(section);
    view = section;
    void landFocus(() => sectionHeadingEl);
  }

  // The landing view on each open: the deep-linked section, else the hub
  // (phone) — never wherever the last visit stopped reading. Runs from the
  // dialog action just before showModal(), so the first painted frame already
  // shows the landing.
  function landOnOpen() {
    openGeneration += 1;
    const requested = uiState.requestedSettingsSection;
    if (requested) landOn(requested);
    else view = 'hub';
  }

  // A request can also arrive while the overlay is already open, with no open
  // transition behind it: a Grown-Ups Only challenge raised over a Settings
  // action (sending feedback, following a link out) offers its own way into
  // Parent Center. During the open flush the dialog is not yet shown, so that
  // request is left for landOnOpen; only a request against a shown dialog lands
  // here. Consuming it reruns this once with nothing requested.
  $effect(() => {
    const requested = uiState.requestedSettingsSection;
    if (!requested || !settingsModal.open || !dialogEl.open) return;
    landOn(requested);
    void landFocus(() => sectionHeadingEl);
  });

  function openSection(id: SectionId, trigger: HTMLElement) {
    if (id !== 'parentCenter') {
      drillInto(id);
      return;
    }
    requireParentalGate('parentCenter', () => drillInto(id), buttonCenter(trigger));
  }

  function backToHub() {
    if (view === 'hub') return;
    const from = view;
    view = 'hub';
    void landFocus(() => dialogEl.querySelector<HTMLElement>(`button[data-section="${from}"]`));
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
</script>

<dialog
  class="settings-modal modal-dialog modal-fly-in modal-shell {view === 'ai' ? 'ai-section' : ''}"
  class:resizing={uiState.resizingActionButtons}
  class:wide={shell.wide}
  class:compact={shell.compact}
  id="settingsModal"
  aria-label="Settings"
  bind:this={dialogEl}
  use:modalDialog={() => ({
    open: settingsModal.open,
    origin: settingsModal.origin,
    onRequestClose: settingsModal.hide,
    onOpen: landOnOpen,
  })}
>
  <div class="settings-content">
    {#if shell.compact}
      <CompactShell />
    {:else if shell.wide}
      <div class="settings-header">
        <DialogHeader onclose={settingsModal.hide} closeFeedback><h2>Settings</h2></DialogHeader>
      </div>
      <WideShell landingSection={activeSection} {openGeneration} />
    {:else if view === 'hub'}
      <!-- Phone: top-level hub list. -->
      <div class="settings-header">
        <DialogHeader onclose={settingsModal.hide} closeFeedback><h2>Settings</h2></DialogHeader>
      </div>
      <ScrollCue>
        {#snippet children(end)}
          <div class="settings-scroll" use:pinchTextZoom={textZoom}>
            <div class="settings-zoom" bind:this={zoomTarget}>
              <HubList onopen={openSection} />
            </div>
            {@render end()}
          </div>
        {/snippet}
      </ScrollCue>
    {:else}
      <!-- Phone: drilled into a single section, with a back arrow. -->
      <div class="settings-header settings-header-sub">
        <DialogHeader
          backClass="settings-back"
          onback={backToHub}
          onclose={settingsModal.hide}
          closeFeedback
        >
          <h2 tabindex="-1" bind:this={sectionHeadingEl}>{sectionHeading(activeSection)}</h2>
        </DialogHeader>
      </div>
      <ScrollCue>
        {#snippet children(end)}
          <div class="settings-scroll" use:pinchTextZoom={textZoom}>
            <div class="settings-zoom" bind:this={zoomTarget}>
              <SectionBody id={activeSection} open={settingsModal.open} />
            </div>
            {@render end()}
          </div>
        {/snippet}
      </ScrollCue>
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
       pane padding measured ~740px at the large-tablet type step) with a
       little air, and no more. Past that, extra height is just empty pane
       below the reading content. settings-mount.spec.ts holds this ceiling to
       the sidebar still fitting whole, so a new section fails the spec rather
       than silently clipping the list. */
    --wide-card-height-ceiling: 760px;

    width: calc(100vw - 2 * var(--modal-gutter));
    max-width: 500px;
    max-height: var(--card-height-cap);
    overflow: hidden;
  }

  .settings-modal.wide {
    max-width: 860px;
  }

  /* The wide pane stacks every section, so its settled content overflows
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
    max-width: 640px;
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
    box-shadow: 0 2px 12px rgb(0 0 0 / 16%);
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
    /* 24px sides: the sidebar and hub tiles under the title start there. */
    padding: 28px 24px 18px;
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

  /* Phone: the single scroll region (hub list or a section body). overflow (not
     just -y) so a pinch-enlarged (.settings-zoom) body can be scrolled sideways too;
     at rest the content is container-width, so no horizontal bar shows. */
  .settings-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 24px 28px;
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
    margin-top: var(--setting-gap);
  }

  .settings-content :global(.setting) {
    padding: 12px 16px;
    background: var(--surface-2);
    border-radius: var(--radius-lg);
  }

  @media (max-width: 480px) {
    .settings-header {
      padding: 24px 20px 16px;
    }

    .settings-scroll {
      padding: 0 20px 24px;
    }
  }
</style>
