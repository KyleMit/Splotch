import type { StyleName } from '$lib/ai/styles';
import type { SaveResult } from '$lib/saveNaming';

export const AI_FAILURE_RETRY_LIMIT = 2;

export interface AiFailureDetails {
  status: number | null;
  endpoint: '/api/generate-image' | '/api/generation-result';
  message: string;
}

type AiErrorKind = 'generic' | 'safety' | 'retry';

export type AiAutoSave = { status: 'saving' } | SaveResult;

export interface AiResultState {
  readonly drawing: Blob | null;
  readonly consecutiveFailures: number;
  readonly failureDetails: AiFailureDetails | null;
  readonly generating: boolean;
  readonly open: boolean;
  // Tucked into the corner so the child can keep drawing while the picture is
  // made (ADR-0116). The run is untouched — `open` stays true, which is what
  // keeps finishAiGeneration willing to deliver into it.
  readonly minimized: boolean;
  readonly resultUrl: string | null;
  readonly resultType: string | null;
  // Where auto-save put the finished picture, so the result card only claims what happened.
  // Null when no auto-save ran for this run, whatever the setting says now.
  readonly autoSave: AiAutoSave | null;
  readonly previewUrl: string | null;
  readonly style: StyleName | null;
  // Proof this AI attempt ran on this server, spent by the report flow. Safety
  // refusals receive the same proof without persisting evidence.
  // Null on the BYOK and managed paths, which carry their own credential.
  readonly reportToken: string | null;
  // 'safety'  — the model refused the drawing; guide the child to draw something else.
  // 'retry'   — a transient failure (timeout, server); the same drawing may work.
  // 'generic' — anything else.
  readonly error: { kind: AiErrorKind; message: string | null } | null;
}

interface AiGenerationMachine {
  startAiGeneration(
    previewUrl: string | null,
    controller?: AbortController,
    style?: StyleName | null
  ): number;
  isAiGenerationActive(id: number): boolean;
  endAiGeneration(id: number): void;
  setAiPreview(id: number, previewUrl: string): void;
  setAiDrawing(id: number, drawing: Blob): void;
  finishAiGeneration(
    id: number,
    url: string,
    imageType: string,
    reportToken?: string | null
  ): boolean;
  setAiAutoSave(id: number, autoSave: AiAutoSave): void;
  failAiGeneration(
    id: number,
    message?: string,
    kind?: AiErrorKind,
    reportToken?: string | null,
    details?: AiFailureDetails | null
  ): void;
  closeAiResult(): void;
  minimizeAiResult(): void;
  restoreAiResult(): void;
}

export type AiGenerationState = AiResultState & AiGenerationMachine;

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

