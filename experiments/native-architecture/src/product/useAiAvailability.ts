import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { NativeAiOwner } from '../ai/generation';
import type { SoundSettingsState } from '../settings/soundSettingsCodec';

// The AI Image Button's checking, unavailable and free-count states follow the free allowance
// whenever AI image creation is on, as shipping's free grant does (freeGenerations.svelte.ts).
// Turning AI on looks at the allowance; a reconnect looks again only for an allowance not yet
// known, as shipping's followEligibility does, and so does coming back to the foreground, as its
// retryOnVisibleReturn does.
export function useAiAvailability(
  owner: NativeAiOwner | null,
  settings: Pick<SoundSettingsState, 'status' | 'aiEnabled'>,
  online: boolean
) {
  const aiOn = settings.status !== 'loading' && settings.aiEnabled;
  const enabled = online && aiOn;
  const turnedOn = useRef(false);
  useEffect(() => {
    turnedOn.current = !!owner && aiOn;
  }, [owner, aiOn]);
  useEffect(() => {
    if (!owner || !enabled) return;
    if (turnedOn.current || owner.getState().availability !== 'ready') void owner.inspect();
    turnedOn.current = false;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && owner.getState().availability !== 'ready') void owner.inspect();
    });
    return () => subscription.remove();
  }, [owner, enabled]);
}
