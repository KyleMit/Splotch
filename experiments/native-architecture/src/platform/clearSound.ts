import clearPageTurn from '../audio/clear-page-turn-amplified.wav';
import { AUDIO_LOAD_TIMEOUT_MS } from '../audio/drawingAudio';
import { CLEAR_PAGE_TURN_ASSET_GAIN, type ClearPageTurnLoader } from '../audio/pageTurnSound';
import { PLAYBACK_AUDIO_MODE } from '../audio/playbackMode';
import { loadClearNotes } from './clearNotes.native';

const MAX_PLAYER_VOLUME = 1;

export const loadClearPageTurn: ClearPageTurnLoader = async (signal, publishNotes) => {
  const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
  await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
  // React Native's AbortSignal has no throwIfAborted().
  if (signal.aborted) throw new Error('Clear sound was cancelled.');
  const request = new AbortController();
  const abort = () => request.abort();
  const player = createAudioPlayer(clearPageTurn, { keepAudioSessionActive: false });
  signal.addEventListener('abort', abort, { once: true });
  let notes: Awaited<ReturnType<typeof loadClearNotes>> | null = null;
  let subscription: { remove: () => void } | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let failure: Error | null = null;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', abort);
    if (timeout !== null) clearTimeout(timeout);
    // Expo's remove drops the registry entry; release tears down the native player.
    for (const cleanup of [
      () => request.abort(),
      () => notes?.dispose(),
      () => subscription?.remove(),
      () => {
        player.volume = 0;
      },
      () => player.pause(),
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
    player.volume = 0;
    const prepareNotes = loadClearNotes(request.signal).then((loaded) => {
      if (disposed || request.signal.aborted) {
        loaded.dispose();
        throw new Error('Clear sound was cancelled.');
      }
      notes = loaded;
      publishNotes(loaded.play);
    });
    const prepareTurn = new Promise<void>((resolve, reject) => {
      request.signal.addEventListener(
        'abort',
        () => reject(failure ?? new Error('Clear sound was cancelled.')),
        {
          once: true,
        }
      );
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (disposed) return;
        if (status.error || status.mediaServicesDidReset) {
          failure = new Error('Clear sound is unavailable.');
          dispose();
          reject(failure);
        } else if (status.isLoaded) resolve();
      });
      if (player.isLoaded) resolve();
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Clear sound did not load.')),
        AUDIO_LOAD_TIMEOUT_MS
      );
      request.signal.addEventListener(
        'abort',
        () => reject(failure ?? new Error('Clear sound was cancelled.')),
        {
          once: true,
        }
      );
    });
    await Promise.race([Promise.all([prepareNotes, prepareTurn]), deadline]);
    if (request.signal.aborted) throw new Error('Clear sound was cancelled.');
  } catch (error) {
    dispose();
    throw error;
  }
  if (timeout !== null) clearTimeout(timeout);
  return {
    play(volume) {
      if (disposed) throw new Error('Clear sound was cancelled.');
      player.volume = Math.min(volume / CLEAR_PAGE_TURN_ASSET_GAIN, MAX_PLAYER_VOLUME);
      void player.seekTo(0).catch(() => {});
      player.play();
    },
    dispose,
  };
};
