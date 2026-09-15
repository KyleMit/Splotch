import type { StyleName } from '$lib/ai/styles';
import type { SaveResult } from '$lib/saveNaming';
import { demandOverlay } from './overlayDemand';

export const AI_FAILURE_RETRY_LIMIT = 2;

export interface AiFailureDetails {
  status: number | null;
  endpoint: '/api/generate-image' | '/api/generation-result';
  message: string;
}

// 'safety'  — the model refused the drawing; guide the child to draw something else.
// 'retry'   — a transient failure (timeout, server); the same drawing may work.
// 'generic' — anything else.
type AiErrorKind = 'generic' | 'safety' | 'retry';

export type AiAutoSave = { status: 'saving' } | SaveResult;

// Where a run is. One value, so a result and an error cannot both be on
// screen, a picture cannot exist while generating, and every consumer branches
// on `kind` rather than re-deriving the phase from a handful of fields.
type AiPhase =
  | { kind: 'closed' }
  | { kind: 'generating' }
  | {
      kind: 'result';
      url: string;
      type: string;
      // Proof this AI attempt ran on this server, spent by the report flow.
      // Null on the BYOK and managed paths, which carry their own credential.
      reportToken: string | null;
      // Where auto-save put the finished picture, so the result card only claims
      // what happened. Null when no auto-save ran for this run.
      autoSave: AiAutoSave | null;
    }
  | {
      kind: 'error';
      errorKind: AiErrorKind;
      message: string | null;
      // Safety refusals receive the same proof as a picture, without persisting evidence.
      reportToken: string | null;
      details: AiFailureDetails | null;
    };

// The phase the result card's error section renders; exported for its props.
export type AiErrorPhase = Extract<AiPhase, { kind: 'error' }>;

export interface AiResultState {
  readonly phase: AiPhase;
  // Tucked into the corner so the child can keep drawing while the picture is
  // made (ADR-0116). The run is untouched — the phase stays 'generating', which
  // is what keeps finishAiGeneration willing to deliver into it.
  readonly minimized: boolean;
  readonly consecutiveFailures: number;
  // The run's own inputs, kept beside the phase because they outlive it within
  // the run: the drawing a retry resends, the preview shown behind the dial and
  // the result alike, and the style the picture was asked for.
  readonly drawing: Blob | null;
  readonly previewUrl: string | null;
  readonly style: StyleName | null;
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
    phase: AiPhase;
    minimized: boolean;
    consecutiveFailures: number;
    drawing: Blob | null;
    previewUrl: string | null;
    style: StyleName | null;
  }>({
    phase: { kind: 'closed' },
    minimized: false,
    consecutiveFailures: 0,
    drawing: null,
    previewUrl: null,
    style: null,
  });

  // Deliberately untracked: run ownership that nothing renders.
  let nextAiGenerationId = 0;
  let activeAiGeneration: ActiveAiGeneration | null = null;

  function isAiGenerationActive(id: number): boolean {
    return activeAiGeneration?.id === id;
  }

  function open(): boolean {
    return s.phase.kind !== 'closed';
  }

  // Leaving the result phase releases its picture; nothing else holds an object URL.
  function leavePhase(next: AiPhase) {
    if (s.phase.kind === 'result') swapObjectUrl(s.phase.url);
    s.phase = next;
  }

  return {
    get phase() {
      return s.phase;
    },
    get minimized() {
      return s.minimized;
    },
    get consecutiveFailures() {
      return s.consecutiveFailures;
    },
    get drawing() {
      return s.drawing;
    },
    get previewUrl() {
      return s.previewUrl;
    },
    get style() {
      return s.style;
    },
    // Open the result modal in its loading state. `previewUrl` is an object URL of
    // the child's own drawing — shown blurred behind the progress dial while the
    // AI image is being generated.
    startAiGeneration(previewUrl, controller = new AbortController(), style = null) {
      activeAiGeneration?.controller.abort();
      const id = ++nextAiGenerationId;
      activeAiGeneration = { id, controller };
      s.previewUrl = swapObjectUrl(s.previewUrl, previewUrl);
      s.drawing = null;
      s.minimized = false;
      s.style = style;
      leavePhase({ kind: 'generating' });
      demandOverlay('aiResult');
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
      if (!isAiGenerationActive(id) || !open()) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      s.previewUrl = swapObjectUrl(s.previewUrl, previewUrl);
    },
    setAiDrawing(id, drawing) {
      if (isAiGenerationActive(id) && open()) s.drawing = drawing;
    },
    // The finished image has arrived — hand it to the modal so the dial can race to
    // completion and reveal it.
    finishAiGeneration(id, url, imageType, reportToken = null) {
      if (!isAiGenerationActive(id) || !open()) {
        URL.revokeObjectURL(url);
        return false;
      }
      s.consecutiveFailures = 0;
      s.drawing = null;
      leavePhase({ kind: 'result', url, type: imageType, reportToken, autoSave: null });
      return true;
    },
    setAiAutoSave(id, autoSave) {
      if (!isAiGenerationActive(id) || s.phase.kind !== 'result') return;
      s.phase = { ...s.phase, autoSave };
    },
    failAiGeneration(id, message, kind = 'generic', reportToken = null, details = null) {
      if (!isAiGenerationActive(id) || !open()) return;
      s.consecutiveFailures = kind === 'safety' ? 0 : s.consecutiveFailures + 1;
      leavePhase({
        kind: 'error',
        errorKind: kind,
        message: message ?? null,
        reportToken,
        details,
      });
    },
    closeAiResult() {
      activeAiGeneration?.controller.abort();
      activeAiGeneration = null;
      leavePhase({ kind: 'closed' });
      s.minimized = false;
      s.style = null;
      s.drawing = null;
      s.consecutiveFailures = 0;
      s.previewUrl = swapObjectUrl(s.previewUrl);
    },
    /**
     * Send the waiting modal to the corner. Only meaningful while a picture is
     * still being made — once there is something to look at, dismissing means
     * dismissing.
     */
    minimizeAiResult() {
      if (s.phase.kind !== 'generating') return;
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
