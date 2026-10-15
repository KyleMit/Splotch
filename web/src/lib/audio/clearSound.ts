import { settingsState } from '$lib/state/settings.svelte';
import { currentAudioContext, ensureAudioContext, volumeMultiplier } from './drawingSound';
import {
  clearLadderStep,
  clearLadderFrequency,
  playClearNote,
  CLEAR_CANCEL_NOTES,
  CLEAR_CANCEL_STEP_SEMITONES,
  CLEAR_CANCEL_SPACING_MS,
  CLEAR_CANCEL_GAIN_MULTIPLIER,
} from './clearSoundNotes';

const CLEAR_PAGE_TURN_URL = '/sounds/clear-page-turn.mp3';

const CLEAR_PAGE_TURN_GAIN = 1;

let clearPageTurnBuffer: AudioBuffer | null = null;
const clearLoadPromises = new Map<string, Promise<void>>();
let clearGestureActive = false;
let clearPageTurnRequested = false;
let clearLastStep = -1;
let clearLastFrequency = 0;
const clearCancelTimers = new Set<ReturnType<typeof setTimeout>>();

function canPlayDeleteSound() {
  return settingsState.soundEnabled && settingsState.deleteSoundEnabled;
}

function loadClearPageTurn(ctx: AudioContext, url: string): Promise<void> {
  const existing = clearLoadPromises.get(url);
  if (existing) return existing;

  const pending = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      clearPageTurnBuffer = buffer;
    })
    .catch(() => {
      clearLoadPromises.delete(url);
    })
    .then(() => playClearPageTurnIfReady())
    .catch(() => {});
  clearLoadPromises.set(url, pending);
  return pending;
}

export function startClearSound() {
  resetClearGesture();
  if (!canPlayDeleteSound()) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

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

  const ctx = currentAudioContext();
  if (!ctx) return;

  const step = clearLadderStep(Math.max(progress, 0));
  clearLastFrequency = clearLadderFrequency(step);
  if (step === clearLastStep) return;
  clearLastStep = step;
  playClearNote(ctx, clearLastFrequency, volumeMultiplier());
}

export function cancelClearSound() {
  const ctx = currentAudioContext();
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
          volumeMultiplier() * CLEAR_CANCEL_GAIN_MULTIPLIER
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

function playClearPageTurnIfReady() {
  const ctx = currentAudioContext();
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
