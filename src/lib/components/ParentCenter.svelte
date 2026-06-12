<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, openParentCenter, closeParentCenter, buttonCenter } from '$lib/state/ui.svelte';
  import SettingsToggles from './parent/SettingsToggles.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import AboutTab from './parent/AboutTab.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';

  let buttonEl: HTMLButtonElement;
  const tabs = ['settings', 'ai', 'install', 'about'] as const;
  const swipeActivationDistance = 20;
  const swipeAxisRatio = 1.2;
  const swipeRetreatTolerance = 12;
  type ParentTab = (typeof tabs)[number];
  type SwipeState = {
    x: number;
    y: number;
    pointerId: number;
    width: number;
    direction: -1 | 1 | null;
    active: boolean;
    maxProgress: number;
    retreated: boolean;
  };
  let activeTab = $state<ParentTab>('settings');
  let swipeStart = $state<SwipeState | null>(null);
  let swipeOffset = $state(0);
  let swiping = $state(false);
  let activeTabIndex = $derived(tabs.indexOf(activeTab));
  let trackTransform = $derived(`translateX(calc(-${activeTabIndex * 100}% + ${swipeOffset}px))`);
  let settleFrame: number | null = null;
  let suppressNextClick = false;
  let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

  function openModal() {
    if (!buttonEl) return;
    openParentCenter(buttonCenter(buttonEl));
  }

  function resetSwipe() {
    if (settleFrame !== null) cancelAnimationFrame(settleFrame);
    if (suppressClickTimer !== null) clearTimeout(suppressClickTimer);
    settleFrame = null;
    suppressClickTimer = null;
    suppressNextClick = false;
    swipeStart = null;
    swipeOffset = 0;
    swiping = false;
  }

  function setActiveTab(tab: ParentTab) {
    resetSwipe();
    activeTab = tab;
  }

  function moveTab(offset: -1 | 1) {
    const current = tabs.indexOf(activeTab);
    const next = current + offset;
    if (next < 0 || next >= tabs.length) return;
    activeTab = tabs[next];
  }

  function canMove(offset: -1 | 1) {
    const current = tabs.indexOf(activeTab);
    const next = current + offset;
    return next >= 0 && next < tabs.length;
  }

  function isInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest('button, a, input, textarea, select, [role="switch"]')
    );
  }

  function suppressClickAfterSwipe() {
    suppressNextClick = true;
    if (suppressClickTimer !== null) clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => {
      suppressNextClick = false;
      suppressClickTimer = null;
    }, 350);
  }

  function clearClickSuppression() {
    suppressNextClick = false;
    if (suppressClickTimer !== null) clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
  }

  function onPanelClickCapture(e: MouseEvent) {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    if (suppressClickTimer !== null) clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onPanelPointerDown(e: PointerEvent) {
    clearClickSuppression();
    if (!e.isPrimary || e.button !== 0 || isInteractiveTarget(e.target)) return;
    const width =
      e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect().width : 1;
    swipeStart = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      width,
      direction: null,
      active: false,
      maxProgress: 0,
      retreated: false
    };
    swipeOffset = 0;
    swiping = false;
  }

  function onPanelPointerMove(e: PointerEvent) {
    if (!swipeStart || swipeStart.pointerId !== e.pointerId) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!swipeStart.active) {
      if (absX < swipeActivationDistance) return;
      if (absX < absY * swipeAxisRatio) return;
      swipeStart.direction = dx < 0 ? 1 : -1;
      swipeStart.active = true;
      swiping = true;
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.setPointerCapture(e.pointerId);
    }

    const direction = swipeStart.direction;
    if (!direction) return;
    const movingInDirection = direction === 1 ? dx < 0 : dx > 0;
    const progress = movingInDirection ? absX : 0;
    if (progress + swipeRetreatTolerance < swipeStart.maxProgress) {
      swipeStart.retreated = true;
    }
    swipeStart.maxProgress = Math.max(swipeStart.maxProgress, progress);

    const maxOffset = swipeStart.width;
    let nextOffset = Math.min(progress, maxOffset) * -direction;

    if (!canMove(direction)) nextOffset *= 0.25;
    swipeOffset = nextOffset;
    e.preventDefault();
    e.stopPropagation();
  }

  function onPanelPointerUp(e: PointerEvent) {
    if (!swipeStart || swipeStart.pointerId !== e.pointerId) return;
    if (
      e.currentTarget instanceof HTMLElement &&
      e.currentTarget.hasPointerCapture(e.pointerId)
    ) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const dx = e.clientX - swipeStart.x;
    const direction = swipeStart.direction;
    const accepted =
      swipeStart.active &&
      direction !== null &&
      canMove(direction) &&
      !swipeStart.retreated &&
      Math.abs(dx) >= swipeActivationDistance &&
      (direction === 1 ? dx < 0 : dx > 0);
    swipeStart = null;

    if (swiping) {
      suppressClickAfterSwipe();
      settleFrame = requestAnimationFrame(() => {
        swiping = false;
        if (accepted && direction) moveTab(direction);
        swipeOffset = 0;
        settleFrame = null;
      });
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPanelPointerCancel(e: PointerEvent) {
    if (swipeStart?.pointerId !== e.pointerId) return;
    swipeStart = null;
    if (swiping) suppressClickAfterSwipe();
    settleFrame = requestAnimationFrame(() => {
      swiping = false;
      swipeOffset = 0;
      settleFrame = null;
    });
  }
</script>

<button
  class="parent-help-button"
  id="parentHelpButton"
  aria-label="Parent Center"
  bind:this={buttonEl}
  onclick={openModal}
>
  <Icon name="parent" class="parent-help-icon" aria-label="Parent Center" role="img" />
</button>

<dialog
  class="parent-help-modal modal-dialog modal-fly-in modal-shell"
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter,
    onOpen: () => {
      resetSwipe();
      activeTab = 'settings';
    }
  })}
