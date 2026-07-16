<script lang="ts">
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import { ui, closeParentCenter } from '$lib/state/ui.svelte';
  import AppearanceSection from './parent/AppearanceSection.svelte';
  import SoundSection from './parent/SoundSection.svelte';
  import SavingSection from './parent/SavingSection.svelte';
  import ControlsSection from './parent/ControlsSection.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import WhatsNewSection from './parent/WhatsNewSection.svelte';
  import ReportForm from './parent/ReportForm.svelte';
  import AboutSection from './parent/AboutSection.svelte';
  import { SECTIONS, sectionSubtitle, type SectionId } from './parent/sections';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import ToggleRow from './parent/ToggleRow.svelte';
  import {
    settings,
    setSound,
    setLockRotation,
    setAdvancedControls,
    setTheme,
  } from '$lib/state/settings.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { supportsOrientationLock } from '$lib/platform';

  // Two shells, one section list (ADR-0061). Below the breakpoint it's a hub
  // that drills into a full-page section; at or above it's a persistent sidebar
  // + content pane. The choice is viewport width, so a rotate re-picks it live.
  // ParentCenter first mounts on the opening tap (bootHiddenOverlays), so seed
  // `wide` from the live viewport to render the right shell on the first frame —
  // no narrow-then-wide flash — then keep it fresh with the listener below.
  const WIDE_QUERY = '(min-width: 700px)';
  let wide = $state(browser ? matchMedia(WIDE_QUERY).matches : false);

  // A landscape *phone* has plenty of width (so it would match WIDE_QUERY) but
  // almost no height — the full section list is unusably cramped there. Detect
  // it by orientation + the same sub-600px height floor the tablet defaults use
  // (see defaultForceLandscapeOrientation), and swap in a stripped-down shell of
  // quick toggles. A landscape tablet keeps its height ≥ 600px, so it stays on
  // the sidebar shell untouched.
  const COMPACT_QUERY = '(orientation: landscape) and (max-height: 599px)';
  let compact = $state(browser ? matchMedia(COMPACT_QUERY).matches : false);

  const showOrientationControls = supportsOrientationLock();

  // 'hub' = the phone top-level list; a section id = that section is open.
  let view = $state<'hub' | SectionId>('hub');

  // The section whose content the pane shows. The tablet pane always shows one
  // (the hub itself never renders there), defaulting to the first section.
  let activeSection = $derived<SectionId>(view === 'hub' ? SECTIONS[0].id : view);
  let activeMeta = $derived(SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]);

  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const wideMql = matchMedia(WIDE_QUERY);
    const compactMql = matchMedia(COMPACT_QUERY);
    const sync = () => {
      wide = wideMql.matches;
      compact = compactMql.matches;
    };
    sync();
    wideMql.addEventListener('change', sync);
    compactMql.addEventListener('change', sync);
    return () => {
      wideMql.removeEventListener('change', sync);
      compactMql.removeEventListener('change', sync);
    };
  });

  // Each reopen lands on the hub (phone) / first section (tablet).
  $effect(() => {
    if (ui.parentCenterOpen) view = 'hub';
  });

  function openSection(id: SectionId) {
    view = id;
  }

  function backToHub() {
    view = 'hub';
  }
</script>

{#snippet sectionContent(id: SectionId)}
  {#if id === 'appearance'}
    <AppearanceSection />
  {:else if id === 'sound'}
    <SoundSection />
  {:else if id === 'saving'}
    <SavingSection />
  {:else if id === 'controls'}
    <ControlsSection />
  {:else if id === 'ai'}
    <AiKeyManager open={ui.parentCenterOpen} />
  {:else if id === 'setup'}
    <SetupInstructions open={ui.parentCenterOpen} />
  {:else if id === 'whatsnew'}
    <WhatsNewSection />
  {:else if id === 'feedback'}
    <ReportForm open={ui.parentCenterOpen} />
  {:else if id === 'about'}
    <AboutSection />
  {/if}
{/snippet}

<dialog
  class="parent-help-modal modal-dialog modal-fly-in modal-shell"
  class:resizing={ui.resizingActionButtons}
  class:wide
  class:compact
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter,
  })}
