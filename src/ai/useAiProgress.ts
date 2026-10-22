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
  // The run is re-derived every render, so the dial follows the fields it reads rather than the
  // object that carries them.
  const id = run?.id ?? null;
  const startedAt = run?.startedAt ?? null;
  const phase = run?.phase ?? null;
  useEffect(() => {
    owner.follow(
      id === null || startedAt === null || phase === null ? null : { id, startedAt, phase },
      presence
    );
  }, [owner, id, startedAt, phase, presence]);
  useEffect(() => () => owner.dispose(), [owner]);
  return owner;
}

export function useAiProgress(owner: AiProgressOwner) {
  return useSyncExternalStore(owner.subscribe, owner.snapshot, owner.snapshot);
}
