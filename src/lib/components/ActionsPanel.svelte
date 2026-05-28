<script>
  import { onMount } from 'svelte';
  import { canvasState } from '$lib/state/canvas.svelte.js';
  import { settings } from '$lib/state/settings.svelte.js';
  import { strokeState, STROKE_SIZES, setStrokeSize } from '$lib/state/strokeWidth.svelte.js';
  import { ui, openColoringBook, openAiResult } from '$lib/state/ui.svelte.js';
  import { undo, exportCanvasBlob } from '$lib/drawing/engine.js';
  import { getActiveOverlayImage } from '$lib/drawing/overlay.js';
  import { saveScreenshot } from '$lib/drawing/screenshot.js';

  let panelEl;
  let strokeWrapperEl;
  let coloringBtnEl;
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

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('orientationchange', updatePanelPosition);
      document.removeEventListener('pointerdown', onDocPointerDown);
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
    if (ui.aiGenerating || canvasState.canvasEmpty) return;
    const blob = await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false });
    if (!blob) return;

    ui.aiGenerating = true;
    try {
      const form = new FormData();
      form.append('token', settings.aiAccessToken);
      form.append('image', blob, 'drawing.png');

      const res = await fetch('/api/generate-image', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(`AI image request failed (${res.status}): ${msg}`);
      }
      const outBlob = await res.blob();
      openAiResult(URL.createObjectURL(outBlob));
    } catch (err) {
      console.error(err);
      alert('Sorry, AI image generation failed. Please try again.');
    } finally {
      ui.aiGenerating = false;
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
