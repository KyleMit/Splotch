<script>
  import Icon from './Icon.svelte';
  import { ui, closeAiPrompt } from '$lib/state/ui.svelte.js';
  import { exportCanvasBlob } from '$lib/drawing/engine.js';
  import { getActiveOverlayImage } from '$lib/drawing/overlay.js';
  import { generateAiImage } from '$lib/drawing/aiImage.js';

  const DEFAULT_PROMPT =
    "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";
  const STYLES = ['Watercolor', 'Crayon', 'Felt Craft', 'Claymation', 'Storybook'];

  let dialogEl;
  let previewUrl = $state(null);
  let drawingBlob = null;
  let prompt = $state('');
  let style = $state('');

  $effect(() => {
    if (!dialogEl) return;
    if (ui.aiPromptOpen) {
      if (!dialogEl.open) {
        if (ui.aiPromptOrigin) {
          const { x, y } = ui.aiPromptOrigin;
          dialogEl.style.setProperty('--origin-x', `${x - window.innerWidth / 2}px`);
          dialogEl.style.setProperty('--origin-y', `${y - window.innerHeight / 2}px`);
        }
        prompt = '';
        style = '';
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

  function handleGenerate() {
    if (!drawingBlob) return;
    // Hand off immediately to the result modal, which shows the progress dial
    // (and any error) over the blurred drawing.
    const blob = drawingBlob;
    const trimmed = prompt.trim();
    const chosenStyle = style;
    closeAiPrompt();
    generateAiImage({ blob, prompt: trimmed, style: chosenStyle });
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

    <textarea
      class="ai-prompt-textarea"
      placeholder={DEFAULT_PROMPT}
      bind:value={prompt}
      rows="3"
    ></textarea>

    <fieldset class="ai-prompt-styles">
      <legend>Style</legend>
      <div class="ai-style-options">
        {#each STYLES as s}
          <label class="ai-style-option">
            <input type="radio" name="ai-style" value={s} bind:group={style} />
            <span class="ai-style-pill">{s}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <button
      class="ai-prompt-generate"
      onclick={handleGenerate}
      disabled={!previewUrl}
    >
      <Icon name="wand-stars" class="ai-prompt-generate-icon" />
      <span>Generate</span>
    </button>
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

  .ai-prompt-textarea {
    width: 100%;
    font: inherit;
    font-size: 15px;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 10px;
    resize: vertical;
    background: #fafafa;
    color: #333;
    box-sizing: border-box;
  }

  .ai-prompt-textarea:focus {
    outline: none;
    border-color: #AB71E1;
    background: white;
  }

  .ai-prompt-textarea:disabled { opacity: 0.6; cursor: not-allowed; }

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

  .ai-style-option { cursor: pointer; }

  .ai-style-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .ai-style-pill {
    display: inline-block;
    padding: 8px 14px;
    border: 2px solid #ddd;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    color: #555;
    background: white;
    transition: all 0.15s ease;
    user-select: none;
  }

  .ai-style-option:hover .ai-style-pill {
    border-color: #AB71E1;
    color: #AB71E1;
  }

  .ai-style-option input:checked + .ai-style-pill {
    background: #AB71E1;
    border-color: #AB71E1;
    color: white;
  }

  .ai-style-option input:focus-visible + .ai-style-pill {
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.35);
  }

  .ai-prompt-generate {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 18px;
    background: #AB71E1;
    border: none;
    border-radius: 12px;
    color: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(171, 113, 225, 0.35);
    transition: transform 0.15s ease, background 0.2s ease, opacity 0.2s ease;
  }

  .ai-prompt-generate:hover:not(:disabled) { background: #9559cd; }
  .ai-prompt-generate:active:not(:disabled) { transform: scale(0.98); }
  .ai-prompt-generate:disabled { opacity: 0.6; cursor: not-allowed; }

  :global(.ai-prompt-generate-icon) {
    width: 22px;
    height: 22px;
    filter: invert(100%);
  }
</style>
