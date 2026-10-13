import clearPageTurn from '../audio/clear-page-turn.mp3';
import { AUDIO_LOAD_TIMEOUT_MS } from '../audio/drawingAudio';
import type { ClearPageTurnLoader } from '../audio/pageTurnSound';
import { PLAYBACK_AUDIO_MODE } from '../audio/playbackMode';

// A native player's volume stops at unity, so the Loud level's doubled gain plays at full volume
// here where the web's gain node can amplify it.
const MAX_PLAYER_VOLUME = 1;

// expo-audio loads with the first drag rather than with the drawing screen.
export const loadClearPageTurn: ClearPageTurnLoader = async (signal) => {
  const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
  await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
  signal.throwIfAborted();
  const player = createAudioPlayer(clearPageTurn, { keepAudioSessionActive: false });
  let subscription: { remove: () => void } | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  function dispose() {
    if (timeout !== null) clearTimeout(timeout);
    subscription?.remove();
    player.remove();
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
      player.volume = Math.min(volume, MAX_PLAYER_VOLUME);
      void player.seekTo(0).catch(() => {});
      player.play();
    },
    dispose,
  };
};
