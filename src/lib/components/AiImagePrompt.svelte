<script>
  import { ui, closeAiPrompt, openAiResult } from '$lib/state/ui.svelte.js';
  import { settings } from '$lib/state/settings.svelte.js';
  import { exportCanvasBlob } from '$lib/drawing/engine.js';
  import { getActiveOverlayImage } from '$lib/drawing/overlay.js';

  const DEFAULT_PROMPT = "Create a cute scene or character based on this child's drawing";
  const STYLES = ['Watercolor', 'Felted', 'Crayons'];

  let dialogEl;
  let previewUrl = $state(null);
  let drawingBlob = null;
  let prompt = $state('');
  let style = $state('');
  let generating = $state(false);
  let errorMsg = $state(null);

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
        errorMsg = null;
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

  async function handleGenerate() {
    if (generating || !drawingBlob) return;
    generating = true;
    errorMsg = null;
    ui.aiGenerating = true;
    try {
      const form = new FormData();
      form.append('token', settings.aiAccessToken);
      form.append('image', drawingBlob, 'drawing.png');
      if (prompt.trim()) form.append('prompt', prompt.trim());
      if (style) form.append('style', style);

      const res = await fetch('/api/generate-image', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(`AI image request failed (${res.status}): ${msg}`);
      }
      const outBlob = await res.blob();
      openAiResult(URL.createObjectURL(outBlob));
      closeAiPrompt();
    } catch (err) {
      console.error(err);
      errorMsg = "Sorry, that didn't work. Please try again.";
    } finally {
      generating = false;
      ui.aiGenerating = false;
    }
  }

  function handleDialogPointerDown(e) {
    if (generating) return;
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
    <button class="ai-prompt-close" aria-label="Close" onclick={closeAiPrompt} disabled={generating}>
      <img src="/icons/close.svg" alt="" />
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
      disabled={generating}
    ></textarea>

    <fieldset class="ai-prompt-styles" disabled={generating}>
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

    {#if errorMsg}
      <p class="ai-prompt-error">{errorMsg}</p>
    {/if}

    <button
      class="ai-prompt-generate"
      onclick={handleGenerate}
      disabled={generating || !previewUrl}
    >
      <img
        src={generating ? '/icons/loading.svg' : '/icons/wand-stars.svg'}
        alt=""
        class="ai-prompt-generate-icon"
        class:spin={generating}
      />
      <span>{generating ? 'Generating…' : 'Generate'}</span>
    </button>
  </div>
</dialog>
