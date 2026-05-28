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
