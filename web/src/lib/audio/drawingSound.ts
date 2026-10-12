import { settingsState, SOUND_VOLUME_DEFAULT } from '$lib/state/settings.svelte';
import type { DrawSoundData } from '$lib/drawing/engine';
import { scheduleIdle } from '$lib/idle';

const SOUND_URLS = ['/sounds/pencil-1.mp3', '/sounds/pencil-2.mp3', '/sounds/pencil-3.mp3'];

const BASE_SCRATCH_GAIN = 0.2;
// Pointer speed (canvas px/ms) at which the scratch reaches full volume. Slow
// strokes scale down linearly toward silence instead of hard-pausing at a
// speed threshold.
const FULL_VOLUME_SPEED = 0.45;
const GAIN_RAMP_S = 0.06;
const STOP_DECLICK_S = 0.005;
const TEARDOWN_SLACK_MS = 20;

// The one context for all app audio: clearSound.ts reaches it through
// ensureAudioContext/currentAudioContext rather than building a second one.
let audioContext: AudioContext | null = null;
// Constructing an AudioContext spins up the audio device thread, which a 4x
// throttled phone spends tens of milliseconds on. The boot path fetches the
// first pencil sound's bytes right away but leaves the context, and the decode
// that needs it, to an idle callback; a stroke that lands first builds the
// context itself, so nothing waits on idle. The callback re-checks the
// setting, so it is never cancelled, only scheduled once.
let contextWarmupScheduled = false;
const buffers: AudioBuffer[] = [];
const loadPromises = new Map<string, Promise<void>>();
// Encoded bytes fetched ahead of a context. decodeAudioData detaches the
// buffer it is handed, so an entry lives only until its one decode consumes
// it; a failed fetch drops its entry so the next attempt retries the network.
const soundBytes = new Map<string, Promise<ArrayBuffer>>();
const failedUrls = new Set<string>();
let currentPlayback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
type PencilPlaybackKind = 'drawing' | 'volume-preview';

let playbackRequest: { kind: PencilPlaybackKind; speed: number } | null = null;

export function volumeMultiplier() {
  return settingsState.soundVolume / SOUND_VOLUME_DEFAULT;
}

export function canPlayDrawingSound() {
  return settingsState.soundEnabled && settingsState.drawingSoundEnabled;
}

export function ensureAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof AudioContext === 'undefined') return null;
  audioContext = new AudioContext();
  return audioContext;
}

export function currentAudioContext(): AudioContext | null {
  return audioContext;
}

function fetchSoundBytes(url: string): Promise<ArrayBuffer> {
  const existing = soundBytes.get(url);
  if (existing) return existing;
  const pending = fetch(url).then((response) => response.arrayBuffer());
  soundBytes.set(url, pending);
  pending.catch(() => {
    if (soundBytes.get(url) === pending) soundBytes.delete(url);
  });
  return pending;
}

function loadSound(ctx: AudioContext, url: string): Promise<void> {
  const existing = loadPromises.get(url);
  if (existing) return existing;
  if (failedUrls.has(url)) return Promise.resolve();

  const pending = fetchSoundBytes(url)
    .then((data) => {
      soundBytes.delete(url);
      return ctx.decodeAudioData(data);
    })
    .then((buffer) => {
      buffers.push(buffer);
    })
    .catch(() => {
      loadPromises.delete(url);
      soundBytes.delete(url);
      failedUrls.add(url);
    })
    .then(() => startPlaybackIfReady())
    .catch(() => {});
  loadPromises.set(url, pending);
  return pending;
}

function preloadFirstPencilSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  void loadSound(ctx, SOUND_URLS[0]);
}

function preloadPencilSounds() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  for (const url of SOUND_URLS) void loadSound(ctx, url);
}

function warmContextAtIdle() {
  if (audioContext || contextWarmupScheduled) return;
  contextWarmupScheduled = true;
  scheduleIdle(() => {
    contextWarmupScheduled = false;
    if (canPlayDrawingSound()) preloadFirstPencilSound();
  });
}

export function preloadFirstDrawSound() {
  if (!canPlayDrawingSound()) return;
  if (audioContext) {
    preloadFirstPencilSound();
    return;
  }
  void fetchSoundBytes(SOUND_URLS[0]).catch(() => {});
  warmContextAtIdle();
}

export function preloadDrawSounds() {
  if (!canPlayDrawingSound()) return;
  preloadPencilSounds();
}

function requestPencilPlayback({ speed, isStrokeStart }: DrawSoundData, kind: PencilPlaybackKind) {
  const gestureStarted = !playbackRequest;
  playbackRequest = { kind, speed };
  if (isStrokeStart) {
    failedUrls.clear();
    preloadPencilSounds();
  } else preloadFirstPencilSound();
  const ctx = audioContext;
  if (!ctx) return;

  // A suspended WebKit context may reject without changing state. One attempt
  // per gesture preserves the next real activation without charging every move.
  if (gestureStarted && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (currentPlayback) updateGain(currentPlayback.gain.gain, speed, ctx.currentTime);
  else startPlaybackIfReady();
}

export function playDrawSound(data: DrawSoundData) {
  if (!canPlayDrawingSound()) {
    if (playbackRequest || currentPlayback) stopDrawSound();
    return;
  }
  requestPencilPlayback(data, 'drawing');
}

export function playVolumePreview(data: DrawSoundData) {
  if (!settingsState.soundEnabled) {
    if (playbackRequest || currentPlayback) stopDrawSound();
    return;
  }
  requestPencilPlayback(data, 'volume-preview');
}

function startPlaybackIfReady() {
  const ctx = audioContext;
  const request = playbackRequest;
  if (
    !ctx ||
    currentPlayback ||
    !request ||
    !settingsState.soundEnabled ||
    (request.kind === 'drawing' && !settingsState.drawingSoundEnabled) ||
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
  updateGain(gain.gain, request.speed, ctx.currentTime);
}

function updateGain(param: AudioParam, speed: number, now: number) {
  const target = BASE_SCRATCH_GAIN * volumeMultiplier() * Math.min(speed / FULL_VOLUME_SPEED, 1);
  rampGainTo(param, target, now, GAIN_RAMP_S);
}

export function stopDrawSound() {
  failedUrls.clear();
  playbackRequest = null;
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
