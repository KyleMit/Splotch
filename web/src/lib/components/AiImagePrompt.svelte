<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeAiPrompt } from '$lib/state/ui.svelte';
  import { exportCanvasBlob } from '$lib/drawing/engine';
  import { getActiveOverlayImage } from '$lib/drawing/overlay';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import AiImagePromptContent from './AiImagePromptContent.svelte';

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

  // The modalDialog action's onClose only revokes on an explicit close. This
  // teardown effect covers the component being unmounted while the picker is
  // still open, so the preview's object URL doesn't outlive the component.
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

<!-- Thin modal shell around AiImagePromptContent (the style grid), so the
     /components catalog can render the content without the dialog. -->
<dialog
  class="ai-prompt-modal modal-dialog modal-fly-in modal-shell"
  use:modalDialog={() => ({
    open: ui.aiPromptOpen,
    origin: ui.aiPromptOrigin,
    onRequestClose: closeAiPrompt,
    onOpen: loadPreview,
    onClose: cleanupPreview,
  })}
>
  <div class="ai-prompt-content">
    <button class="ai-prompt-close modal-close-btn" aria-label="Close" onclick={closeAiPrompt}>
      <Icon name="close" class="modal-close-icon" />
    </button>

    <AiImagePromptContent {previewUrl} onSelectStyle={handleSelectStyle} />
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

  .ai-prompt-close:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Short viewports (e.g. landscape on a small phone): trim chrome so the
     picker fits without forcing a scroll. The modal already scrolls via
     max-height/overflow-y, but tighter spacing keeps it from feeling cramped. */
  @media (max-height: 560px) {
    .ai-prompt-modal {
      max-height: 94vh;
    }
    .ai-prompt-content {
      padding: 16px 16px 14px;
    }
  }
</style>
