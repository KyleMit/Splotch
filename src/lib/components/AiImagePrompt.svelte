<script>
  import Icon from './Icon.svelte';
  import { ui, closeAiPrompt } from '$lib/state/ui.svelte.js';
  import { exportCanvasBlob } from '$lib/drawing/engine.js';
  import { getActiveOverlayImage } from '$lib/drawing/overlay.js';
  import { generateAiImage } from '$lib/drawing/aiImage.js';
  import { STYLE_NAMES } from '$lib/ai/styles.js';

  let dialogEl;
  let previewUrl = $state(null);
  let drawingBlob = null;

  $effect(() => {
    if (!dialogEl) return;
    if (ui.aiPromptOpen) {
      if (!dialogEl.open) {
        if (ui.aiPromptOrigin) {
          const { x, y } = ui.aiPromptOrigin;
          dialogEl.style.setProperty('--origin-x', `${x - window.innerWidth / 2}px`);
          dialogEl.style.setProperty('--origin-y', `${y - window.innerHeight / 2}px`);
        }
        loadPreview();
        dialogEl.showModal();
      }
    } else {
      if (dialogEl.open) dialogEl.close();
      cleanupPreview();
    }
  });

  async function loadPreview() {
    cleanupPreview();
    const blob = await exportCanvasBlob(getActiveOverlayImage(), { includePaperTexture: false });
    if (!blob) return;
    drawingBlob = blob;
    previewUrl = URL.createObjectURL(blob);
  }

  function cleanupPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    drawingBlob = null;
  }

  function handleSelectStyle(style) {
    if (!drawingBlob) return;
    // Picking a style immediately hands off to the result modal, which shows
    // the progress dial (and any error) over the blurred drawing.
    const blob = drawingBlob;
    closeAiPrompt();
    generateAiImage({ blob, style });
  }

  function handleDialogPointerDown(e) {
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      closeAiPrompt();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleDialogClose() {
    if (ui.aiPromptOpen) closeAiPrompt();
  }
</script>

<dialog
  class="ai-prompt-modal"
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
>
  <div class="ai-prompt-content">
    <button class="ai-prompt-close" aria-label="Close" onclick={closeAiPrompt}>
      <Icon name="close" class="ai-prompt-close-icon" />
    </button>

    <div class="ai-prompt-preview-wrap">
      {#if previewUrl}
        <img class="ai-prompt-preview" src={previewUrl} alt="" />
      {/if}
    </div>

    <fieldset class="ai-prompt-styles">
      <legend>Pick a style</legend>
      <div class="ai-style-options">
        {#each STYLE_NAMES as s}
          <button
            type="button"
            class="ai-style-pill"
            onclick={() => handleSelectStyle(s)}
            disabled={!previewUrl}
          >
            {s}
          </button>
        {/each}
      </div>
    </fieldset>
  </div>
</dialog>

<style>
  .ai-prompt-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 480px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 0;
  }

  .ai-prompt-modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .ai-prompt-modal[open] {
    animation: dialogFlyFromOrigin 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
    transform-origin: center;
  }

  .ai-prompt-content {
    padding: 28px 24px 24px;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ai-prompt-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .ai-prompt-close:disabled { opacity: 0.4; cursor: not-allowed; }

  :global(.ai-prompt-close-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(85%);
    transition: filter 0.2s ease;
  }

  .ai-prompt-close:hover:not(:disabled) :global(.ai-prompt-close-icon) {
    filter: invert(30%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .ai-prompt-preview-wrap {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #fcfbf8;
    border: 1px solid #eee;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .ai-prompt-preview {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .ai-prompt-styles {
    border: none;
    padding: 0;
    margin: 0;
  }

  .ai-prompt-styles legend {
    font-size: 14px;
    font-weight: 600;
    color: #555;
    padding: 0;
    margin-bottom: 8px;
  }

  .ai-style-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ai-style-pill {
    padding: 8px 14px;
    border: 2px solid #ddd;
    border-radius: 999px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: #555;
    background: white;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .ai-style-pill:hover:not(:disabled) {
    border-color: #AB71E1;
    color: white;
    background: #AB71E1;
  }

  .ai-style-pill:active:not(:disabled) { transform: scale(0.97); }

  .ai-style-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.35);
  }

  .ai-style-pill:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
