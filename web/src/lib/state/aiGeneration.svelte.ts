import { ui, type UiState } from './ui.svelte';

export type AiErrorKind = 'generic' | 'safety' | 'retry';

interface ActiveAiGeneration {
  id: number;
  controller: AbortController;
}

// Revoke the outgoing object URL (when there is one and it's actually being
// replaced) and return the incoming one, so a single assignment swaps the value
// without leaking the old blob. Call with `next` omitted to revoke and clear.
function swapObjectUrl(prev: string | null, next: string | null = null): string | null {
  if (prev && prev !== next) URL.revokeObjectURL(prev);
  return next;
}

export function createAiGenerationMachine(uiState: UiState) {
  let nextAiGenerationId = 0;
  let activeAiGeneration: ActiveAiGeneration | null = null;

  function resetAiRunUi(previewUrl: string | null) {
    uiState.aiPreviewUrl = swapObjectUrl(uiState.aiPreviewUrl, previewUrl);
    uiState.aiResultUrl = swapObjectUrl(uiState.aiResultUrl);
    uiState.aiError = false;
    uiState.aiErrorMessage = null;
    uiState.aiErrorKind = 'generic';
  }

  // Open the result modal in its loading state. `previewUrl` is an object URL of
  // the child's own drawing — shown blurred behind the progress dial while the
  // AI image is being generated.
  function startAiGeneration(
    previewUrl: string | null,
    controller = new AbortController()
  ): number {
    activeAiGeneration?.controller.abort();
    const id = ++nextAiGenerationId;
    activeAiGeneration = { id, controller };
    resetAiRunUi(previewUrl);
    uiState.aiGenerating = true;
    uiState.aiResultOpen = true;
    return id;
  }

  function isAiGenerationActive(id: number): boolean {
    return activeAiGeneration?.id === id;
  }

  function endAiGeneration(id: number) {
    if (isAiGenerationActive(id)) activeAiGeneration = null;
  }

  // Slot the blurred drawing in behind the dial once it's ready. Used when the
  // modal was opened ahead of the canvas export (so the spinner launches on tap),
  // then the preview arrives a beat later.
  function setAiPreview(id: number, previewUrl: string) {
    if (!isAiGenerationActive(id) || !uiState.aiResultOpen) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    uiState.aiPreviewUrl = swapObjectUrl(uiState.aiPreviewUrl, previewUrl);
  }

  // The finished image has arrived — hand it to the modal so the dial can race to
  // completion and reveal it.
  function finishAiGeneration(id: number, url: string): boolean {
    if (!isAiGenerationActive(id) || !uiState.aiResultOpen) {
      URL.revokeObjectURL(url);
      return false;
    }
    uiState.aiResultUrl = swapObjectUrl(uiState.aiResultUrl, url);
    uiState.aiGenerating = false;
    return true;
  }

  function failAiGeneration(id: number, message?: string, kind: AiErrorKind = 'generic') {
    if (!isAiGenerationActive(id) || !uiState.aiResultOpen) return;
    uiState.aiGenerating = false;
    uiState.aiError = true;
    uiState.aiErrorMessage = message ?? null;
    uiState.aiErrorKind = kind;
  }

  function closeAiResult() {
    activeAiGeneration?.controller.abort();
    activeAiGeneration = null;
    uiState.aiResultOpen = false;
    uiState.aiGenerating = false;
    resetAiRunUi(null);
  }

  return {
    startAiGeneration,
    isAiGenerationActive,
    endAiGeneration,
    setAiPreview,
    finishAiGeneration,
    failAiGeneration,
    closeAiResult,
  };
}

const aiGenerationMachine = createAiGenerationMachine(ui);

export const {
  startAiGeneration,
  isAiGenerationActive,
  endAiGeneration,
  setAiPreview,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult,
} = aiGenerationMachine;
