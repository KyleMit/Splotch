import { settings, SOUND_VOLUME_DEFAULT } from '$lib/state/settings.svelte';
import type { DrawSoundData } from '$lib/drawing/engine';

const SOUND_URLS = ['/sounds/pencil-1.mp3', '/sounds/pencil-2.mp3', '/sounds/pencil-3.mp3'];

const BASE_SCRATCH_GAIN = 0.2;
// Pointer speed (canvas px/ms) at which the scratch reaches full volume. Slow
// strokes scale down linearly toward silence instead of hard-pausing at a
// threshold like the old HTMLAudioElement implementation did.
const FULL_VOLUME_SPEED = 0.45;
const GAIN_RAMP_S = 0.06;
const STOP_DECLICK_S = 0.005;
const TEARDOWN_SLACK_MS = 20;

let audioContext: AudioContext | null = null;
const buffers: AudioBuffer[] = [];
const loadPromises = new Map<string, Promise<void>>();
const failedUrls = new Set<string>();
let currentPlayback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let playbackRequested = false;
let requestedSpeed = 0;

function volumeMultiplier() {
  return settings.soundVolume / SOUND_VOLUME_DEFAULT;
}

function ensureContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof AudioContext === 'undefined') return null;
  audioContext = new AudioContext();
  return audioContext;
}

function loadSound(ctx: AudioContext, url: string): Promise<void> {
  const existing = loadPromises.get(url);
  if (existing) return existing;
  if (failedUrls.has(url)) return Promise.resolve();

  const pending = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers.push(buffer);
    })
    .catch(() => {
      loadPromises.delete(url);
      failedUrls.add(url);
    })
    .then(() => startPlaybackIfReady())
    .catch(() => {});
  loadPromises.set(url, pending);
  return pending;
}

export function preloadFirstDrawSound() {
  if (!settings.soundEnabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  void loadSound(ctx, SOUND_URLS[0]);
}

export function preloadDrawSounds() {
  if (!settings.soundEnabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  for (const url of SOUND_URLS) void loadSound(ctx, url);
}

export function playDrawSound({ speed, isStrokeStart }: DrawSoundData) {
  if (!settings.soundEnabled) return;
  const gestureStarted = !playbackRequested;
  playbackRequested = true;
  requestedSpeed = speed;
  if (isStrokeStart) {
    failedUrls.clear();
    preloadDrawSounds();
  } else preloadFirstDrawSound();
  const ctx = audioContext;
  if (!ctx) return;

  // A suspended WebKit context may reject without changing state. One attempt
  // per gesture preserves the next real activation without charging every move.
  if (gestureStarted && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (currentPlayback) updateGain(currentPlayback.gain.gain, speed, ctx.currentTime);
  else startPlaybackIfReady();
}

function startPlaybackIfReady() {
  const ctx = audioContext;
  if (
    !ctx ||
    currentPlayback ||
    !playbackRequested ||
    !settings.soundEnabled ||
    buffers.length === 0
  )
    return;

  const buffer = buffers[Math.floor(Math.random() * buffers.length)];
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start(0, Math.random() * buffer.duration);
  currentPlayback = { source, gain };
  updateGain(gain.gain, requestedSpeed, ctx.currentTime);
}

function updateGain(param: AudioParam, speed: number, now: number) {
  const target = BASE_SCRATCH_GAIN * volumeMultiplier() * Math.min(speed / FULL_VOLUME_SPEED, 1);
  rampGainTo(param, target, now, GAIN_RAMP_S);
}

export function stopDrawSound() {
  failedUrls.clear();
  playbackRequested = false;
  requestedSpeed = 0;
  const playback = currentPlayback;
  if (playback && audioContext) {
    const now = audioContext.currentTime;
    const { source, gain } = playback;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);

    const teardown = () => {
      source.disconnect();
      gain.disconnect();
      source.stop();
    };

    // A preloaded WebKit context can remain suspended with a frozen clock, so
    // teardown cannot depend on audio-clock progress or an `ended` event.
    if (audioContext.state === 'running' && now > 0) {
      gain.gain.linearRampToValueAtTime(0, now + STOP_DECLICK_S);
      setTimeout(teardown, STOP_DECLICK_S * 1_000 + TEARDOWN_SLACK_MS);
    } else {
      gain.gain.setValueAtTime(0, now);
      teardown();
    }
  }
  currentPlayback = null;
}

// Ramping (instead of setting the value directly) avoids audible clicks; the
// setValueAtTime anchor is required so the ramp starts from the current value
// rather than jumping from the last scheduled one.
function rampGainTo(param: AudioParam, target: number, now: number, rampS: number) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + rampS);
}
