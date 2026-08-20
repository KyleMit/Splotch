import { settings, SOUND_VOLUME_DEFAULT } from '$lib/state/settings.svelte';
import type { DrawSoundData } from '$lib/drawing/engine';

const SOUND_URLS = ['/sounds/pencil-1.mp3', '/sounds/pencil-2.mp3', '/sounds/pencil-3.mp3'];
const CLEAR_POP_URL = '/sounds/clear-pop.mp3';

const BASE_SCRATCH_GAIN = 0.2;
// Pointer speed (canvas px/ms) at which the scratch reaches full volume. Slow
// strokes scale down linearly toward silence instead of hard-pausing at a
// threshold like the old HTMLAudioElement implementation did.
const FULL_VOLUME_SPEED = 0.45;
const GAIN_RAMP_S = 0.06;
const STOP_DECLICK_S = 0.005;
const TEARDOWN_SLACK_MS = 20;
// This gate keeps ordinary pointer sampling distinct enough to sound like dots instead of a buzz.
const CLEAR_DOT_PROGRESS_STEP = 0.055;
const CLEAR_COMMIT_PROGRESS = 1;
// Pitch keeps climbing after commit so extra drag still speaks, then stabilizes at a finite ceiling.
const CLEAR_DOT_PITCH_CAP_PROGRESS = 1.4;
const CLEAR_DOT_SILENCE_GAIN = 0.0001;
// A relaxed pulse avoids a silent ready state without turning a held gesture into a continuous tone.
const CLEAR_READY_BUBBLE_INTERVAL_MS = 240;
const CLEAR_READY_BUBBLE_GAIN_MULTIPLIER = 0.55;
const CLEAR_POP_GAIN = 0.3;
// This compact band reads as friendly water bubbles while staying clear of harsh high frequencies.
const CLEAR_BUBBLE_START_HZ = 420;
const CLEAR_BUBBLE_END_HZ = 1_050;
const CLEAR_BUBBLE_PITCH_VARIATION = 0.06;
const CLEAR_BUBBLE_PITCH_START_RATIO = 1.18;
const CLEAR_BUBBLE_PITCH_SETTLE_S = 0.028;
const CLEAR_BUBBLE_GAIN_MIN = 0.012;
const CLEAR_BUBBLE_GAIN_MAX = 0.035;
const CLEAR_BUBBLE_GAIN_EXPONENT = 1.2;
const CLEAR_BUBBLE_ATTACK_S = 0.004;
// Each resonance is long enough to feel rounded but short enough to remain a discrete drag sample.
const CLEAR_BUBBLE_DURATION_S = 0.085;

let audioContext: AudioContext | null = null;
const buffers: AudioBuffer[] = [];
const loadPromises = new Map<string, Promise<void>>();
const failedUrls = new Set<string>();
let currentPlayback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let playbackRequested = false;
let requestedSpeed = 0;
let clearPopBuffer: AudioBuffer | null = null;
const clearLoadPromises = new Map<string, Promise<void>>();
const clearFailedUrls = new Set<string>();
let clearGestureActive = false;
let clearPopRequested = false;
let lastClearBubbleProgress = 0;
let clearReadyBubbleProgress = 0;
let clearReadyBubbleTimer: ReturnType<typeof setInterval> | null = null;

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

function loadClearPop(ctx: AudioContext, url: string): Promise<void> {
  const existing = clearLoadPromises.get(url);
  if (existing) return existing;
  if (clearFailedUrls.has(url)) return Promise.resolve();

  const pending = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      clearPopBuffer = buffer;
    })
    .catch(() => {
      clearLoadPromises.delete(url);
      clearFailedUrls.add(url);
    })
    .then(() => playClearPopIfReady())
    .catch(() => {});
  clearLoadPromises.set(url, pending);
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

