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

  // The open/close $effect above only revokes on an explicit close. If the
  // component is torn down while the picker is still open, revoke here so the
  // preview's object URL doesn't outlive the component.
  $effect(() => () => cleanupPreview());

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
  class="ai-prompt-modal modal-dialog modal-fly-in"
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
>
  <div class="ai-prompt-content">
    <button class="ai-prompt-close" aria-label="Close" onclick={closeAiPrompt}>
      <Icon name="close" class="ai-prompt-close-icon" />
    </button>

    <fieldset class="ai-prompt-styles">
      <legend>Pick a style</legend>
      <div class="ai-style-options">
        {#each STYLE_NAMES as s}
          <button
            type="button"
            class="ai-style-option"
            onclick={() => handleSelectStyle(s)}
            disabled={!previewUrl}
          >
            <img class="ai-style-thumb" src="/styles/{s.toLowerCase()}.webp" alt="" />
            <span class="ai-style-label">{s}</span>
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
    margin-bottom: 12px;
  }

  .ai-style-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .ai-style-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .ai-style-thumb {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border-radius: 12px;
    border: 3px solid transparent;
    background: #fcfbf8;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .ai-style-label {
    font-size: 13px;
    font-weight: 600;
    color: #555;
    user-select: none;
  }

  .ai-style-option:hover:not(:disabled) .ai-style-thumb {
    border-color: #AB71E1;
    transform: translateY(-2px);
  }

  .ai-style-option:hover:not(:disabled) .ai-style-label { color: #AB71E1; }

  .ai-style-option:active:not(:disabled) .ai-style-thumb { transform: scale(0.97); }

  .ai-style-option:focus-visible {
    outline: none;
  }

  .ai-style-option:focus-visible .ai-style-thumb {
    border-color: #AB71E1;
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.35);
  }

  .ai-style-option:disabled { opacity: 0.6; cursor: not-allowed; }

  @media (max-width: 420px) {
    .ai-style-options { grid-template-columns: repeat(2, 1fr); }
  }

  /* Short viewports (e.g. landscape on a small phone): trim chrome so the
     picker fits without forcing a scroll. The modal already scrolls via
     max-height/overflow-y, but tighter spacing keeps it from feeling cramped. */
  @media (max-height: 560px) {
    .ai-prompt-modal { max-height: 94vh; }
    .ai-prompt-content { padding: 16px 16px 14px; gap: 10px; }
    .ai-prompt-styles legend { margin-bottom: 8px; }
    .ai-style-options { gap: 8px; }
  }
</style>
