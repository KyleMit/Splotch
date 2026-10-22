import { SOUND_VOLUME_DEFAULT, soundVolumeGain } from '../settings/soundVolume';
import {
  clearLadderStep,
  clearLadderFrequency,
  CLEAR_CANCEL_NOTES,
  CLEAR_CANCEL_STEP_SEMITONES,
  CLEAR_CANCEL_SPACING_MS,
  CLEAR_CANCEL_GAIN_MULTIPLIER,
} from '../lib/audio/clearSoundNotes';

type ClearPageTurn = { play(volume: number): void; dispose(): void };
type ClearNotePlayer = (frequency: number, volume: number) => void | Promise<void>;
export type ClearPageTurnLoader = (
  signal: AbortSignal,
  publishNotes: (play: ClearNotePlayer) => void
) => Promise<ClearPageTurn>;

// The shipping page turn plays at unit gain scaled by the parent's volume
// (src/lib/audio/clearSound.ts); native-clear-projection.test.mjs pins the literal.
const CLEAR_PAGE_TURN_GAIN = 1;
// Native players stop at unity; the unclipped PCM asset carries Loud's gain before attenuation.
export const CLEAR_PAGE_TURN_ASSET_GAIN = 2;

type Resource =
  | { status: 'idle' }
  | { status: 'loading'; request: AbortController }
  | { status: 'ready'; turn: ClearPageTurn };

function createClearGestureSound(
  canPlay: () => boolean,
  note: (frequency: number, gain?: number) => void
) {
  let active = false;
  let lastStep = -1;
  let lastFrequency = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function stop() {
    active = false;
    lastStep = -1;
    lastFrequency = 0;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  return {
    stop,
    start() {
      stop();
      active = canPlay();
    },
    update(progress: number) {
      if (!active || !canPlay()) return;
      const step = clearLadderStep(Math.max(progress, 0));
      lastFrequency = clearLadderFrequency(step);
      if (step === lastStep) return;
      lastStep = step;
      note(lastFrequency);
    },
    cancel() {
      const unwind = active && canPlay() && lastStep >= 0;
      const frequency = lastFrequency;
      stop();
      if (!unwind) return;
      for (let index = 1; index <= CLEAR_CANCEL_NOTES; index += 1) {
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            note(
              frequency * 2 ** ((-CLEAR_CANCEL_STEP_SEMITONES * index) / 12),
              CLEAR_CANCEL_GAIN_MULTIPLIER
            );
          },
          (index - 1) * CLEAR_CANCEL_SPACING_MS
        );
        timers.add(timer);
      }
    },
  };
}

// The page turn that closes a committed clear. A commit that beats the load plays it the
// moment it arrives. A failed load is silent and retried by the next gesture: the sound is polish,
// never a reason for Clear to fail.
export function createClearSound(load: ClearPageTurnLoader) {
  let enabled = false;
  let foreground = true;
  let volume = SOUND_VOLUME_DEFAULT;
  let requested = false;
  let notes: { play: ClearNotePlayer } | null = null;
  let resource: Resource = { status: 'idle' };

  const canPlay = () => enabled && foreground;
  const gesture = createClearGestureSound(canPlay, note);

  async function note(frequency: number, gain = 1) {
    if (!canPlay() || notes === null) return;
    const current = notes;
    try {
      await current.play(frequency, soundVolumeGain(volume) * gain);
    } catch {
      if (notes === current) release();
    }
  }

  function release() {
    requested = false;
    gesture.stop();
    notes = null;
    const old = resource;
    resource = { status: 'idle' };
    if (old.status === 'loading') old.request.abort();
    if (old.status === 'ready') old.turn.dispose();
  }

  function playIfReady() {
    if (!requested || resource.status !== 'ready' || !canPlay()) return;
    requested = false;
    try {
      resource.turn.play(CLEAR_PAGE_TURN_GAIN * soundVolumeGain(volume));
    } catch {
      release();
    }
  }

  function prepare() {
    if (resource.status !== 'idle' || !canPlay()) return;
    const request = new AbortController();
    resource = { status: 'loading', request };
    const isCurrentLoad = () => resource.status === 'loading' && resource.request === request;
    void load(request.signal, (play) => {
      if (isCurrentLoad()) notes = { play };
    })
      .then((turn) => {
        if (!isCurrentLoad()) {
          turn.dispose();
          return;
        }
        resource = { status: 'ready', turn };
        playIfReady();
      })
      .catch(() => {
        if (isCurrentLoad()) {
          notes = null;
          resource = { status: 'idle' };
        }
      });
  }

  return {
    prepare,
    start() {
      requested = false;
      gesture.start();
      prepare();
    },
    update: gesture.update,
    commit() {
      if (!canPlay()) return;
      gesture.stop();
      requested = true;
      prepare();
      playIfReady();
    },
    cancel() {
      requested = false;
      gesture.cancel();
    },
    setVolume(next: number) {
      volume = next;
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) release();
    },
    setForeground(value: boolean) {
      const becameForeground = !foreground && value;
      foreground = value;
      if (!value) release();
      else if (becameForeground) prepare();
    },
    dispose() {
      enabled = false;
      release();
    },
  };
}

export type ClearSound = ReturnType<typeof createClearSound>;
