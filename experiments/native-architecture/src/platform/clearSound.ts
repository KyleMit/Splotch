import clearPageTurn from '../audio/clear-page-turn-amplified.wav';
import { AUDIO_LOAD_TIMEOUT_MS } from '../audio/drawingAudio';
import { CLEAR_PAGE_TURN_ASSET_GAIN, type ClearPageTurnLoader } from '../audio/pageTurnSound';
import { PLAYBACK_AUDIO_MODE } from '../audio/playbackMode';

const MAX_PLAYER_VOLUME = 1;

export const loadClearPageTurn: ClearPageTurnLoader = async (signal) => {
  const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
  await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
  // React Native's AbortSignal has no throwIfAborted().
  if (signal.aborted) throw new Error('Clear sound was cancelled.');
  const player = createAudioPlayer(clearPageTurn, { keepAudioSessionActive: false });
  let subscription: { remove: () => void } | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timeout !== null) clearTimeout(timeout);
    // Expo's remove drops the registry entry; release tears down the native player.
    for (const cleanup of [
      () => subscription?.remove(),
      () => {
        player.volume = 0;
      },
      () => player.remove(),
      () => player.release(),
    ]) {
      try {
        cleanup();
      } catch {
        // Audio teardown must not turn a completed Clear into an error.
      }
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Clear sound did not load.')),
        AUDIO_LOAD_TIMEOUT_MS
      );
      signal.addEventListener('abort', () => reject(new Error('Clear sound was cancelled.')), {
        once: true,
      });
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.error) reject(new Error('Clear sound is unavailable.'));
        else if (status.isLoaded) resolve();
      });
      if (player.isLoaded) resolve();
    });
  } catch (error) {
    dispose();
    throw error;
  }
  if (timeout !== null) clearTimeout(timeout);
  return {
    play(volume) {
      player.volume = Math.min(volume / CLEAR_PAGE_TURN_ASSET_GAIN, MAX_PLAYER_VOLUME);
      void player.seekTo(0).catch(() => {});
      player.play();
    },
    dispose,
  };
};
