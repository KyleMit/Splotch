import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { PENCIL_SOUNDS, pickPencilTake, usableTakes } from '../audio/pencilSounds';
import { PLAYBACK_AUDIO_MODE } from '../audio/playbackMode';
import {
  AUDIO_LOAD_TIMEOUT_MS,
  GAIN_RAMP_S,
  type DrawingLoop,
  type DrawingLoopLoader,
} from '../audio/drawingAudio';
import { perfTimed } from '../drawing/perfProbe';

const GAIN_FRAME_MS = 16;

// A synchronous call into the platform player on the JavaScript thread, made on every sample.
const setPlayerVolume = perfTimed('audioVolume', (player: AudioPlayer, volume: number) => {
  player.volume = volume;
});

function createNativeGain(player: AudioPlayer, onFailure: () => void) {
  let disposed = false;
  let ramp: ReturnType<typeof setTimeout> | null = null;
  let currentVolume = 0;
  function stopRamp() {
    if (ramp !== null) clearTimeout(ramp);
    ramp = null;
  }
  function setVolume(target: number) {
    stopRamp();
    const from = currentVolume;
    const started = performance.now();
    function step() {
      if (disposed) return;
      const progress = Math.min((performance.now() - started) / (GAIN_RAMP_S * 1000), 1);
      currentVolume = from + (target - from) * progress;
      try {
        setPlayerVolume(player, currentVolume);
      } catch {
        onFailure();
        return;
      }
      ramp = progress < 1 ? setTimeout(step, GAIN_FRAME_MS) : null;
    }
    step();
  }
  function mute() {
    stopRamp();
    currentVolume = 0;
    setPlayerVolume(player, 0);
  }
  return {
    setVolume,
    mute,
    dispose() {
      disposed = true;
      mute();
    },
  };
}

type PencilSound = (typeof PENCIL_SOUNDS)[number];
type PencilClip = Omit<DrawingLoop, 'start'> & { start: (at: number) => void };

// Exported only so native-audio-adapter.test.mjs can drive one take's player lifecycle.
export async function loadPencilClip(
  sound: PencilSound,
  signal: AbortSignal,
  onFailure: () => void
): Promise<PencilClip> {
  await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
  if (signal.aborted) throw new Error('Drawing sound was cancelled.');
  const player = createAudioPlayer(null, { keepAudioSessionActive: false });
  let disposed = false;
  let settled = false;
  let active = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const gain = createNativeGain(player, onFailure);
  let subscription: { remove: () => void } | null = null;
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timeout !== null) clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    let failed = false;
    // remove clears Expo's player registry; release tears down the platform player and observers.
    for (const cleanup of [
      () => subscription?.remove(),
      () => gain.dispose(),
      () => player.pause(),
      () => player.remove(),
      () => player.release(),
    ]) {
      try {
        cleanup();
      } catch {
        failed = true;
      }
    }
    if (failed) onFailure();
  }
  let refuse: (error: Error) => void = () => {};
  function abort() {
    try {
      dispose();
    } finally {
      refuse(new Error('Drawing sound was cancelled.'));
    }
  }
  return new Promise((resolve, reject) => {
    refuse = reject;
    function failed() {
      if (disposed) return;
      try {
        dispose();
      } finally {
        if (settled) onFailure();
        else reject(new Error('Drawing sound is unavailable.'));
      }
    }
    try {
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (disposed) return;
        try {
          if (status.mediaServicesDidReset) {
            failed();
            return;
          }
          if (status.playing && !active) {
            gain.mute();
            player.pause();
          }
          if (status.error) {
            failed();
            return;
          }
          if (!status.isLoaded || settled) return;
          settled = true;
          if (timeout !== null) clearTimeout(timeout);
          resolve({
            start(at) {
              if (disposed) return;
              active = true;
              const offset = at * player.duration;
              if (Number.isFinite(offset) && offset > 0) void player.seekTo(offset).catch(failed);
              player.play();
            },
            setVolume: gain.setVolume,
            stop() {
              active = false;
              if (!disposed) {
                gain.mute();
                player.pause();
              }
            },
            dispose,
          });
        } catch {
          failed();
        }
      });
    } catch {
      failed();
      return;
    }
    timeout = setTimeout(failed, AUDIO_LOAD_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else {
      try {
        player.loop = true;
        gain.mute();
        player.replace(sound);
      } catch {
        failed();
      }
    }
  });
}

// Every take is held loaded so a stroke starts its scratch without waiting on a reload.
export const loadDrawingLoop: DrawingLoopLoader = async (signal, onFailure) => {
  const loads = await Promise.allSettled(
    PENCIL_SOUNDS.map((sound) => loadPencilClip(sound, signal, onFailure))
  );
  const clips = usableTakes(loads);
  let playing: PencilClip | null = null;
  return {
    start() {
      playing?.stop();
      const { take, at } = pickPencilTake(clips);
      playing = take;
      take.start(at);
    },
    setVolume(volume) {
      playing?.setVolume(volume);
    },
    stop() {
      playing?.stop();
    },
    dispose() {
      playing = null;
      for (const clip of clips) clip.dispose();
    },
  };
};
