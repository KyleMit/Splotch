import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { PENCIL_SOUNDS, pickPencilStart, pickPencilTake, usableTakes } from '../audio/pencilSounds';
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

// A take's first play() makes AVFoundation resolve the item's media selection with a synchronous
// media-server call on the iPad main thread, up to a sixth of a second soon after launch (issue
// 3028). Priming plays each take once at volume 0 while the screen is idle, so that wait lands
// before any stroke. A take whose native player never reports playing is released from priming
// after this long, so it can still sound.
const PRIME_TIMEOUT_MS = 1000;

// A play() that lands on a seek still in flight blocks the iPad main thread for a sixth of a second
// or more (issue 3003), so a take moves to its next random start point only while it is paused: as
// part of loading, and after each stroke it sounded in. A stroke that reaches a take mid-seek or
// mid-prime plays it once that lands, unless the stroke has ended by then.
function createCuedPlayback(player: AudioPlayer) {
  let busy = 0;
  let wanted = false;
  let sounded = false;
  let played = false;
  let priming: { done: (released: boolean) => void } | null = null;
  function play() {
    if (!wanted || sounded || busy > 0) return;
    sounded = true;
    played = true;
    player.play();
  }
  function cue(): Promise<void> {
    const offset = pickPencilStart() * player.duration;
    if (!Number.isFinite(offset) || offset <= 0) return Promise.resolve();
    busy += 1;
    return player.seekTo(offset).then(() => {
      busy -= 1;
      play();
    });
  }
  // A take a stroke has already played needs no prime, and may be seeking: a play() then would land
  // on that seek.
  function prime(): Promise<void> {
    if (played) return Promise.resolve();
    played = true;
    busy += 1;
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => done(false), PRIME_TIMEOUT_MS);
      function done(released: boolean) {
        clearTimeout(timeout);
        priming = null;
        busy -= 1;
        resolve();
        if (released) return;
        if (!wanted) player.pause();
        play();
      }
      priming = { done };
      player.play();
    });
  }
  return {
    cue,
    prime,
    playing: () => priming?.done(false),
    seeking: () => busy > 0,
    wanted: () => wanted,
    start() {
      wanted = true;
      play();
    },
    stop(): Promise<void> {
      wanted = false;
      player.pause();
      if (!sounded) return Promise.resolve();
      sounded = false;
      return cue();
    },
    // Teardown: a seek or prime still in flight lands after release, and must not touch the player.
    cancel() {
      wanted = false;
      priming?.done(true);
    },
  };
}

type PencilSound = (typeof PENCIL_SOUNDS)[number];
type PencilClip = DrawingLoop & { seeking: () => boolean; prime: () => Promise<void> };

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
  let loaded = false;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const gain = createNativeGain(player, onFailure);
  const playback = createCuedPlayback(player);
  let subscription: { remove: () => void } | null = null;
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timeout !== null) clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    let failed = false;
    // remove clears Expo's player registry; release tears down the platform player and observers.
    playback.cancel();
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
          if (status.playing) playback.playing();
          if (status.playing && !playback.wanted()) {
            gain.mute();
            player.pause();
          }
          if (status.error) {
            failed();
            return;
          }
          if (!status.isLoaded || loaded) return;
          loaded = true;
          void playback.cue().then(() => {
            if (disposed) return;
            settled = true;
            if (timeout !== null) clearTimeout(timeout);
            resolve({
              start() {
                if (!disposed) playback.start();
              },
              setVolume: gain.setVolume,
              stop() {
                if (disposed) return;
                gain.mute();
                void playback.stop().catch(failed);
              },
              seeking: playback.seeking,
              prime() {
                if (disposed) return Promise.resolve();
                return playback.prime().catch(failed);
              },
              dispose,
            });
          }, failed);
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
  // One take at a time, so no prime contends with another for the media server.
  void clips.reduce<Promise<void>>((primed, clip) => primed.then(clip.prime), Promise.resolve());
  let playing: PencilClip | null = null;
  return {
    start() {
      playing?.stop();
      // A take still moving to its next start point sits this stroke out.
      const settled = clips.filter((clip) => !clip.seeking());
      const take = pickPencilTake(settled.length > 0 ? settled : clips);
      playing = take;
      take.start();
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
