<script>
  import { onMount } from 'svelte';
  import { canvasState } from '$lib/state/canvas.svelte.js';
  import { settings } from '$lib/state/settings.svelte.js';
  import { strokeState, STROKE_SIZES, setStrokeSize } from '$lib/state/strokeWidth.svelte.js';
  import { ui, openColoringBook, openAiPrompt } from '$lib/state/ui.svelte.js';
  import { undo } from '$lib/drawing/engine.js';
  import { saveScreenshot } from '$lib/drawing/screenshot.js';
  import { generateAiImage } from '$lib/drawing/aiImage.js';

  let panelEl;
  let strokeWrapperEl;
  let coloringBtnEl;
  let aiBtnEl;
  let leftOffset = $state(8);

  // Reposition the panel relative to the color palette in landscape;
  // in portrait it pins to bottom-left.
  function updatePanelPosition() {
    if (!panelEl) return;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
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

    try {
      await generateAiImage();
    } catch (err) {
      console.error(err);
      alert("Sorry, that didn't work. Please try again.");
    }
  }
</script>

<div class="actions-panel" bind:this={panelEl} style:left="{leftOffset}px">
  <div class="stroke-width-wrapper" bind:this={strokeWrapperEl} hidden={!settings.strokeWidthControlEnabled}>
    <button
      class="action-button"
      id="strokeWidthButton"
      aria-label="Stroke width"
      aria-expanded={strokeState.menuOpen}
      onclick={handleStrokeBtnClick}
    >
      <img src="/icons/line-weight.svg" alt="Stroke width" class="action-icon" />
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
          <img src="/icons/size-{size}.svg" alt="" class="action-icon" />
        </button>
      {/each}
    </div>
  </div>

  <button
    class="action-button"
    id="coloringBookButton"
    aria-label="Coloring books"
    hidden={!settings.coloringBookEnabled}
    onclick={handleColoringBookClick}
    bind:this={coloringBtnEl}
  >
    <img src="/icons/shapes.svg" alt="Coloring books" class="action-icon" />
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
    <img src="/icons/camera.svg" alt="Save screenshot" class="action-icon" />
  </button>

  <button
    class="action-button"
    class:disabled={canvasState.canvasEmpty || ui.aiGenerating}
    class:loading={ui.aiGenerating}
    id="aiImageButton"
    aria-label="Create AI image"
    aria-busy={ui.aiGenerating}
    disabled={canvasState.canvasEmpty || ui.aiGenerating}
    hidden={!settings.aiAccessToken || !settings.aiImageEnabled}
    onclick={handleAiImageClick}
    bind:this={aiBtnEl}
  >
    <img
      src={ui.aiGenerating ? '/icons/loading.svg' : '/icons/wand-stars.svg'}
      alt=""
      class="action-icon"
    />
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
    <img src="/icons/undo.svg" alt="Undo" class="action-icon" />
  </button>
</div>

<style>
  .actions-panel {
    position: fixed;
    bottom: 8px;
    left: 8px;
    display: flex;
    flex-direction: reverse;
    gap: 8px;
    z-index: 900;
    transition: left 0.3s ease;
  }

  @media (orientation: portrait) {
    .actions-panel {
      flex-direction: column-reverse;
      left: 8px;
      bottom: 8px;
    }
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

  .action-button:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #AB71E1;
    box-shadow: 0 4px 12px rgba(171, 113, 225, 0.3);
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.95);
    background: #ede7f6;
  }

  .action-button:disabled,
  .action-button.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: #f5f5f5;
    border-color: #e0e0e0;
  }

  .action-icon {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(12%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .action-button:disabled .action-icon,
  .action-button.disabled .action-icon {
    filter: invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  /* Spin the loading icon while AI generation is running.
     aiSpin keyframe lives in app.css since it's shared with AiImagePrompt. */
  .action-button.loading .action-icon {
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
    flex-direction: row;
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
    }
  }

  .stroke-width-menu[hidden] {
    display: none;
  }

  .stroke-size-button {
    width: 44px;
    height: 44px;
    background: white;
    border: 2px solid #ddd;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
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

  .stroke-size-button.active .action-icon {
    filter: invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%);
  }
</style>
