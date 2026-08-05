<script lang="ts">
  import type { Component } from 'svelte';
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';
  import SectionIcon from './SectionIcon.svelte';
  import { ui, settingsModal } from '$lib/state/ui.svelte';
  import AppearanceSection from './settings/AppearanceSection.svelte';
  import SoundSection from './settings/SoundSection.svelte';
  import SavingSection from './settings/SavingSection.svelte';
  import ControlsSection from './settings/ControlsSection.svelte';
  import AiKeyManager from './settings/AiKeyManager.svelte';
  import SetupInstructions from './settings/SetupInstructions.svelte';
  import WhatsNewSection from './settings/WhatsNewSection.svelte';
  import ReportForm from './settings/ReportForm.svelte';
  import AboutSection from './settings/AboutSection.svelte';
  import CompactShell from './settings/CompactShell.svelte';
  import { SECTIONS, sectionSubtitle, type SectionId, type SectionMeta } from './settings/sections';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';

  // Not every section takes `open` (only AiKeyManager/SetupInstructions/ReportForm do); passing it
  // uniformly is fine — Svelte drops props a component doesn't declare — but the generated types
  // can't express that, so the map admits both prop shapes and the render site widens to the one
  // that carries `open`.
  type SectionComponent = Component<Record<string, never>> | Component<{ open?: boolean }>;

  const SECTION_CONTENT: Record<SectionId, SectionComponent> = {
    appearance: AppearanceSection,
    sound: SoundSection,
    saving: SavingSection,
    controls: ControlsSection,
    ai: AiKeyManager,
    setup: SetupInstructions,
    whatsnew: WhatsNewSection,
    feedback: ReportForm,
    about: AboutSection,
  };

  const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s] as const)) as Record<
    SectionId,
    SectionMeta
  >;

  // Two shells, one section list (ADR-0061). Below the breakpoint it's a hub
  // that drills into a full-page section; at or above it's a persistent sidebar
  // + content pane. The choice is viewport width, so a rotate re-picks it live.
  // SettingsModal first mounts on the opening tap (bootHiddenOverlays), so seed
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

  // 'hub' = the phone top-level list; a section id = that section is open.
  let view = $state<'hub' | SectionId>('hub');

  // The section whose content the pane shows. The tablet pane always shows one
  // (the hub itself never renders there), defaulting to the first section.
  let activeSection = $derived<SectionId>(view === 'hub' ? SECTIONS[0].id : view);
  let activeMeta = $derived(SECTION_BY_ID[activeSection]);

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
    if (settingsModal.open) view = 'hub';
  });

  function openSection(id: SectionId) {
    view = id;
  }

  function backToHub() {
    view = 'hub';
  }

  // Tier-2 accessibility (ADR-0076): let a low-vision parent pinch to enlarge the
  // reading content. The bound element gets CSS `zoom`; whichever scroll shell is
  // mounted binds it. Zoom resets to normal whenever the overlay closes or the
  // parent navigates to another section.
  let zoomTarget = $state<HTMLElement>();
  const textZoom = () => ({
    target: zoomTarget,
    enabled: settingsModal.open,
    resetKey: view,
  });
</script>

{#snippet sectionContent(id: SectionId)}
  {@const Section = SECTION_CONTENT[id] as Component<{ open?: boolean }>}
  <Section open={settingsModal.open} />
{/snippet}

<dialog
  class="settings-modal modal-dialog modal-fly-in modal-shell"
  class:resizing={ui.resizingActionButtons}
  class:wide
  class:compact
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

    {#if compact}
      <CompactShell />
    {:else if wide}
      <!-- Tablet / desktop: persistent sidebar + scrolling content pane. -->
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
      <div class="settings-split">
        <nav class="settings-nav" aria-label="Settings sections">
          {#each SECTIONS as section (section.id)}
            <button
              class="settings-nav-item"
              data-section={section.id}
              class:active={section.id === activeSection}
              aria-current={section.id === activeSection ? 'page' : undefined}
              onclick={() => openSection(section.id)}
            >
              <SectionIcon icon={section.icon} class="settings-nav-icon" />
              <span>{section.label}</span>
            </button>
          {/each}
        </nav>
        <div class="settings-pane" use:pinchTextZoom={textZoom}>
          <div class="settings-zoom" bind:this={zoomTarget}>
            <h3 class="settings-pane-title">{activeMeta.title ?? activeMeta.label}</h3>
            {@render sectionContent(activeSection)}
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
                  onclick={() => openSection(section.id)}
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
    /* Clear the absolute close button in the top-right corner. */
    padding-right: 68px;
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

  .hub-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
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

  /* Nav never scrolls — only the pane does. */
  .settings-nav {
    flex-shrink: 0;
    width: 232px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .settings-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
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

  /* --brand-solid, not --brand: the fill carries the item's label, and
     --brand is only 3.4:1 against --on-brand (fails WCAG AA at this size). */
  .settings-nav-item.active {
    background: var(--brand-solid);
    color: var(--on-brand);
  }

  :global(.settings-nav-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .settings-nav-item.active :global(.settings-nav-icon svg) {
    fill: var(--on-brand);
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

  .settings-pane-title {
    margin: 0 0 20px 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }

  /* Shared setting-card tokens for the section bodies. The sections only ever
     render inside this modal, so scoping the :global reach here keeps these
     rules in one place instead of copied into each section component. */
  .settings-content {
    --setting-icon-size: 20px;
    --setting-icon-gap: 10px;
    --setting-indent: calc(var(--setting-icon-size) + var(--setting-icon-gap));
  }

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
      padding-right: 64px;
    }

    .settings-scroll {
      padding: 0 20px 24px;
    }
  }
</style>
