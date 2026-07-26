import { settings, SOUND_VOLUME_DEFAULT } from '$lib/state/settings.svelte';
import type { DrawSoundData } from '$lib/drawing/engine';

const SOUND_URLS = ['/sounds/pencil-1.mp3', '/sounds/pencil-2.mp3', '/sounds/pencil-3.mp3'];

const BASE_SCRATCH_GAIN = 0.2;
// Pointer speed (canvas px/ms) at which the scratch reaches full volume. Slow
// strokes scale down linearly toward silence instead of hard-pausing at a
// threshold like the old HTMLAudioElement implementation did.
const FULL_VOLUME_SPEED = 0.45;
const GAIN_RAMP_S = 0.06;
const STOP_RAMP_S = 0.03;

let audioContext: AudioContext | null = null;
let buffers: AudioBuffer[] | null = null;
let loadStarted = false;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

function volumeMultiplier() {
  return settings.soundVolume / SOUND_VOLUME_DEFAULT;
}

function ensureContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof AudioContext === 'undefined') return null;
  audioContext = new AudioContext();
  return audioContext;
}

/**
 * Eagerly fetch and decode the pencil sounds into `AudioBuffer`s so the first
 * stroke plays instantly. Without this, loading is deferred until the first
 * `playDrawSound` call, leaving a multi-second silent gap on a fresh page
 * load. The AudioContext is created here in a suspended state — decoding
 * needs no user gesture, only playback does, so `playDrawSound` resumes the
 * context on the first pointerdown.
 */
export function preloadDrawSounds() {
  if (loadStarted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  loadStarted = true;
  Promise.all(
    SOUND_URLS.map(async (url) => {
      const response = await fetch(url);
      return ctx.decodeAudioData(await response.arrayBuffer());
    })
  )
    .then((decoded) => {
      buffers = decoded;
    })
    .catch(() => {
      loadStarted = false;
    });
}

export function playDrawSound({ speed, isStrokeStart }: DrawSoundData) {
  if (!settings.soundEnabled) return;
  if (isStrokeStart) preloadDrawSounds();
  const ctx = audioContext;
  if (!ctx || !buffers) return;

  if (!currentSource) {
    // Stroke start runs from pointerdown, satisfying the autoplay gesture
    // requirement for resuming the context.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    currentGain = ctx.createGain();
    currentGain.gain.value = 0;
    currentGain.connect(ctx.destination);

    currentSource = ctx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.loop = true;
    currentSource.connect(currentGain);
    currentSource.start(0, Math.random() * buffer.duration);
  }

  const target = BASE_SCRATCH_GAIN * volumeMultiplier() * Math.min(speed / FULL_VOLUME_SPEED, 1);
  rampGainTo(currentGain!.gain, target, ctx.currentTime, GAIN_RAMP_S);
}

export function stopDrawSound() {
  if (currentSource && currentGain && audioContext) {
    const now = audioContext.currentTime;
    rampGainTo(currentGain.gain, 0, now, STOP_RAMP_S);
    currentSource.stop(now + STOP_RAMP_S);
    const gain = currentGain;
    currentSource.onended = () => gain.disconnect();
  }
  currentSource = null;
  currentGain = null;
}

// Ramping (instead of setting the value directly) avoids audible clicks; the
// setValueAtTime anchor is required so the ramp starts from the current value
// rather than jumping from the last scheduled one.
function rampGainTo(param: AudioParam, target: number, now: number, rampS: number) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + rampS);
}
