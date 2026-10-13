import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { NativeAiOwner } from '../ai/generation';
import type { SoundSettingsState } from '../settings/soundSettingsCodec';

// The AI Image Button's checking, unavailable and free-count states follow the free allowance
// whenever AI image creation is on, as shipping's free grant does (freeGenerations.svelte.ts),
// and look again when the app comes back to the foreground.
export function useAiAvailability(
  owner: NativeAiOwner | null,
  settings: Pick<SoundSettingsState, 'status' | 'aiEnabled'>
) {
  const enabled = settings.status !== 'loading' && settings.aiEnabled;
  useEffect(() => {
    if (!owner || !enabled) return;
    void owner.checkAvailability();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void owner.checkAvailability();
    });
    return () => subscription.remove();
  }, [owner, enabled]);
}
