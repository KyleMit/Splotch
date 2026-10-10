import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import pencilSound from '../audio/pencil-1.mp3';
import { AUDIO_LOAD_TIMEOUT_MS, GAIN_RAMP_S, type DrawingLoopLoader } from '../audio/drawingAudio';

const GAIN_FRAME_MS = 16;

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
        player.volume = currentVolume;
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
    player.volume = 0;
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

export const loadDrawingLoop: DrawingLoopLoader = async (signal, onFailure) => {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
  signal.throwIfAborted();
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
            start() {
              if (!disposed) {
                active = true;
                player.play();
              }
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
        player.replace(pencilSound);
      } catch {
        failed();
      }
    }
  });
};
