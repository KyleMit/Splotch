<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeAiPrompt } from '$lib/state/ui.svelte';
  import { exportCanvasBlob } from '$lib/drawing/engine';
  import { getActiveOverlayImage } from '$lib/drawing/overlay';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { STYLE_NAMES } from '$lib/ai/styles';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';

  let previewUrl = $state<string | null>(null);
  let drawingBlob: Blob | null = null;

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

  function handleSelectStyle(style: string) {
    if (!drawingBlob) return;
    // Picking a style immediately hands off to the result modal, which shows
    // the progress dial (and any error) over the blurred drawing.
    const blob = drawingBlob;
    closeAiPrompt();
    generateAiImage({ blob, style });
  }
</script>

<dialog
  class="ai-prompt-modal modal-dialog modal-fly-in modal-shell"
  use:modalDialog={() => ({
    open: ui.aiPromptOpen,
    origin: ui.aiPromptOrigin,
    onRequestClose: closeAiPrompt,
    onOpen: loadPreview,
    onClose: cleanupPreview
  })}
>
  <div class="ai-prompt-content">
    <button class="ai-prompt-close modal-close-btn" aria-label="Close" onclick={closeAiPrompt}>
      <Icon name="close" class="modal-close-icon" />
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
    max-width: 480px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .ai-prompt-content {
    padding: 28px 24px 24px;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ai-prompt-close {
    top: 12px;
    right: 12px;
    z-index: 1;
  }

  .ai-prompt-close:disabled { opacity: 0.4; cursor: not-allowed; }

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
    border-color: var(--brand);
    transform: translateY(-2px);
  }

  .ai-style-option:hover:not(:disabled) .ai-style-label { color: var(--brand); }

  .ai-style-option:active:not(:disabled) .ai-style-thumb { transform: scale(0.97); }

  .ai-style-option:focus-visible {
    outline: none;
  }

  .ai-style-option:focus-visible .ai-style-thumb {
    border-color: var(--brand);
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
