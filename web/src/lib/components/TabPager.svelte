<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import { tabPagerContextKey, type TabPagerContext, type TabPagerTab } from './tabPagerContext';

  interface Props {
    initialTab?: string;
    resetKey?: unknown;
    ariaLabel?: string;
    tabs: Snippet;
    children: Snippet<[string]>;
  }

  let { initialTab, resetKey, ariaLabel = 'Tab panels', tabs, children }: Props = $props();

  let pagerState: TabPagerContext['state'] = $state({
    activeTab: '',
    tabs: [],
  });

  let panelsEl: HTMLDivElement | null = null;
  // Fractional scroll position (0 = first panel, 1 = second, …) drives the
  // active-tab underline so it tracks the finger during a native swipe.
  let scrollProgress = $state(0);
  let scrollRaf: number | null = null;
  let initialized = false;
  let lastResetKey: unknown;
  let resetKeyInitialized = false;

  let tabStyle = $derived(
    `--active-tab-index:${scrollProgress}; --tab-count:${pagerState.tabs.length};`
  );

  const context: TabPagerContext = {
    state: pagerState,
    registerTab,
    setActiveTab,
  };
  setContext(tabPagerContextKey, context);

  function prefersReducedMotion() {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function indexOfTab(id: string) {
    const index = pagerState.tabs.findIndex((tab) => tab.id === id);
    return index === -1 ? 0 : index;
  }

  function scrollToIndex(index: number, behavior: ScrollBehavior) {
    // Set scrollLeft directly rather than scrollIntoView: the latter scrolls
    // every scrollable ancestor, dragging the dialog's vertical scroller down
    // and hiding the tab headers. We only ever want to pan the pager sideways.
    panelsEl?.scrollTo({ left: index * panelsEl.clientWidth, behavior });
  }

  $effect(() => {
    const fallback = initialTab ?? pagerState.tabs[0]?.id ?? '';
    if (!pagerState.activeTab || !pagerState.tabs.some((tab) => tab.id === pagerState.activeTab)) {
      pagerState.activeTab = fallback;
    }
  });

  // Place the scroller on the active panel once the tabs exist — without
  // animation, so the panel doesn't fly in sideways on first paint.
  $effect(() => {
    if (initialized || pagerState.tabs.length === 0) return;
    initialized = true;
    const index = indexOfTab(pagerState.activeTab);
    scrollProgress = index;
    requestAnimationFrame(() => scrollToIndex(index, 'auto'));
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

  function resetToInitialTab() {
    const id = initialTab ?? pagerState.tabs[0]?.id ?? '';
    pagerState.activeTab = id;
    const index = indexOfTab(id);
    scrollProgress = index;
    requestAnimationFrame(() => scrollToIndex(index, 'auto'));
  }

  function setActiveTab(id: string) {
    pagerState.activeTab = id;
    scrollToIndex(indexOfTab(id), prefersReducedMotion() ? 'auto' : 'smooth');
  }

  function registerTab(tab: TabPagerTab) {
    const index = pagerState.tabs.findIndex((candidate) => candidate.id === tab.id);
    if (index === -1) {
      pagerState.tabs = [...pagerState.tabs, tab];
      return;
    }

    const existing = pagerState.tabs[index];
    if (existing.label === tab.label && existing.icon === tab.icon) {
      return;
    }

    pagerState.tabs = pagerState.tabs.map((candidate) =>
      candidate.id === tab.id ? tab : candidate
    );
  }

  function onPanelsScroll() {
    if (scrollRaf !== null) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (!panelsEl) return;
      const width = panelsEl.clientWidth || 1;
      scrollProgress = panelsEl.scrollLeft / width;
      const nearest = pagerState.tabs[Math.round(scrollProgress)];
      if (nearest && nearest.id !== pagerState.activeTab) pagerState.activeTab = nearest.id;
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
  bind:this={panelsEl}
  onscroll={onPanelsScroll}
>
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
  }

  .tab-panels {
    display: flex;
    align-items: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tab-panels::-webkit-scrollbar {
    display: none;
  }

  .tab-content {
    flex: 0 0 100%;
    min-width: 0;
    padding: 0 1px;
    scroll-snap-align: start;
    scroll-snap-stop: always;
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