export function createAiGeneration(): AiGenerationState {
  const s = $state<{
    drawing: Blob | null;
    consecutiveFailures: number;
    failureDetails: AiFailureDetails | null;
    generating: boolean;
    open: boolean;
    minimized: boolean;
    resultUrl: string | null;
    resultType: string | null;
    autoSave: AiAutoSave | null;
    previewUrl: string | null;
    style: StyleName | null;
    reportToken: string | null;
    error: { kind: AiErrorKind; message: string | null } | null;
  }>({
    drawing: null,
    consecutiveFailures: 0,
    failureDetails: null,
    generating: false,
    open: false,
    minimized: false,
    resultUrl: null,
    resultType: null,
    autoSave: null,
    previewUrl: null,
    style: null,
    reportToken: null,
    error: null,
  });

  // Deliberately untracked: run ownership that nothing renders.
  let nextAiGenerationId = 0;
  let activeAiGeneration: ActiveAiGeneration | null = null;

  function resetAiRunUi(previewUrl: string | null) {
    s.previewUrl = swapObjectUrl(s.previewUrl, previewUrl);
    s.resultUrl = swapObjectUrl(s.resultUrl);
    s.resultType = null;
    s.autoSave = null;
    s.reportToken = null;
    s.error = null;
    s.failureDetails = null;
  }

  function isAiGenerationActive(id: number): boolean {
    return activeAiGeneration?.id === id;
  }

  return {
    get drawing() {
      return s.drawing;
    },
    get consecutiveFailures() {
      return s.consecutiveFailures;
    },
    get failureDetails() {
      return s.failureDetails;
    },
    get generating() {
      return s.generating;
    },
    get open() {
      return s.open;
    },
    get minimized() {
      return s.minimized;
    },
    get resultUrl() {
      return s.resultUrl;
    },
    get resultType() {
      return s.resultType;
    },
    get autoSave() {
      return s.autoSave;
    },
    get previewUrl() {
      return s.previewUrl;
    },
    get style() {
      return s.style;
    },
    get reportToken() {
      return s.reportToken;
    },
    get error() {
      return s.error;
    },
    // Open the result modal in its loading state. `previewUrl` is an object URL of
    // the child's own drawing — shown blurred behind the progress dial while the
    // AI image is being generated.
    startAiGeneration(previewUrl, controller = new AbortController(), style = null) {
      activeAiGeneration?.controller.abort();
      const id = ++nextAiGenerationId;
      activeAiGeneration = { id, controller };
      resetAiRunUi(previewUrl);
      s.drawing = null;
      s.minimized = false;
      s.style = style;
      s.generating = true;
      s.open = true;
      return id;
    },
    isAiGenerationActive,
    endAiGeneration(id) {
      if (isAiGenerationActive(id)) activeAiGeneration = null;
    },
    // Slot the blurred drawing in behind the dial once it's ready. Used when the
    // modal was opened ahead of the canvas export (so the spinner launches on tap),
    // then the preview arrives a beat later.
    setAiPreview(id, previewUrl) {
      if (!isAiGenerationActive(id) || !s.open) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      s.previewUrl = swapObjectUrl(s.previewUrl, previewUrl);
    },
    setAiDrawing(id, drawing) {
      if (isAiGenerationActive(id) && s.open) s.drawing = drawing;
    },
    // The finished image has arrived — hand it to the modal so the dial can race to
    // completion and reveal it.
    finishAiGeneration(id, url, imageType, reportToken = null) {
      if (!isAiGenerationActive(id) || !s.open) {
        URL.revokeObjectURL(url);
        return false;
      }
      s.consecutiveFailures = 0;
      s.drawing = null;
      s.resultUrl = swapObjectUrl(s.resultUrl, url);
      s.resultType = imageType;
      s.reportToken = reportToken;
      s.generating = false;
      return true;
    },
    setAiAutoSave(id, autoSave) {
      if (isAiGenerationActive(id) && s.open) s.autoSave = autoSave;
    },
    failAiGeneration(id, message, kind = 'generic', reportToken = null, details = null) {
      if (!isAiGenerationActive(id) || !s.open) return;
      s.generating = false;
      s.reportToken = reportToken;
      s.error = { kind, message: message ?? null };
      s.consecutiveFailures = kind === 'safety' ? 0 : s.consecutiveFailures + 1;
      s.failureDetails = details;
    },
    closeAiResult() {
      activeAiGeneration?.controller.abort();
      activeAiGeneration = null;
      s.open = false;
      s.generating = false;
      s.minimized = false;
      s.style = null;
      s.drawing = null;
      s.consecutiveFailures = 0;
      resetAiRunUi(null);
    },
    /**
     * Send the waiting modal to the corner. Only meaningful while a picture is
     * still being made — once there is something to look at, dismissing means
     * dismissing.
     */
    minimizeAiResult() {
      if (!s.open || !s.generating) return;
      s.minimized = true;
    },
    restoreAiResult() {
      s.minimized = false;
    },
  };
}

export const aiGenerationState = createAiGeneration();

export const {
  startAiGeneration,
  isAiGenerationActive,
  endAiGeneration,
  setAiPreview,
  setAiDrawing,
  finishAiGeneration,
  setAiAutoSave,
  failAiGeneration,
  closeAiResult,
  minimizeAiResult,
  restoreAiResult,
} = aiGenerationState;
