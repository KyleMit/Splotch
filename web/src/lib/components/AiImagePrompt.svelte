<script lang="ts">
  import Icon from './Icon.svelte';
  import { aiPromptModal } from '$lib/state/ui.svelte';
  import { exportCanvasBlob } from '$lib/drawing/engine';
  import { generateAiImage } from '$lib/drawing/aiImage';
  import {
    STYLE_NAMES,
    type StyleName,
    hasPunchedBackground,
    styleThumbPath,
  } from '$lib/ai/styles';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { createAiPreviewLoader } from './aiPreview';

  let drawingBlob = $state<Blob | null>(null);

  // The covers are forked art, not a filtered light asset — each theme has its
  // own Gemini render (see tools/asset-gen/bin/gen-style-covers.mjs).
  const theme = $derived(resolvedTheme());

  const previewLoader = createAiPreviewLoader(
    () => exportCanvasBlob({ includePaperTexture: false }),
    (blob) => (drawingBlob = blob)
  );

  async function loadPreview() {
    cleanupPreview();
    await previewLoader.load();
  }

  function cleanupPreview() {
    previewLoader.invalidate();
    drawingBlob = null;
  }

  // The modalDialog action's onClose only invalidates on an explicit close.
  // This teardown prevents a late export from committing after unmount.
  $effect(() => () => cleanupPreview());

  function handleSelectStyle(style: StyleName) {
    if (!drawingBlob) return;
    // Picking a style immediately hands off to the result modal, which shows
    // the progress dial (and any error) over the blurred drawing.
    const blob = drawingBlob;
    aiPromptModal.hide();
    generateAiImage({ drawing: blob, style });
  }
</script>

<dialog
  class="ai-prompt-modal modal-dialog modal-fly-in modal-shell"
  use:modalDialog={() => ({
    open: aiPromptModal.open,
    origin: aiPromptModal.origin,
    onRequestClose: aiPromptModal.hide,
    onOpen: loadPreview,
    onClose: cleanupPreview,
  })}
>
  <div class="ai-prompt-content">
    <button class="ai-prompt-close modal-close-btn" aria-label="Close" onclick={aiPromptModal.hide}>
      <Icon name="close" class="modal-close-icon" />
    </button>

    <fieldset class="ai-prompt-styles">
      <legend>Pick a style</legend>
      <div class="ai-style-options">
        {#each STYLE_NAMES as s (s)}
          {@const thumb = styleThumbPath(s, theme)}
          <button
            type="button"
            class="ai-style-option"
            onclick={() => handleSelectStyle(s)}
            disabled={!drawingBlob}
          >
            <img
              class="ai-style-thumb"
              class:ai-style-thumb-cutout={hasPunchedBackground(s)}
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
            />
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

  .ai-prompt-styles {
    border: none;
    padding: 0;
    margin: 0;
  }

  .ai-prompt-styles legend {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
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
    border-radius: var(--radius-md);
    border: 3px solid transparent;
    transition:
      border-color var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  /* An opaque cover gets a paper plate to fill the tile before it decodes. A
     cutout must NOT: `filter` rasterizes the element's own background along with
     its content, so a plate here would hand drop-shadow the rounded tile to
     trace instead of the sticker silhouette — and the transparency exists
     precisely so the picker's own surface shows through. */
  .ai-style-thumb:not(.ai-style-thumb-cutout) {
    background: var(--paper);
  }

  /* Replaces the shadow the render used to bake in, where it can follow the
     silhouette and the theme rather than sitting on a plate. */
  .ai-style-thumb-cutout {
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.28));
  }

  .ai-style-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    user-select: none;
  }

  @media (hover: hover) {
    .ai-style-option:hover:not(:disabled) .ai-style-thumb {
      border-color: var(--brand);
      transform: translateY(-2px);
    }

    .ai-style-option:hover:not(:disabled) .ai-style-label {
      color: var(--brand);
    }
  }

  .ai-style-option:active:not(:disabled) .ai-style-thumb {
    transform: scale(0.97);
  }

  .ai-style-option:focus-visible {
    outline: none;
  }

  .ai-style-option:focus-visible .ai-style-thumb {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.35);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 35%, transparent);
  }

  .ai-style-option:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 420px) {
    .ai-style-options {
      grid-template-columns: repeat(2, 1fr);
    }
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
      gap: 10px;
    }
    .ai-prompt-styles legend {
      margin-bottom: 8px;
    }
    .ai-style-options {
      gap: 8px;
    }
  }
</style>
