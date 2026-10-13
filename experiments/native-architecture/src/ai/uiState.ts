import type { AiState } from './generation';
import type { AiResult } from './journal';
export function aiCanGenerate(state: AiState) {
  if (state.recovery) return false;
  return (
    state.authorized &&
    !state.busy &&
    state.credential !== 'unavailable' &&
    (state.credential !== 'free' || (state.remaining !== null && state.remaining > 0)) &&
    (!state.journal || state.journal.phase === 'result' || state.journal.phase === 'failed') &&
    state.retryAt <= Date.now()
  );
}

export function aiJournalWaiting(state: AiState) {
  return !!state.journal && !['result', 'failed'].includes(state.journal.phase);
}

export function aiSheetShown(state: AiState) {
  return state.open && !state.minimized;
}

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
// its progress dial see it.
export function aiRun(state: AiState): AiRun | null {
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

export const AI_RESULT_HEIGHT_PX = 256;