>
  <div class="parent-help-content">
    <button class="parent-help-close modal-close-btn" aria-label="Close" onclick={closeParentCenter}>×</button>
    <h2>Parent Center</h2>

    <div class="tab-buttons">
      <button class="tab-button" class:active={activeTab === 'settings'} onclick={() => setActiveTab('settings')}>
        <Icon name="settings" class="tab-icon" />
        <span>Settings</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'ai'} onclick={() => setActiveTab('ai')}>
        <Icon name="wand-stars" class="tab-icon" />
        <span>AI</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'install'} onclick={() => setActiveTab('install')}>
        <Icon name="pin" class="tab-icon" />
        <span>Setup</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'about'} onclick={() => setActiveTab('about')}>
        <Icon name="splotchy" class="tab-icon" />
        <span>About</span>
      </button>
    </div>

    <div
      class="tab-panels"
      role="region"
      aria-label="Parent Center panels"
      onpointerdown={onPanelPointerDown}
      onpointermove={onPanelPointerMove}
      onpointerup={onPanelPointerUp}
      onpointercancel={onPanelPointerCancel}
      onclickcapture={onPanelClickCapture}
    >
      <div class="tab-track" class:swiping style:transform={trackTransform}>
        <div
          class="tab-content"
          role="tabpanel"
          aria-hidden={activeTab !== 'settings'}
          inert={activeTab !== 'settings' ? true : undefined}
        >
          <SettingsToggles />
        </div>

        <div
          class="tab-content"
          role="tabpanel"
          aria-hidden={activeTab !== 'ai'}
          inert={activeTab !== 'ai' ? true : undefined}
        >
          <AiKeyManager open={ui.parentCenterOpen} />
        </div>

        <div
          class="tab-content"
          role="tabpanel"
          aria-hidden={activeTab !== 'install'}
          inert={activeTab !== 'install' ? true : undefined}
        >
          <SetupInstructions open={ui.parentCenterOpen} />
        </div>

        <div
          class="tab-content"
          role="tabpanel"
          aria-hidden={activeTab !== 'about'}
          inert={activeTab !== 'about' ? true : undefined}
        >
          <AboutTab />
        </div>
      </div>
    </div>
  </div>
</dialog>

<style>
  /* Trigger button (floats in the bottom-right corner) */
  .parent-help-button {
    position: fixed;
    bottom: 8px;
    right: 8px;
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #999;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    z-index: 900;
    padding: 8px;
    touch-action: manipulation;
  }

  .parent-help-button:hover {
    opacity: 0.7;
  }

  .parent-help-button:active {
    opacity: 1;
  }

  :global(.parent-help-icon) {
    width: 100%;
    height: 100%;
    filter: invert(60%) grayscale(100%);
  }

  .parent-help-button:hover :global(.parent-help-icon) {
    filter: invert(40%) grayscale(100%);
  }

  .parent-help-button:active :global(.parent-help-icon) {
    filter: invert(0%) grayscale(100%);
  }

  /* Modal dialog */
  .parent-help-modal {
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
  }

  .parent-help-content {
    padding: 32px;
    position: relative;
    max-height: 80vh;
    overflow-y: auto;
  }

  .parent-help-content h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #333;
    font-weight: 600;
  }

  /* Tab Buttons */
  .tab-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 2px solid #e0e0e0;
  }

  .tab-button {
    flex: 1;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: #999;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: -2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  :global(.tab-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }

  .tab-button.active :global(.tab-icon) {
    opacity: 1;
  }

  .tab-button:hover {
    color: #666;
    background: #f5f5f5;
  }

  .tab-button.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  /* Tab Content */
  .tab-panels {
    overflow: hidden;
    touch-action: pan-y;
  }

  .tab-track {
    display: flex;
    align-items: flex-start;
    transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .tab-track.swiping {
    transition: none;
  }

  .tab-content {
    flex: 0 0 100%;
    min-width: 0;
    padding: 0 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-track {
      transition: none;
    }
  }

  /* Four tabs get cramped on narrow portrait screens. First tighten the
     spacing; then, when that runs out, stack the icon over the label so each
     tab needs far less horizontal room. */
  @media (max-width: 480px) {
    .parent-help-content {
      padding: 24px 20px;
    }

    .tab-buttons {
      gap: 4px;
    }

    .tab-button {
      padding: 10px 8px;
      font-size: 14px;
      gap: 6px;
    }
  }

  @media (max-width: 380px) {
    .tab-button {
      flex-direction: column;
      gap: 4px;
      padding: 10px 4px;
      font-size: 12px;
    }
  }

  .parent-help-close {
    padding: 0;
    font-size: 32px;
    line-height: 32px;
    color: #999;
    transition: color 0.2s ease;
  }

  .parent-help-close:hover {
    color: #666;
  }
</style>
