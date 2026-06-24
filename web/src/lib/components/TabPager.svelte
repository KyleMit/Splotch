<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import {
    tabPagerContextKey,
    type TabPagerContext,
    type TabPagerTab
  } from './tabPagerContext';

  const defaultSwipeActivationDistance = 20;
  const swipeAxisRatio = 1.2;
  const swipeRetreatTolerance = 12;
  const flickVelocityThreshold = 0.5;
  const flickMinDistance = 6;
  const velocitySmoothing = 0.4;

  type SwipeState = {
    x: number;
    y: number;
    pointerId: number;
    width: number;
    direction: -1 | 1 | null;
    active: boolean;
    maxProgress: number;
    retreated: boolean;
    lastX: number;
    lastTime: number;
    velocity: number;
  };

  interface Props {
    initialTab?: string;
    resetKey?: unknown;
    ariaLabel?: string;
    swipeActivationDistance?: number;
    tabs: Snippet;
    children: Snippet<[string]>;
  }

  let {
    initialTab,
    resetKey,
    ariaLabel = 'Tab panels',
    swipeActivationDistance = defaultSwipeActivationDistance,
    tabs,
    children
  }: Props = $props();

  let pagerState: TabPagerContext['state'] = $state({
    activeTab: '',
    tabs: []
  });
  let swipeStart = $state<SwipeState | null>(null);
  let swipeOffset = $state(0);
  let swiping = $state(false);
  let activeTabIndex = $derived(
    Math.max(0, pagerState.tabs.findIndex((tab) => tab.id === pagerState.activeTab))
  );
  let trackTransform = $derived(`translateX(calc(-${activeTabIndex * 100}% + ${swipeOffset}px))`);
  let tabStyle = $derived(`--active-tab-index:${activeTabIndex}; --tab-count:${pagerState.tabs.length};`);
  let settleFrame: number | null = null;
  let lastResetKey: unknown;
  let resetKeyInitialized = false;
  let suppressNextClick = false;
  let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

  const context: TabPagerContext = {
    state: pagerState,
    registerTab,
    setActiveTab
  };
  setContext(tabPagerContextKey, context);

  $effect(() => {
    const fallback = initialTab ?? pagerState.tabs[0]?.id ?? '';
    if (!pagerState.activeTab || !pagerState.tabs.some((tab) => tab.id === pagerState.activeTab)) {
      pagerState.activeTab = fallback;
    }
  });

  $effect(() => {
    const currentResetKey = resetKey;
    if (!resetKeyInitialized) {
      lastResetKey = currentResetKey;
      resetKeyInitialized = true;
      return;
    }
    if (currentResetKey === lastResetKey) return;
    lastResetKey = currentResetKey;
    resetToInitialTab();
  });

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

  function resetToInitialTab() {
    resetSwipe();
    pagerState.activeTab = initialTab ?? pagerState.tabs[0]?.id ?? '';
  }

  function setActiveTab(tab: string) {
    resetSwipe();
    pagerState.activeTab = tab;
  }

  function registerTab(tab: TabPagerTab) {
    const index = pagerState.tabs.findIndex((candidate) => candidate.id === tab.id);
    if (index === -1) {
      pagerState.tabs = [...pagerState.tabs, tab];
      return;
    }

    const existing = pagerState.tabs[index];
    if (
      existing.label === tab.label &&
      existing.icon === tab.icon
    ) {
      return;
    }

    pagerState.tabs = pagerState.tabs.map((candidate) => (candidate.id === tab.id ? tab : candidate));
  }

  function moveTab(offset: -1 | 1) {
    const next = activeTabIndex + offset;
    if (next < 0 || next >= pagerState.tabs.length) return;
    pagerState.activeTab = pagerState.tabs[next].id;
  }

  function canMove(offset: -1 | 1) {
    const next = activeTabIndex + offset;
    return next >= 0 && next < pagerState.tabs.length;
  }

  function isInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest('button, a, input, textarea, select, [role="switch"], [role="slider"]')
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
      retreated: false,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      velocity: 0
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

    const dt = e.timeStamp - swipeStart.lastTime;
    if (dt > 0) {
      const instantVelocity = (e.clientX - swipeStart.lastX) / dt;
      swipeStart.velocity =
        swipeStart.velocity * velocitySmoothing + instantVelocity * (1 - velocitySmoothing);
      swipeStart.lastX = e.clientX;
      swipeStart.lastTime = e.timeStamp;
    }

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
    const dy = e.clientY - swipeStart.y;
    const velocity = swipeStart.velocity;

    let direction = swipeStart.direction;
    // A fast, brief flick can lift before the swipe ever crosses the
    // activation distance — derive its direction from the release velocity.
    if (
      direction === null &&
      Math.abs(velocity) >= flickVelocityThreshold &&
      Math.abs(dx) >= flickMinDistance &&
      Math.abs(dx) >= Math.abs(dy)
    ) {
      direction = velocity < 0 ? 1 : -1;
    }

    const movedInDirection = direction !== null && (direction === 1 ? dx < 0 : dx > 0);
    const velocityInDirection = direction === 1 ? -velocity : direction === -1 ? velocity : 0;
    const distanceMet = swipeStart.active && Math.abs(dx) >= swipeActivationDistance;
    const flickMet = velocityInDirection >= flickVelocityThreshold && Math.abs(dx) >= flickMinDistance;

    const accepted =
      direction !== null &&
      canMove(direction) &&
      !swipeStart.retreated &&
      movedInDirection &&
      (distanceMet || flickMet);
    swipeStart = null;

    if (swiping || accepted) {
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

<div class="tab-buttons" style={tabStyle}>
  {@render tabs()}
  <span class="tab-active-indicator" aria-hidden="true"></span>
</div>

<div
  class="tab-panels"
  role="region"
  aria-label={ariaLabel}
  onpointerdown={onPanelPointerDown}
  onpointermove={onPanelPointerMove}
  onpointerup={onPanelPointerUp}
  onpointercancel={onPanelPointerCancel}
  onclickcapture={onPanelClickCapture}
>
  <div class="tab-track" class:swiping style:transform={trackTransform}>
    {#each pagerState.tabs as tab (tab.id)}
      <div
        class="tab-content"
        role="tabpanel"
        aria-hidden={pagerState.activeTab !== tab.id}
        inert={pagerState.activeTab !== tab.id ? true : undefined}
      >
        {@render children(tab.id)}
      </div>
    {/each}
  </div>
</div>

<style>
  .tab-buttons {
    --tab-gap: 8px;
    display: flex;
    gap: var(--tab-gap);
    margin-bottom: 24px;
    border-bottom: 2px solid #e0e0e0;
    position: relative;
  }

  :global(.tab-button) {
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

  :global(.tab-button.active .tab-icon) {
    opacity: 1;
  }

  :global(.tab-button:hover) {
    color: #666;
    background: #f5f5f5;
  }

  :global(.tab-button.active) {
    color: var(--brand);
  }

  .tab-active-indicator {
    position: absolute;
    left: 0;
    bottom: -2px;
    width: calc((100% - (var(--tab-gap) * (var(--tab-count) - 1))) / var(--tab-count));
    height: 3px;
    border-radius: 999px 999px 0 0;
    background: var(--brand);
    pointer-events: none;
    transform: translateX(calc(var(--active-tab-index) * (100% + var(--tab-gap))));
    transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }

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
    .tab-track,
    .tab-active-indicator {
      transition: none;
    }
  }

  @media (max-width: 480px) {
    .tab-buttons {
      --tab-gap: 4px;
    }

    :global(.tab-button) {
      padding: 10px 8px;
      font-size: 14px;
      gap: 6px;
    }
  }

  @media (max-width: 380px) {
    :global(.tab-button) {
      flex-direction: column;
      gap: 4px;
      padding: 10px 4px;
      font-size: 12px;
    }
  }
</style>