>
  <div class="parent-help-content">
    <button
      class="parent-help-close modal-close-btn"
      aria-label="Close"
      onclick={closeParentCenter}
    >
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if compact}
      <!-- Landscape phone: too cramped for the full section list, so just the
           essential quick toggles plus a pointer to portrait for the rest. -->
      <header class="pc-header pc-header-compact">
        <h2>Parent Center</h2>
      </header>
      <div class="quick-toggles">
        <div class="setting">
          <ToggleRow
            icon={settings.soundEnabled ? 'volume-on' : 'volume-off'}
            label="Sound"
            id="quickSoundToggle"
            checked={settings.soundEnabled}
            onToggle={setSound}
          />
        </div>
        <div class="setting">
          <ToggleRow
            icon={resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'}
            label="Night Mode"
            id="quickNightToggle"
            checked={resolvedTheme() === 'dark'}
            onToggle={(next) => setTheme(next ? 'dark' : 'light')}
          />
        </div>
        {#if showOrientationControls}
          <div class="setting">
            <ToggleRow
              icon={settings.lockRotationEnabled ? 'mobile-lock' : 'mobile-rotate'}
              label="Lock Rotation"
              id="quickLockRotationToggle"
              checked={settings.lockRotationEnabled}
              onToggle={setLockRotation}
            />
          </div>
        {/if}
        <div class="setting">
          <ToggleRow
            icon="dashboard-customize"
            label="Advanced Controls"
            id="quickAdvancedControlsToggle"
            checked={settings.advancedControlsEnabled}
            onToggle={setAdvancedControls}
          />
        </div>
      </div>
      <p class="portrait-note">
        <Icon name="mobile-portrait" class="portrait-note-icon" />
        Turn your device to portrait for the full settings.
      </p>
    {:else if wide}
      <!-- Tablet / desktop: persistent sidebar + scrolling content pane. -->
      <header class="pc-header">
        <h2>Parent Center</h2>
      </header>
      <div class="pc-split">
        <nav class="pc-nav" aria-label="Parent Center sections">
          {#each SECTIONS as section (section.id)}
            <button
              class="pc-nav-item"
              class:active={section.id === activeSection}
              aria-current={section.id === activeSection ? 'page' : undefined}
              onclick={() => openSection(section.id)}
            >
              {#if section.icon === 'splotchy'}
                <SplotchyIcon class="pc-nav-icon" />
              {:else}
                <Icon name={section.icon} class="pc-nav-icon" />
              {/if}
              <span>{section.label}</span>
            </button>
          {/each}
        </nav>
        <div class="pc-pane">
          <h3 class="pc-pane-title">{activeMeta.title ?? activeMeta.label}</h3>
          {@render sectionContent(activeSection)}
        </div>
      </div>
    {:else if view === 'hub'}
      <!-- Phone: top-level hub list. -->
      <header class="pc-header">
        <h2>Parent Center</h2>
      </header>
      <div class="pc-scroll">
        <ul class="hub-list">
          {#each SECTIONS as section (section.id)}
            <li>
              <button class="hub-row" onclick={() => openSection(section.id)}>
                <span class="hub-icon">
                  {#if section.icon === 'splotchy'}
                    <SplotchyIcon class="hub-icon-svg" />
                  {:else}
                    <Icon name={section.icon} class="hub-icon-svg" />
                  {/if}
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
    {:else}
      <!-- Phone: drilled into a single section, with a back arrow. -->
      <header class="pc-header pc-header-sub">
        <button class="pc-back" onclick={backToHub} aria-label="Back">
          <Icon name="chevron-left" class="pc-back-icon" />
        </button>
        <h2>{activeMeta.title ?? activeMeta.label}</h2>
      </header>
      <div class="pc-scroll">
        {@render sectionContent(activeSection)}
      </div>
    {/if}
  </div>
</dialog>

<style>
  .parent-help-modal {
    width: min(92vw, 500px);
    max-height: 85vh;
    overflow: hidden;
  }

  .parent-help-modal.wide {
    width: min(94vw, 860px);
  }

  /* Landscape phone: wider than the portrait card (width is the plentiful
     axis there) but nowhere near the tablet two-pane. */
  .parent-help-modal.compact {
    width: min(94vw, 640px);
  }

  /* While the parent drags the Button Size slider, the modal melts away to just
     that slider so the action buttons resize in full view behind it. The slider
     keeps its on-screen position (it stays under the finger); everything else in
     the card — heading, nav, other settings — is hidden, and the card surface
     and backdrop go transparent so the canvas and buttons show through. The
     slider still occupies its normal slot in the (now invisible) layout, so no
     repositioning gymnastics are needed. */
  .parent-help-modal.resizing {
    background: transparent;
    box-shadow: none;
  }

  .parent-help-modal.resizing::backdrop {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .parent-help-modal.resizing .parent-help-content {
    visibility: hidden;
  }

  .parent-help-modal.resizing :global(.button-size-setting) {
    visibility: visible;
    background: var(--surface);
    border-radius: 16px;
    /* A tight, even lift that hugs the rounded card — not the heavy, downward
       shadow that bled into a rectangular band below the control. */
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  }

  /* The content is a flex column capped at the modal height: the header stays
     put while the hub list / section body / content pane scrolls under it. */
  .parent-help-content {
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    position: relative;
    overflow: hidden;
  }

  .pc-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 28px 32px 18px;
    /* Clear the absolute close button in the top-right corner. */
    padding-right: 68px;
  }

  .pc-header h2 {
    margin: 0;
    font-size: 24px;
    color: var(--text-strong);
    font-weight: 600;
  }

  .pc-header-sub h2 {
    font-size: 20px;
  }

  /* ── Landscape-phone quick toggles ──────────────────────────────────────── */
  /* Every vertical pixel counts here, so the header shrinks and the toggles
     pack into a two-column grid that scrolls only if it must. */
  .pc-header-compact {
    padding: 14px 24px 10px;
    padding-right: 64px;
  }

  .pc-header-compact h2 {
    font-size: 18px;
  }

  .quick-toggles {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    align-content: start;
    padding: 0 24px;
  }

  .portrait-note {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    padding: 10px 24px 14px;
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
  }

  :global(.portrait-note-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  :global(.portrait-note-icon svg) {
    fill: var(--text-muted);
  }

  .pc-back {
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
    .pc-back:hover {
      background: var(--surface-hover);
    }
  }

  .pc-back:active {
    transform: scale(0.92);
  }

  :global(.pc-back-icon) {
    width: 22px;
    height: 22px;
  }

  :global(.pc-back-icon svg) {
    fill: var(--brand);
  }

  /* Phone: the single scroll region (hub list or a section body). */
  .pc-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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
    border-radius: 16px;
    background: var(--surface-2);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  @media (hover: hover) {
    .hub-row:hover {
      background: var(--surface-hover);
    }
  }

  .hub-row:active {
    transform: scale(0.99);
  }

  .hub-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--brand-wash);
    flex-shrink: 0;
  }

  :global(.hub-icon-svg) {
    width: 22px;
    height: 22px;
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
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong);
  }

  .hub-subtitle {
    font-size: 13px;
    color: var(--text-muted);
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
    fill: var(--text-faint);
  }

  /* ── Tablet two-pane ────────────────────────────────────────────────────── */
  .pc-split {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 8px;
    padding: 0 24px 24px;
  }

  /* Nav never scrolls — only the pane does. */
  .pc-nav {
    flex-shrink: 0;
    width: 232px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .pc-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--text-mid);
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  @media (hover: hover) {
    .pc-nav-item:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }

  .pc-nav-item.active {
    background: var(--brand);
    color: #fff;
  }

  :global(.pc-nav-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .pc-nav-item.active :global(.pc-nav-icon svg) {
    fill: #fff;
  }

  .pc-pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 8px 4px 16px;
  }

  .pc-pane-title {
    margin: 0 0 20px 0;
    font-size: 22px;
    font-weight: 600;
    color: var(--text-strong);
  }

  /* Shared setting-card tokens for the section bodies. The sections only ever
     render inside this modal, so scoping the :global reach here keeps these
     rules in one place instead of copied into each section component. */
  .parent-help-content :global(.setting-group) {
    margin-bottom: 24px;
  }

  .parent-help-content :global(.setting-group:last-child) {
    margin-bottom: 0;
  }

  .parent-help-content :global(.setting) {
    padding: 12px 16px;
    background: var(--surface-2);
    border-radius: 8px;
  }

  @media (max-width: 480px) {
    .pc-header {
      padding: 24px 20px 16px;
      padding-right: 64px;
    }

    .pc-scroll {
      padding: 0 20px 24px;
    }
  }
</style>
