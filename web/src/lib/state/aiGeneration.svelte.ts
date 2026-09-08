import type { StyleName } from '$lib/ai/styles';

export const AI_FAILURE_RETRY_LIMIT = 2;

export interface AiFailureDetails {
  status: number | null;
  endpoint: '/api/generate-image' | '/api/generation-result';
  message: string;
}

export type AiErrorKind = 'generic' | 'safety' | 'retry';

export interface AiResultState {
  drawing: Blob | null;
  consecutiveFailures: number;
  failureDetails: AiFailureDetails | null;
  generating: boolean;
  open: boolean;
  // Tucked into the corner so the child can keep drawing while the picture is
  // made (ADR-0116). The run is untouched — `open` stays true, which is what
  // keeps finishAiGeneration willing to deliver into it.
  minimized: boolean;
  resultUrl: string | null;
  resultType: string | null;
  previewUrl: string | null;
  style: StyleName | null;
  // Proof this AI attempt ran on this server, spent by the report flow. Safety
  // refusals receive the same proof without persisting evidence.
  // Null on the BYOK and managed paths, which carry their own credential.
  reportToken: string | null;
  // 'safety'  — the model refused the drawing; guide the child to draw something else.
  // 'retry'   — a transient failure (timeout, server); the same drawing may work.
  // 'generic' — anything else.
  error: { kind: AiErrorKind; message: string | null } | null;
}

export const aiResult: AiResultState = $state({
  drawing: null,
  consecutiveFailures: 0,
  failureDetails: null,
  generating: false,
  open: false,
  minimized: false,
  resultUrl: null,
  resultType: null,
  previewUrl: null,
  style: null,
  reportToken: null,
  error: null,
});

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

export function createAiGenerationMachine(resultState: AiResultState) {
  let nextAiGenerationId = 0;
  let activeAiGeneration: ActiveAiGeneration | null = null;

  function resetAiRunUi(previewUrl: string | null) {
    resultState.previewUrl = swapObjectUrl(resultState.previewUrl, previewUrl);
    resultState.resultUrl = swapObjectUrl(resultState.resultUrl);
    resultState.resultType = null;
    resultState.reportToken = null;
    resultState.error = null;
    resultState.failureDetails = null;
  }

  // Open the result modal in its loading state. `previewUrl` is an object URL of
  // the child's own drawing — shown blurred behind the progress dial while the
  // AI image is being generated.
  function startAiGeneration(
    previewUrl: string | null,
    controller = new AbortController(),
    style: StyleName | null = null
  ): number {
    activeAiGeneration?.controller.abort();
    const id = ++nextAiGenerationId;
    activeAiGeneration = { id, controller };
    resetAiRunUi(previewUrl);
    resultState.drawing = null;
    resultState.minimized = false;
    resultState.style = style;
    resultState.generating = true;
    resultState.open = true;
    return id;
  }

  function setAiDrawing(id: number, drawing: Blob) {
    if (isAiGenerationActive(id) && resultState.open) resultState.drawing = drawing;
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
    if (!isAiGenerationActive(id) || !resultState.open) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    resultState.previewUrl = swapObjectUrl(resultState.previewUrl, previewUrl);
  }

  // The finished image has arrived — hand it to the modal so the dial can race to
  // completion and reveal it.
  function finishAiGeneration(
    id: number,
    url: string,
    imageType: string,
    reportToken: string | null = null
  ): boolean {
    if (!isAiGenerationActive(id) || !resultState.open) {
      URL.revokeObjectURL(url);
      return false;
    }
    resultState.consecutiveFailures = 0;
    resultState.drawing = null;
    resultState.resultUrl = swapObjectUrl(resultState.resultUrl, url);
    resultState.resultType = imageType;
    resultState.reportToken = reportToken;
    resultState.generating = false;
    return true;
  }

  function failAiGeneration(
    id: number,
    message?: string,
    kind: AiErrorKind = 'generic',
    reportToken: string | null = null,
    details: AiFailureDetails | null = null
  ) {
    if (!isAiGenerationActive(id) || !resultState.open) return;
    resultState.generating = false;
    resultState.reportToken = reportToken;
    resultState.error = { kind, message: message ?? null };
    resultState.consecutiveFailures = kind === 'safety' ? 0 : resultState.consecutiveFailures + 1;
    resultState.failureDetails = details;
  }

  function closeAiResult() {
    activeAiGeneration?.controller.abort();
    activeAiGeneration = null;
    resultState.open = false;
    resultState.generating = false;
    resultState.minimized = false;
    resultState.style = null;
    resultState.drawing = null;
    resultState.consecutiveFailures = 0;
    resetAiRunUi(null);
  }

  /**
   * Send the waiting modal to the corner. Only meaningful while a picture is
   * still being made — once there is something to look at, dismissing means
   * dismissing.
   */
  function minimizeAiResult() {
    if (!resultState.open || !resultState.generating) return;
    resultState.minimized = true;
  }

  function restoreAiResult() {
    resultState.minimized = false;
  }

  return {
    startAiGeneration,
    isAiGenerationActive,
    endAiGeneration,
    setAiPreview,
    setAiDrawing,
    finishAiGeneration,
    failAiGeneration,
    closeAiResult,
    minimizeAiResult,
    restoreAiResult,
  };
}

const aiGenerationMachine = createAiGenerationMachine(aiResult);

export const {
  startAiGeneration,
  isAiGenerationActive,
  endAiGeneration,
  setAiPreview,
  setAiDrawing,
  finishAiGeneration,
  failAiGeneration,
  closeAiResult,
  minimizeAiResult,
  restoreAiResult,
} = aiGenerationMachine;