export function startClearSound() {
  cancelClearSound();
  if (!settings.soundEnabled) return;
  const ctx = ensureContext();
  if (!ctx) return;

  clearFailedUrls.clear();
  clearGestureActive = true;
  lastClearBubbleProgress = 0;
  clearReadyBubbleProgress = 0;
  void loadClearPop(ctx, CLEAR_POP_URL);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function updateClearSound(progress: number) {
  if (!clearGestureActive) return;
  if (!settings.soundEnabled) {
    cancelClearSound();
    return;
  }

  const ctx = audioContext;
  if (!ctx) return;

  const dragProgress = Math.max(0, progress);
  const bubbleProgress = Math.min(dragProgress / CLEAR_DOT_PITCH_CAP_PROGRESS, 1);
  if (dragProgress >= CLEAR_COMMIT_PROGRESS) {
    clearReadyBubbleProgress = bubbleProgress;
    startClearReadyBubbles(ctx);
  } else stopClearReadyBubbles();
  if (Math.abs(bubbleProgress - lastClearBubbleProgress) < CLEAR_DOT_PROGRESS_STEP) return;
  lastClearBubbleProgress = bubbleProgress;
  playClearDot(ctx, bubbleProgress);
}

export function cancelClearSound() {
  clearGestureActive = false;
  clearPopRequested = false;
  lastClearBubbleProgress = 0;
  clearReadyBubbleProgress = 0;
  stopClearReadyBubbles();
}

export function commitClearSound() {
  const shouldPlayPop = clearGestureActive && settings.soundEnabled;
  cancelClearSound();
  if (shouldPlayPop) {
    clearPopRequested = true;
    playClearPopIfReady();
  }
}

function startClearReadyBubbles(ctx: AudioContext) {
  if (clearReadyBubbleTimer !== null) return;
  clearReadyBubbleTimer = setInterval(() => {
    if (!clearGestureActive || !settings.soundEnabled) {
      stopClearReadyBubbles();
      return;
    }
    playClearDot(ctx, clearReadyBubbleProgress, CLEAR_READY_BUBBLE_GAIN_MULTIPLIER);
  }, CLEAR_READY_BUBBLE_INTERVAL_MS);
}

function stopClearReadyBubbles() {
  if (clearReadyBubbleTimer === null) return;
  clearInterval(clearReadyBubbleTimer);
  clearReadyBubbleTimer = null;
}

function playClearDot(ctx: AudioContext, progress: number, gainMultiplier = 1) {
  const pitchVariation = 1 + (Math.random() * 2 - 1) * CLEAR_BUBBLE_PITCH_VARIATION;
  const frequency =
    CLEAR_BUBBLE_START_HZ *
    Math.pow(CLEAR_BUBBLE_END_HZ / CLEAR_BUBBLE_START_HZ, progress) *
    pitchVariation;
  const peakGain =
    (CLEAR_BUBBLE_GAIN_MIN +
      (CLEAR_BUBBLE_GAIN_MAX - CLEAR_BUBBLE_GAIN_MIN) *
        Math.pow(progress, CLEAR_BUBBLE_GAIN_EXPONENT)) *
    volumeMultiplier() *
    gainMultiplier;
  if (peakGain <= CLEAR_DOT_SILENCE_GAIN) return;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.value = CLEAR_DOT_SILENCE_GAIN;
  gain.gain.setValueAtTime(CLEAR_DOT_SILENCE_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + CLEAR_BUBBLE_ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(CLEAR_DOT_SILENCE_GAIN, now + CLEAR_BUBBLE_DURATION_S);
  gain.connect(ctx.destination);

  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency * CLEAR_BUBBLE_PITCH_START_RATIO, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency, now + CLEAR_BUBBLE_PITCH_SETTLE_S);
  oscillator.connect(gain);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(now);
  oscillator.stop(now + CLEAR_BUBBLE_DURATION_S);
}

function playClearPopIfReady() {
  const ctx = audioContext;
  if (!ctx || !clearPopRequested || !clearPopBuffer || !settings.soundEnabled) return;
  clearPopRequested = false;

  const gain = ctx.createGain();
  gain.gain.value = CLEAR_POP_GAIN * volumeMultiplier();
  gain.connect(ctx.destination);

  const source = ctx.createBufferSource();
  source.buffer = clearPopBuffer;
  source.connect(gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
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
