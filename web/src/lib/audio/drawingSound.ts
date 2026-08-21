import { settings, SOUND_VOLUME_DEFAULT } from '$lib/state/settings.svelte';
import type { DrawSoundData } from '$lib/drawing/engine';

const SOUND_URLS = ['/sounds/pencil-1.mp3', '/sounds/pencil-2.mp3', '/sounds/pencil-3.mp3'];
const CLEAR_PAGE_TURN_URL = '/sounds/clear-page-turn.mp3';

const BASE_SCRATCH_GAIN = 0.2;
// Pointer speed (canvas px/ms) at which the scratch reaches full volume. Slow
// strokes scale down linearly toward silence instead of hard-pausing at a
// threshold like the old HTMLAudioElement implementation did.
const FULL_VOLUME_SPEED = 0.45;
const GAIN_RAMP_S = 0.06;
const STOP_DECLICK_S = 0.005;
const TEARDOWN_SLACK_MS = 20;

const CLEAR_COMMIT_PROGRESS = 1;
// Drag distance becomes a note on a major pentatonic scale, so the pull plays a
// rising melody and pulling back plays it in reverse; every dot is consonant
// with the one before it, which a continuous glide could not promise.
const CLEAR_SCALE_SEMITONES = [0, 2, 4, 7, 9];
const CLEAR_BASE_HZ = 262;
// The approach and the climb past the threshold are sized separately, and the
// climb is the half that matters: nothing else speaks out there, so a ladder
// that spends itself before the commit point leaves the most consequential part
// of the gesture with nothing to say. The reach is further than a thumb travels.
const CLEAR_APPROACH_NOTES = 9;
const CLEAR_CLIMB_NOTES = 9;
const CLEAR_REACH_PROGRESS = 2.6;
// The top of a long pull lands near 3 kHz, where a small bubble belongs but a
// toddler's ear does not want it at full level.
const CLEAR_ROLLOFF_KNEE_HZ = 1_400;
const CLEAR_ROLLOFF_EXPONENT = 0.6;

// Matched to BASE_SCRATCH_GAIN: the clear drag used to sit around a sixth of the
// app's own pencil sound, which a tablet speaker in a noisy room loses entirely.
const CLEAR_BUBBLE_GAIN = 0.22;
const CLEAR_BUBBLE_ATTACK_S = 0.003;
const CLEAR_BUBBLE_DURATION_S = 0.11;
// A real bubble's resonance climbs as it collapses, so the note rises across its
// own envelope rather than settling onto a target pitch.
const CLEAR_BUBBLE_RISE_START_RATIO = 0.86;
const CLEAR_BUBBLE_RISE_END_RATIO = 1.08;
const CLEAR_SILENCE_GAIN = 0.0001;
// The droplet tick riding each attack is what makes the note read as water
// rather than as a synthesizer.
const CLEAR_DROPLET_RATIO = 3.2;
const CLEAR_DROPLET_GAIN = 0.06;
const CLEAR_DROPLET_DURATION_S = 0.014;
const CLEAR_DROPLET_Q = 6;
const CLEAR_NOISE_SECONDS = 1;

// Releasing short of the threshold walks back down the scale. It is the only
// thing in the whole gesture that tells a child the drawing survived.
const CLEAR_CANCEL_NOTES = 3;
const CLEAR_CANCEL_STEP_SEMITONES = 3;
const CLEAR_CANCEL_SPACING_MS = 55;
const CLEAR_CANCEL_GAIN_MULTIPLIER = 0.4;

const CLEAR_PAGE_TURN_GAIN = 1;

let audioContext: AudioContext | null = null;
const buffers: AudioBuffer[] = [];
const loadPromises = new Map<string, Promise<void>>();
const failedUrls = new Set<string>();
let currentPlayback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
type PencilPlaybackKind = 'drawing' | 'volume-preview';

