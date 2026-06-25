<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte';
  import { strokeState, STROKE_SIZES, setStrokeSize, activeStrokeSize } from '$lib/state/strokeWidth.svelte';
  import { toolState, selectEraser, selectPen } from '$lib/state/tool.svelte';
  import { ui, openColoringBook, openAiPrompt, buttonCenter } from '$lib/state/ui.svelte';
  import { network } from '$lib/state/network.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import { undo } from '$lib/drawing/engine';
  import { saveScreenshot } from '$lib/drawing/screenshot';
  import { generateAiImage } from '$lib/drawing/aiImage';

  let strokeWrapperEl: HTMLDivElement | undefined = $state();
  let coloringBtnEl: HTMLButtonElement | undefined = $state();
  let aiBtnEl: HTMLButtonElement | undefined = $state();
  let isPortrait = $state(false);

  // Landscape: sit just past the color palette so we clear it. Portrait: pin to
  // the bottom-left corner. paletteWidth is published by ColorPalette (0 until
  // measured), so this settles once the palette lays out — no querySelector and
  // no mount-time setTimeout to dodge the layout race.
  const leftOffset = $derived(isPortrait ? 8 : layout.paletteWidth + 8);

  // When advanced controls are disabled the drawer and its chevron are removed
  // entirely, simplifying the UI. When enabled, the chevron shows and the
  // drawer expands per its remembered open state.
  const drawerExpanded = $derived(settings.advancedControlsEnabled && settings.drawerOpen);

  // The stroke-size lines preview what you'll lay down: the pen color, or the
  // eraser's pink while erasing. Inherited by the icons via currentColor.
  const strokeMenuColor = $derived(toolState.eraser ? '#fb3675' : colors.activeColor);

  // Chevron points the way the drawer will move: forward (out) to open,
  // back (toward the corner it tucks into) to close. Landscape slides
  // left/right, portrait slides up/down.
  const chevronIcon = $derived(
    isPortrait
      ? (settings.drawerOpen ? 'chevron-down' : 'chevron-up')
      : (settings.drawerOpen ? 'chevron-left' : 'chevron-right')
  );

  function toggleDrawer() {
    const next = !settings.drawerOpen;
    setDrawerOpen(next);
    // Tidy up any open flyout as the controls tuck away.
    if (!next) strokeState.menuOpen = false;
  }

  // Track orientation so the chevron direction and drawer-slide axis match the
  // layout. The panel's left offset follows layout.paletteWidth reactively, so
  // there's nothing to measure here.
  function updateOrientation() {
    isPortrait = window.matchMedia('(orientation: portrait)').matches;
  }

  onMount(() => {
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    // Click outside closes stroke menu
    const onDocPointerDown = (e: PointerEvent) => {
      if (strokeState.menuOpen && strokeWrapperEl && !strokeWrapperEl.contains(e.target as Node)) {
        strokeState.menuOpen = false;
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  function handleUndoClick() {
    if (canvasState.canUndo) undo();
  }

  function handleScreenshotClick() {
    if (!canvasState.canvasEmpty) saveScreenshot();
  }

  function handleStrokeBtnClick() {
    strokeState.menuOpen = !strokeState.menuOpen;
  }

  function handleEraserClick() {
    // Tapping the eraser again toggles back to the pen. selectPen only flips the
    // tool flag — colors.activeColor is untouched, so the previous color resumes.
    if (toolState.eraser) selectPen();
    else selectEraser();
  }

  function handleStrokeSizeClick(size: number) {
    setStrokeSize(size);
    strokeState.menuOpen = false;
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    openColoringBook(buttonCenter(coloringBtnEl));
  }

  async function handleAiImageClick() {
    if (ui.aiGenerating || canvasState.canvasEmpty || !aiBtnEl) return;

    if (settings.aiCustomizationEnabled) {
      openAiPrompt(buttonCenter(aiBtnEl));
      return;
    }

    generateAiImage();
  }
</script>

<div class="actions-panel" style:left="{leftOffset}px">
  {#if drawerExpanded}
  <div class="actions-drawer" transition:slide={{ axis: isPortrait ? 'y' : 'x', duration: 280 }}>
  <div class="stroke-width-wrapper" bind:this={strokeWrapperEl} hidden={!settings.strokeWidthControlEnabled}>
    <button
      class="action-button"
      id="strokeWidthButton"
      aria-label="Stroke width"
      aria-expanded={strokeState.menuOpen}
      onclick={handleStrokeBtnClick}
      style:color={colors.activeColor}
    >
      <Icon name={toolState.eraser ? 'line-weight-eraser' : 'line-weight'} class="action-icon" />
    </button>
    <div class="stroke-width-menu" hidden={!strokeState.menuOpen} style:color={strokeMenuColor}>
      {#each STROKE_SIZES as size}
        <button
          class="stroke-size-button"
          class:active={activeStrokeSize() === size}
          aria-label="Size {size}"
          aria-pressed={activeStrokeSize() === size}
          onclick={() => handleStrokeSizeClick(size)}
        >
          <Icon name={`size-${size}` as import('./icon-names').IconName} class="action-icon" />
        </button>
      {/each}
    </div>
  </div>

  <button
    class="action-button"
    class:active={toolState.eraser}
    id="eraserButton"
    aria-label="Eraser"
    aria-pressed={toolState.eraser}
    hidden={!settings.eraserEnabled}
    onclick={handleEraserClick}
  >
    <Icon name="eraser" class="action-icon" />
  </button>

  <button
    class="action-button"
    id="coloringBookButton"
    aria-label="Coloring books"
    hidden={!settings.coloringBookEnabled}
    onclick={handleColoringBookClick}
    bind:this={coloringBtnEl}
  >
    <Icon name="shapes" class="action-icon" />
  </button>

  <button
    class="action-button"
    class:disabled={canvasState.canvasEmpty}
    id="screenshotButton"
    aria-label="Save screenshot"
    disabled={canvasState.canvasEmpty}
    hidden={!settings.screenshotEnabled}
    onclick={handleScreenshotClick}
  >
    <Icon name="camera" class="action-icon" />
  </button>

  <button
    class="action-button"
    class:disabled={canvasState.canvasEmpty || ui.aiGenerating}
    class:loading={ui.aiGenerating}
    id="aiImageButton"
    aria-label="Create AI image"
    aria-busy={ui.aiGenerating}
    disabled={canvasState.canvasEmpty || ui.aiGenerating}
    hidden={!settings.aiAccessToken || !settings.aiImageEnabled || !network.online}
    onclick={handleAiImageClick}
    bind:this={aiBtnEl}
  >
    <Icon name={ui.aiGenerating ? 'loading' : 'wand-stars'} class="action-icon" />
  </button>

  <button
    class="action-button"
    class:disabled={!canvasState.canUndo}
    id="undoButton"
    aria-label="Undo"
    disabled={!canvasState.canUndo}
    hidden={!settings.undoButtonEnabled}
    onclick={handleUndoClick}
  >
    <Icon name="undo" class="action-icon" />
  </button>
  </div>
  {/if}

  {#if settings.advancedControlsEnabled}
  <button
    class="drawer-toggle"
    aria-label={settings.drawerOpen ? 'Collapse controls' : 'Expand controls'}
    aria-expanded={settings.drawerOpen}
    onclick={toggleDrawer}
  >
    <Icon name={chevronIcon} class="drawer-toggle-icon" />
  </button>
  {/if}
</div>

<style>
  .actions-panel {
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom));
    left: calc(8px + env(safe-area-inset-left));
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: 901;
    transition: left 0.3s ease;
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: calc(8px + env(safe-area-inset-left));
      bottom: calc(8px + env(safe-area-inset-bottom));
    }
  }

  /* Collapsible drawer holding the action buttons. The buttons grow from the
     corner; the toggle rides along at the far end (right in landscape, top in
     portrait). The spacing toward the toggle lives on the drawer as a margin
     (not a flex gap) so the slide transition collapses it too — the toggle
     glides to the corner instead of snapping the last few pixels. */
  .actions-drawer {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
  }

  @media (orientation: portrait) {
    .actions-drawer {
      flex-direction: column-reverse;
      margin-right: 0;
      margin-top: 8px;
    }
  }

  /* Drawer open/close toggle. Deliberately low-key (no background, muted grey)
     so it mirrors the Parent Center button and doesn't compete with the tools. */
  .drawer-toggle {
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    touch-action: manipulation;
    flex-shrink: 0;
  }

  .drawer-toggle:hover {
    opacity: 0.7;
  }

  .drawer-toggle:active {
    opacity: 1;
  }

  :global(.drawer-toggle-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(60%) grayscale(100%);
    transition: filter 0.2s ease;
  }

  .drawer-toggle:hover :global(.drawer-toggle-icon) {
    filter: invert(40%) grayscale(100%);
  }

  .drawer-toggle:active :global(.drawer-toggle-icon) {
    filter: invert(0%) grayscale(100%);
  }

  .action-button {
    width: 48px;
    height: 48px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    touch-action: manipulation;
    padding: 8px;
  }

  /* Author display:flex above outranks the UA [hidden] rule, so restore it. */
  .action-button[hidden] {
    display: none;
  }

  /* Guard hover behind a real pointer: iOS WebKit applies :hover on tap and
     keeps it sticky until the user taps elsewhere, which left the eraser
     looking active (purple border) after deselecting. */
  @media (hover: hover) {
    .action-button:hover:not(:disabled) {
      background: #f5f5f5;
      border-color: var(--brand);
      box-shadow: 0 4px 12px rgba(171, 113, 225, 0.3);
    }
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.95);
    background: #ede7f6;
  }

  /* Selected tool (e.g. eraser): purple ring + tinted fill, matching the
     active stroke-size button. */
  .action-button.active {
    border-color: var(--brand);
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  .action-button.active :global(.action-icon:not(.icon-color)) {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }

  .action-button:disabled,
  .action-button.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: #f5f5f5;
    border-color: #e0e0e0;
  }

  :global(.action-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Tint the monochrome icons to match the UI. Full-color spot icons (tagged
     .icon-color in Icon.svelte) opt out so they show their own palette; the
     button's opacity already conveys the disabled state for those. */
  :global(.action-icon:not(.icon-color)) {
    filter: invert(12%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .action-button:disabled :global(.action-icon:not(.icon-color)),
  .action-button.disabled :global(.action-icon:not(.icon-color)) {
    filter: invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  /* Spin the loading icon while AI generation is running.
     aiSpin keyframe lives in app.css since it's shared with AiImagePrompt. */
  .action-button.loading :global(.action-icon) {
    animation: aiSpin 1s linear infinite;
  }

  /* Stroke width: trigger button wrapper + flyout menu */
  .stroke-width-wrapper {
    position: relative;
  }

  .stroke-width-wrapper[hidden] {
    display: none;
  }

  .stroke-width-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    z-index: 901;
  }

  @media (orientation: portrait) {
    .stroke-width-menu {
      left: calc(100% + 8px);
      bottom: 0;
      flex-direction: row;
    }
  }

  /* On very narrow portrait screens the horizontal flyout runs off the right
     edge, so stack the sizes vertically. It stays anchored to the right of the
     button (bottom-aligned) so it runs up alongside the other action buttons
     instead of over the top of them. */
  @media (orientation: portrait) and (max-width: 376px) {
    .stroke-width-menu {
      flex-direction: column;
    }
  }

  .stroke-width-menu[hidden] {
    display: none;
  }

  .stroke-size-button {
    width: 53px;
    height: 53px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 12px;
    cursor: pointer;
    /* Inherit the menu's color so the line icons (currentColor) pick up the
       active pen/eraser color — buttons don't inherit color by default. */
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 7px;
    transition: all 0.15s ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .stroke-size-button:hover {
      border-color: var(--brand);
      background: #f5f0ff;
    }
  }

  .stroke-size-button:active {
    transform: scale(0.92);
  }

  .stroke-size-button.active {
    border-color: var(--brand);
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  /* The selected size reads from the button's purple ring/fill; its line keeps
     the current color (currentColor), so only tint non-color icons here. */
  .stroke-size-button.active :global(.action-icon:not(.icon-color)) {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }
</style>
