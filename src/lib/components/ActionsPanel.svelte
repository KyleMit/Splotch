<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { canvasState } from '$lib/state/canvas.svelte.js';
  import { settings, setDrawerOpen } from '$lib/state/settings.svelte.js';
  import { strokeState, STROKE_SIZES, setStrokeSize } from '$lib/state/strokeWidth.svelte.js';
  import { toolState, selectEraser } from '$lib/state/tool.svelte.js';
  import { ui, openColoringBook, openAiPrompt } from '$lib/state/ui.svelte.js';
  import { undo } from '$lib/drawing/engine.js';
  import { saveScreenshot } from '$lib/drawing/screenshot.js';
  import { generateAiImage } from '$lib/drawing/aiImage.js';

  let panelEl;
  let strokeWrapperEl;
  let coloringBtnEl;
  let aiBtnEl;
  let leftOffset = $state(8);
  let isPortrait = $state(false);

  // Advanced controls is the master switch — off means no controls at all.
  const master = $derived(settings.advancedControlsEnabled);
  const open = $derived(settings.drawerOpen);
  // The AI button is gated by its access token + enable toggle, and is always
  // part of the collapsible group (it isn't pinnable).
  const aiPresent = $derived(!!settings.aiAccessToken && settings.aiImageEnabled);
  const allPinned = $derived(
    settings.strokeWidthPinned &&
    settings.eraserPinned &&
    settings.coloringBookPinned &&
    settings.screenshotPinned &&
    settings.undoPinned
  );
  // Pinned controls stay visible with the drawer closed; the chevron only earns
  // its place when something is still hidden — an unpinned control or the AI
  // button. Once everything shown is pinned, the chevron would be a no-op.
  const showChevron = $derived(master && (!allPinned || aiPresent));

  const slideParams = $derived({ axis: isPortrait ? 'y' : 'x', duration: 280 });

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

  // Reposition the panel relative to the color palette in landscape;
  // in portrait it pins to bottom-left.
  function updatePanelPosition() {
    if (!panelEl) return;
    isPortrait = window.matchMedia('(orientation: portrait)').matches;
    const colorPalette = document.querySelector('.color-palette');
    if (!colorPalette) return;

    if (isPortrait) {
      leftOffset = 8;
    } else {
      const paletteRect = colorPalette.getBoundingClientRect();
      leftOffset = paletteRect.width + 8;
    }
  }

  onMount(() => {
    updatePanelPosition();
    setTimeout(updatePanelPosition, 100);
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('orientationchange', updatePanelPosition);

    // Click outside closes stroke menu
    const onDocPointerDown = (e) => {
      if (strokeState.menuOpen && strokeWrapperEl && !strokeWrapperEl.contains(e.target)) {
        strokeState.menuOpen = false;
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);

    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('orientationchange', updatePanelPosition);
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
    selectEraser();
  }

  function handleStrokeSizeClick(size) {
    setStrokeSize(size);
    strokeState.menuOpen = false;
  }

  function handleColoringBookClick() {
    if (!coloringBtnEl) return;
    const rect = coloringBtnEl.getBoundingClientRect();
    openColoringBook({
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    });
  }

  async function handleAiImageClick() {
    if (ui.aiGenerating || canvasState.canvasEmpty || !aiBtnEl) return;

    if (settings.aiCustomizationEnabled) {
      const rect = aiBtnEl.getBoundingClientRect();
      openAiPrompt({
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2
      });
      return;
    }

    generateAiImage();
  }
</script>

<div class="actions-panel" bind:this={panelEl} style:left="{leftOffset}px">
  {#if master && (settings.strokeWidthPinned || open)}
  <div class="stroke-width-wrapper" bind:this={strokeWrapperEl} transition:slide={slideParams}>
    <button
      class="action-button"
      id="strokeWidthButton"
      aria-label="Stroke width"
      aria-expanded={strokeState.menuOpen}
      onclick={handleStrokeBtnClick}
    >
      <Icon name="line-weight" class="action-icon" />
    </button>
    <div class="stroke-width-menu" hidden={!strokeState.menuOpen}>
      {#each STROKE_SIZES as size}
        <button
          class="stroke-size-button"
          class:active={strokeState.size === size}
          aria-label="Size {size}"
          aria-pressed={strokeState.size === size}
          onclick={() => handleStrokeSizeClick(size)}
        >
          <Icon name="size-{size}" class="action-icon" />
        </button>
      {/each}
    </div>
  </div>
  {/if}

  {#if master && (settings.eraserPinned || open)}
  <button
    class="action-button"
    class:active={toolState.eraser}
    id="eraserButton"
    aria-label="Eraser"
    aria-pressed={toolState.eraser}
    onclick={handleEraserClick}
    transition:slide={slideParams}
  >
    <Icon name="eraser" class="action-icon" />
  </button>
  {/if}

  {#if master && (settings.coloringBookPinned || open)}
  <button
    class="action-button"
    id="coloringBookButton"
    aria-label="Coloring books"
    onclick={handleColoringBookClick}
    bind:this={coloringBtnEl}
    transition:slide={slideParams}
  >
    <Icon name="shapes" class="action-icon" />
  </button>
  {/if}

  {#if master && (settings.screenshotPinned || open)}
  <button
    class="action-button"
    class:disabled={canvasState.canvasEmpty}
    id="screenshotButton"
    aria-label="Save screenshot"
    disabled={canvasState.canvasEmpty}
    onclick={handleScreenshotClick}
    transition:slide={slideParams}
  >
    <Icon name="camera" class="action-icon" />
  </button>
  {/if}

  {#if master && aiPresent && open}
  <button
    class="action-button"
    class:disabled={canvasState.canvasEmpty || ui.aiGenerating}
    class:loading={ui.aiGenerating}
    id="aiImageButton"
    aria-label="Create AI image"
    aria-busy={ui.aiGenerating}
    disabled={canvasState.canvasEmpty || ui.aiGenerating}
    onclick={handleAiImageClick}
    bind:this={aiBtnEl}
    transition:slide={slideParams}
  >
    <Icon name={ui.aiGenerating ? 'loading' : 'wand-stars'} class="action-icon" />
  </button>
  {/if}

  {#if master && (settings.undoPinned || open)}
  <button
    class="action-button"
    class:disabled={!canvasState.canUndo}
    id="undoButton"
    aria-label="Undo"
    disabled={!canvasState.canUndo}
    onclick={handleUndoClick}
    transition:slide={slideParams}
  >
    <Icon name="undo" class="action-icon" />
  </button>
  {/if}

  {#if showChevron}
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
    bottom: 8px;
    left: 8px;
    display: flex;
    flex-direction: row;
    align-items: center;
    z-index: 901;
    transition: left 0.3s ease;
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: 8px;
      bottom: 8px;
    }
  }

  /* Each control carries its own spacing on the side facing away from the
     anchored corner (right in landscape, top in portrait). Because the slide
     transition animates margins on its axis, a collapsing control closes its
     gap smoothly and the remaining controls — plus the chevron — glide to the
     corner with no snap. Scoped to direct children so the stroke button nested
     inside its wrapper isn't double-spaced. */
  .actions-panel > .action-button,
  .actions-panel > .stroke-width-wrapper {
    margin-right: 8px;
  }

  @media (orientation: portrait) {
    .actions-panel > .action-button,
    .actions-panel > .stroke-width-wrapper {
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

  .action-button:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #AB71E1;
    box-shadow: 0 4px 12px rgba(171, 113, 225, 0.3);
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.95);
    background: #ede7f6;
  }

  /* Selected tool (e.g. eraser): purple ring + tinted fill, matching the
     active stroke-size button. */
  .action-button.active {
    border-color: #AB71E1;
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  .action-button.active :global(.action-icon) {
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
    filter: invert(12%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .action-button:disabled :global(.action-icon),
  .action-button.disabled :global(.action-icon) {
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
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 7px;
    transition: all 0.15s ease;
    touch-action: manipulation;
  }

  .stroke-size-button:hover {
    border-color: #AB71E1;
    background: #f5f0ff;
  }

  .stroke-size-button:active {
    transform: scale(0.92);
  }

  .stroke-size-button.active {
    border-color: #AB71E1;
    background: #ede7f6;
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
  }

  .stroke-size-button.active :global(.action-icon) {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }
</style>
