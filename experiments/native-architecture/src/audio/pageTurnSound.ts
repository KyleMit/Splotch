import { SOUND_VOLUME_DEFAULT, soundVolumeGain } from '../settings/soundVolume';

type ClearPageTurn = { play(volume: number): void; dispose(): void };
export type ClearPageTurnLoader = (signal: AbortSignal) => Promise<ClearPageTurn>;

// The shipping page turn plays at unit gain scaled by the parent's volume
// (web/src/lib/audio/clearSound.ts); native-clear-projection.test.mjs pins the literal.
export const CLEAR_PAGE_TURN_GAIN = 1;

type Resource =
  | { status: 'idle' }
  | { status: 'loading'; request: AbortController }
  | { status: 'ready'; turn: ClearPageTurn };

// The page turn that closes a committed clear. A commit that beats the load plays it the
// moment it arrives. A failed load is silent and retried by the next gesture: the sound is polish,
// never a reason for Clear to fail.
export function createClearSound(load: ClearPageTurnLoader) {
  let enabled = false;
  let foreground = true;
  let volume = SOUND_VOLUME_DEFAULT;
  let requested = false;
  let resource: Resource = { status: 'idle' };

  const canPlay = () => enabled && foreground;

  function release() {
    requested = false;
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
    void load(request.signal)
      .then((turn) => {
        if (request.signal.aborted || resource.status !== 'loading') {
          turn.dispose();
          return;
        }
        resource = { status: 'ready', turn };
        playIfReady();
      })
      .catch(() => {
        if (resource.status === 'loading' && resource.request === request)
          resource = { status: 'idle' };
      });
  }

  return {
    prepare,
    start() {
      requested = false;
      prepare();
    },
    commit() {
      if (!canPlay()) return;
      requested = true;
      prepare();
      playIfReady();
    },
    cancel() {
      requested = false;
    },
    setVolume(next: number) {
      volume = next;
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) release();
    },
    setForeground(value: boolean) {
      foreground = value;
      if (!value) release();
    },
    dispose() {
      enabled = false;
      release();
    },
  };
}

export type ClearSound = ReturnType<typeof createClearSound>;
