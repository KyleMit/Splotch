import type { AiState } from './generation';
import type { AiResult } from './journal';
import { FREE_GENERATION_LIMIT } from '../../../../web/src/lib/freeGenerations';
// What the AI Image Button, the prompt and the result card start from before any read or run.
export const AI_FLOW_IDLE = {
  view: 'prompt',
  attempt: null,
  failure: null,
  problem: null,
  availability: 'loading',
  failures: 0,
} as const satisfies Partial<AiState>;

export function aiJournalWaiting(state: AiState) {
  return !!state.journal && !['result', 'failed'].includes(state.journal.phase);
}

export function aiSheetShown(state: AiState) {
  return state.open && !state.minimized;
}

// Shipping's AI_FAILURE_RETRY_LIMIT (state/aiGeneration.svelte.ts), which a rune module keeps out
// of reach; native-ai-flow.test.mjs reads it there.
export const AI_FAILURE_RETRY_LIMIT = 2;

export const AI_RESULT_HEIGHT_PX = 256;

function aiCurrentPicture(state: AiState): AiResult | null {
  return state.heldResult ?? state.journal?.result ?? null;
}

export type AiRun = Readonly<{
  id: number;
  startedAt: number;
  phase: 'waiting' | 'arrived' | 'failed';
  submitted: string | null;
  picture: AiResult | null;
}>;

// The picture this session is making or has just made, as the waiting print and
// its progress dial see it. A run still being prepared has no journal yet, and one
// that stopped before it had a journal has nothing to show.
export function aiRun(state: AiState): AiRun | null {
  const attempt = state.attempt;
  if (attempt?.kind === 'starting')
    return {
      id: attempt.startedAt,
      startedAt: attempt.startedAt,
      phase: 'waiting',
      submitted: null,
      picture: null,
    };
  if (attempt?.kind === 'stopped') return null;
  const journal = state.journal;
  if (!journal) return null;
  const picture = aiCurrentPicture(state);
  return {
    id: journal.id,
    startedAt: journal.createdAt,
    phase: picture ? 'arrived' : journal.phase === 'failed' ? 'failed' : 'waiting',
    submitted: state.submitted?.id === journal.id ? state.submitted.uri : null,
    picture,
  };
}

// Why the AI Result shows no picture: a refusal guides the child to draw something else; `retry`
// offers Try again; `rest` is shipping's repeated-failure card, which this app also shows while a
// saved recovery record or a throttled allowance check holds the wand.
export type AiErrorReason = 'safety' | 'retry' | 'rest';
export type AiResultPhase =
  | Readonly<{ kind: 'generating' }>
  | Readonly<{ kind: 'result'; picture: AiResult }>
  | Readonly<{ kind: 'error'; reason: AiErrorReason }>;

function failedReason(state: AiState): AiErrorReason {
  return state.failures >= AI_FAILURE_RETRY_LIMIT ? 'rest' : 'retry';
}

// What the AI Result card shows for its run, as shipping's aiGenerationState.phase names it.
export function aiResultPhase(state: AiState): AiResultPhase {
  const attempt = state.attempt;
  if (attempt?.kind === 'starting') return { kind: 'generating' };
  if (!attempt || attempt.kind === 'stopped')
    return {
      kind: 'error',
      reason: state.recovery || state.retryAt > Date.now() ? 'rest' : failedReason(state),
    };
  const journal = state.journal;
  if (journal?.id !== attempt.id) return { kind: 'error', reason: 'rest' };
  const picture = aiCurrentPicture(state);
  if (picture) return { kind: 'result', picture };
  if (journal.phase === 'failed')
    return {
      kind: 'error',
      reason: state.refusal?.id === journal.id ? 'safety' : failedReason(state),
    };
  // A run neither sending nor waiting on a ticket has nothing left to collect.
  return state.busy || journal.jobId ? { kind: 'generating' } : { kind: 'error', reason: 'rest' };
}

export type AiCornerFace = 'waiting' | 'ready' | 'failed';

// The Waiting Polaroid's face for a minimized run.
export function aiCornerFace(state: AiState): AiCornerFace {
  const phase = aiResultPhase(state);
  if (phase.kind === 'generating') return 'waiting';
  return phase.kind === 'result' ? 'ready' : 'failed';
}

function hasCredential(state: AiState | null) {
  return state?.credential === 'byok' || state?.credential === 'managed';
}

const MINIMIZED_RUN_LABELS: Record<AiCornerFace, string> = {
  waiting: 'Show the picture being made',
  failed: "Show what didn't work",
  ready: 'Show your finished picture',
};

function aiButtonLabel(state: AiState | null) {
  if (state?.open && state.minimized) return MINIMIZED_RUN_LABELS[aiCornerFace(state)];
  if (!state || !aiReady(state))
    return state?.availability === 'unavailable'
      ? 'AI image unavailable'
      : 'Checking AI image availability';
  if (hasCredential(state) || state.remaining === null) return 'Create AI image';
  return state.remaining > 0 ? `Create AI image, ${state.remaining} free left` : 'Set up AI image';
}

export type AiButtonFace = Readonly<{
  label: string;
  disabled: boolean;
  // A run is being made with its card open: the wand turns into the spinner.
  busy: boolean;
  // The free pictures left, shown on the button's corner; null with a saved credential or no
  // known allowance.
  badge: number | null;
}>;

// The owner takes no tap while inspect() reads the allowance, so the button says Checking then, as
// shipping's does while its grant request is in flight.
function aiReady(state: AiState | null) {
  return !!state && state.availability === 'ready' && !state.checking;
}

// The shipping AI Image Button's states (AiImageButton.svelte). A minimized run is the one time a
// generation is in flight and the button is live: it is what shows that run again, so neither the
// generation nor an empty canvas can disable it.
export function aiButtonFace(state: AiState | null, canvasEmpty: boolean): AiButtonFace {
  const minimized = !!state?.open && state.minimized;
  const busy =
    !!state?.open &&
    !minimized &&
    state.view === 'result' &&
    aiResultPhase(state).kind === 'generating';
  const usable = aiReady(state);
  return {
    label: aiButtonLabel(state),
    disabled: !minimized && (!usable || canvasEmpty || busy),
    busy,
    badge:
      hasCredential(state) || state?.availability === 'unavailable'
        ? null
        : (state?.remaining ?? FREE_GENERATION_LIMIT),
  };
}
