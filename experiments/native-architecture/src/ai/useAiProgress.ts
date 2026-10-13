import { useEffect, useState, useSyncExternalStore } from 'react';
import { createAiProgress, type AiProgressOwner, type AiProgressPresence } from './aiProgress';
import { aiRun } from './uiState';
import type { AiState } from './generation';

function presenceOf(state: AiState | null): AiProgressPresence {
  if (!state?.open) return 'hidden';
  return state.minimized ? 'corner' : 'sheet';
}

export function useAiProgressOwner(state: AiState | null): AiProgressOwner {
  const [owner] = useState(createAiProgress);
  const run = state ? aiRun(state) : null;
  const presence = presenceOf(state);
  useEffect(() => {
    owner.follow(run, presence);
    // The run is re-derived every render; only these fields change what the dial does.
  }, [owner, run?.id, run?.phase, presence]);
  useEffect(() => () => owner.dispose(), [owner]);
  return owner;
}

export function useAiProgress(owner: AiProgressOwner) {
  return useSyncExternalStore(owner.subscribe, owner.snapshot);
}
