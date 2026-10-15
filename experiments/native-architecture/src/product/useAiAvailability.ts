import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { NativeAiOwner } from '../ai/generation';
import type { SoundSettingsState } from '../settings/soundSettingsCodec';

// The AI Image Button's checking, unavailable and free-count states follow the free allowance
// whenever AI image creation is on, as shipping's free grant does (freeGenerations.svelte.ts).
// Coming back to the foreground looks again only for an allowance not yet known, as shipping's
// retryOnVisibleReturn does.
export function useAiAvailability(
  owner: NativeAiOwner | null,
  settings: Pick<SoundSettingsState, 'status' | 'aiEnabled'>,
  online: boolean
) {
  const enabled = online && settings.status !== 'loading' && settings.aiEnabled;
  useEffect(() => {
    if (!owner || !enabled) return;
    void owner.inspect();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && owner.getState().availability !== 'ready') void owner.inspect();
    });
    return () => subscription.remove();
  }, [owner, enabled]);
}
