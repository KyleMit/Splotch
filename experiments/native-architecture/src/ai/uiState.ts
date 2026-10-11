import type { AiState } from './generation';
export function aiCanGenerate(state: AiState) {
  return (
    state.authorized &&
    !state.busy &&
    state.credential !== 'unavailable' &&
    (state.credential !== 'free' || (state.remaining !== null && state.remaining > 0)) &&
    (!state.journal || state.journal.phase === 'result' || state.journal.phase === 'failed') &&
    state.retryAt <= Date.now()
  );
}

export const AI_RESULT_HEIGHT_PX = 256;
