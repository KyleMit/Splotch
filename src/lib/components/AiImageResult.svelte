<script>
  import { ui, closeAiResult } from '$lib/state/ui.svelte.js';

  let dialogEl;

  $effect(() => {
    if (!dialogEl) return;
    if (ui.aiResultOpen) {
      if (!dialogEl.open) dialogEl.showModal();
    } else {
      if (dialogEl.open) dialogEl.close();
    }
  });

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function handleDownload() {
    if (!ui.aiResultUrl) return;
    const a = document.createElement('a');
    a.href = ui.aiResultUrl;
    a.download = `splotch-ai-${timestamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleDialogPointerDown(e) {
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      closeAiResult();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleDialogClose() {
    if (ui.aiResultOpen) closeAiResult();
  }
</script>

<dialog
  class="ai-result-modal"
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
>
  <div class="ai-result-content">
    <button class="ai-result-close" aria-label="Close" onclick={closeAiResult}>
      <img src="/icons/close.svg" alt="" />
    </button>

    {#if ui.aiResultUrl}
      <img class="ai-result-image" src={ui.aiResultUrl} alt="" />
      <button class="ai-result-download" aria-label="Download" onclick={handleDownload}>
        <img src="/icons/download.svg" alt="" />
      </button>
    {/if}
  </div>
</dialog>

<style>
  .ai-result-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 640px;
    width: 90%;
    max-height: 85vh;
    overflow: hidden;
    padding: 0;
  }

  .ai-result-modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .ai-result-content {
    padding: 32px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .ai-result-close {
    position: absolute;
    top: 16px;
    right: 16px;
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

  .ai-result-close img {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(85%);
    transition: filter 0.2s ease;
  }

  .ai-result-close:hover img {
    filter: invert(30%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  .ai-result-image {
    max-width: 100%;
    max-height: 60vh;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .ai-result-download {
    width: 56px;
    height: 56px;
    background: #AB71E1;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    box-shadow: 0 4px 12px rgba(171, 113, 225, 0.4);
    transition: transform 0.15s ease, background 0.2s ease;
  }

  .ai-result-download:hover { background: #9559cd; }
  .ai-result-download:active { transform: scale(0.95); }

  .ai-result-download img {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(100%);
  }
</style>