let playbackRequest: { kind: PencilPlaybackKind; speed: number } | null = null;
let clearPageTurnBuffer: AudioBuffer | null = null;
const clearLoadPromises = new Map<string, Promise<void>>();
const clearFailedUrls = new Set<string>();
let clearGestureActive = false;
let clearPageTurnRequested = false;
let clearLastStep = -1;
let clearLastFrequency = 0;
let noiseBuffer: AudioBuffer | null = null;
const clearCancelTimers = new Set<ReturnType<typeof setTimeout>>();

function volumeMultiplier() {
  return settings.soundVolume / SOUND_VOLUME_DEFAULT;
}

export function canPlayDrawingSound() {
  return settings.soundEnabled && settings.drawingSoundEnabled;
}

function canPlayDeleteSound() {
  return settings.soundEnabled && settings.deleteSoundEnabled;
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

function loadClearPageTurn(ctx: AudioContext, url: string): Promise<void> {
  const existing = clearLoadPromises.get(url);
  if (existing) return existing;
  if (clearFailedUrls.has(url)) return Promise.resolve();

  const pending = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      clearPageTurnBuffer = buffer;
    })
    .catch(() => {
      clearLoadPromises.delete(url);
      clearFailedUrls.add(url);
    })
    .then(() => playClearPageTurnIfReady())
    .catch(() => {});
  clearLoadPromises.set(url, pending);
  return pending;
}

function preloadFirstPencilSound() {
  const ctx = ensureContext();
  if (!ctx) return;
  void loadSound(ctx, SOUND_URLS[0]);
}

function preloadPencilSounds() {
  const ctx = ensureContext();
  if (!ctx) return;
  for (const url of SOUND_URLS) void loadSound(ctx, url);
}

export function preloadFirstDrawSound() {
  if (!canPlayDrawingSound()) return;
  preloadFirstPencilSound();
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
  if (!settings.soundEnabled) {
    if (playbackRequest || currentPlayback) stopDrawSound();
    return;
  }
  requestPencilPlayback(data, 'volume-preview');
}

export function startClearSound() {
  resetClearGesture();
  if (!canPlayDeleteSound()) return;
  const ctx = ensureContext();
  if (!ctx) return;

  clearFailedUrls.clear();
  clearGestureActive = true;
  void loadClearPageTurn(ctx, CLEAR_PAGE_TURN_URL);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// `progress` is raw normalized drag distance, so it keeps climbing past the
// commit threshold; nothing here clamps it to the visual progress the CSS uses.
export function updateClearSound(progress: number) {
  if (!clearGestureActive) return;
  if (!canPlayDeleteSound()) {
    resetClearGesture();
    return;
  }

  const ctx = audioContext;
  if (!ctx) return;

  const step = clearLadderStep(Math.max(progress, 0));
  clearLastFrequency = clearLadderFrequency(step);
  if (step === clearLastStep) return;
  clearLastStep = step;
  playClearNote(ctx, clearLastFrequency);
}

export function cancelClearSound() {
  const ctx = audioContext;
  const shouldUnwind = clearGestureActive && canPlayDeleteSound() && clearLastStep >= 0 && ctx;
  const frequency = clearLastFrequency;
  resetClearGesture();
  if (!shouldUnwind) return;

  for (let note = 1; note <= CLEAR_CANCEL_NOTES; note += 1) {
    const timer = setTimeout(
      () => {
        clearCancelTimers.delete(timer);
        if (!canPlayDeleteSound()) return;
        playClearNote(
          ctx,
          frequency * 2 ** ((-CLEAR_CANCEL_STEP_SEMITONES * note) / 12),
          CLEAR_CANCEL_GAIN_MULTIPLIER
        );
      },
      (note - 1) * CLEAR_CANCEL_SPACING_MS
    );
    clearCancelTimers.add(timer);
  }
}

export function commitClearSound() {
  const shouldPlay = clearGestureActive && canPlayDeleteSound();
  resetClearGesture();
  if (shouldPlay) {
    clearPageTurnRequested = true;
    playClearPageTurnIfReady();
  }
}

// Silent teardown. Every entry point resets through here so a pending unwind can
// never leak into the drag that follows it, and so starting a gesture does not
// sound like abandoning one.
function resetClearGesture() {
  clearGestureActive = false;
  clearPageTurnRequested = false;
  clearLastStep = -1;
  clearLastFrequency = 0;
  for (const timer of clearCancelTimers) clearTimeout(timer);
  clearCancelTimers.clear();
}

function clearLadderStep(progress: number): number {
  if (progress <= CLEAR_COMMIT_PROGRESS) {
    return Math.round(Math.min(progress, 1) * CLEAR_APPROACH_NOTES);
  }
  const past = Math.min(
    (progress - CLEAR_COMMIT_PROGRESS) / (CLEAR_REACH_PROGRESS - CLEAR_COMMIT_PROGRESS),
    1
  );
  return CLEAR_APPROACH_NOTES + Math.round(past * CLEAR_CLIMB_NOTES);
}

function clearLadderFrequency(step: number): number {
  const degree = CLEAR_SCALE_SEMITONES[step % CLEAR_SCALE_SEMITONES.length];
  const octave = Math.floor(step / CLEAR_SCALE_SEMITONES.length);
  return CLEAR_BASE_HZ * 2 ** ((degree + 12 * octave) / 12);
}

function clearRolloff(frequency: number): number {
  return Math.min(1, (CLEAR_ROLLOFF_KNEE_HZ / frequency) ** CLEAR_ROLLOFF_EXPONENT);
}

function ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * CLEAR_NOISE_SECONDS, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playClearNote(ctx: AudioContext, frequency: number, gainMultiplier = 1) {
  const level = volumeMultiplier() * gainMultiplier * clearRolloff(frequency);
  const peakGain = CLEAR_BUBBLE_GAIN * level;
  if (peakGain <= CLEAR_SILENCE_GAIN) return;
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.value = CLEAR_SILENCE_GAIN;
  gain.gain.setValueAtTime(CLEAR_SILENCE_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + CLEAR_BUBBLE_ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(CLEAR_SILENCE_GAIN, now + CLEAR_BUBBLE_DURATION_S);
  gain.connect(ctx.destination);

  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency * CLEAR_BUBBLE_RISE_START_RATIO, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    frequency * CLEAR_BUBBLE_RISE_END_RATIO,
    now + CLEAR_BUBBLE_DURATION_S
  );
  oscillator.connect(gain);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(now);
  oscillator.stop(now + CLEAR_BUBBLE_DURATION_S);

  playClearDroplet(ctx, frequency, level, now);
}

function playClearDroplet(ctx: AudioContext, frequency: number, level: number, now: number) {
  const peakGain = CLEAR_DROPLET_GAIN * level;
  if (peakGain <= CLEAR_SILENCE_GAIN) return;

  const gain = ctx.createGain();
  gain.gain.value = CLEAR_SILENCE_GAIN;
  gain.gain.setValueAtTime(CLEAR_SILENCE_GAIN, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + CLEAR_BUBBLE_ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(CLEAR_SILENCE_GAIN, now + CLEAR_DROPLET_DURATION_S);
  gain.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency * CLEAR_DROPLET_RATIO;
  filter.Q.value = CLEAR_DROPLET_Q;
  filter.connect(gain);

  const source = ctx.createBufferSource();
  source.buffer = ensureNoiseBuffer(ctx);
  source.connect(filter);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  source.start(now);
  source.stop(now + CLEAR_DROPLET_DURATION_S);
}

function playClearPageTurnIfReady() {
  const ctx = audioContext;
  if (!ctx || !clearPageTurnRequested || !clearPageTurnBuffer || !canPlayDeleteSound()) return;
  clearPageTurnRequested = false;

  const gain = ctx.createGain();
  gain.gain.value = CLEAR_PAGE_TURN_GAIN * volumeMultiplier();
  gain.connect(ctx.destination);

  const source = ctx.createBufferSource();
  source.buffer = clearPageTurnBuffer;
  source.connect(gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}

function startPlaybackIfReady() {
  const ctx = audioContext;
  const request = playbackRequest;
  if (
    !ctx ||
    currentPlayback ||
    !request ||
    !settings.soundEnabled ||
    (request.kind === 'drawing' && !settings.drawingSoundEnabled) ||
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
