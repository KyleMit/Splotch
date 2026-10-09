import type { Point } from '../drawing/model';

type DrawingLoop = {
  start: () => void;
  setVolume: (volume: number) => void;
  stop: () => void;
  dispose: () => void;
};
export type DrawingLoopLoader = (
  signal: AbortSignal,
  onFailure: () => void
) => Promise<DrawingLoop>;
// native-audio-projection.test.mjs pins the scratch mapping to its shipping owner without a startup import.
export const BASE_SCRATCH_GAIN = 0.2;
export const FULL_VOLUME_SPEED = 0.45;
export const GAIN_RAMP_S = 0.06;
export const STOP_DECLICK_S = 0.005;
export const TEARDOWN_SLACK_MS = 20;
export const AUDIO_LOAD_TIMEOUT_MS = 10_000;
const STILLNESS_MS = 100;
const MIN_SAMPLE_INTERVAL_MS = 1;

type AudioResource =
  | { status: 'idle' }
  | { status: 'loading'; request: AbortController; deadline: ReturnType<typeof setTimeout> }
  | { status: 'ready'; loop: DrawingLoop };
type AudioState = {
  enabled: boolean;
  foreground: boolean;
  disposed: boolean;
  generation: number;
  active: { point: Point; timestamp: number } | null;
  resource: AudioResource;
  stillness: ReturnType<typeof setTimeout> | null;
  volume: number;
  failureReported: boolean;
  onFailure: () => void;
};
function reportFailure(state: AudioState) {
  if (state.disposed || state.failureReported) return;
  state.failureReported = true;
  state.onFailure();
}
function clearStillness(state: AudioState) {
  if (state.stillness !== null) clearTimeout(state.stillness);
  state.stillness = null;
}
function release(state: AudioState) {
  state.generation += 1;
  const old = state.resource;
  state.resource = { status: 'idle' };
  state.active = null;
  state.volume = 0;
  clearStillness(state);
  if (old.status === 'loading') {
    clearTimeout(old.deadline);
    old.request.abort();
  }
  if (old.status === 'ready') {
    for (const cleanup of [() => old.loop.stop(), () => old.loop.dispose()]) {
      try {
        cleanup();
      } catch {
        reportFailure(state);
      }
    }
  }
}
function fail(state: AudioState) {
  release(state);
  reportFailure(state);
}
function stop(state: AudioState) {
  state.active = null;
  state.volume = 0;
  clearStillness(state);
  if (state.resource.status === 'ready') {
    try {
      state.resource.loop.stop();
    } catch {
      fail(state);
    }
  }
}
function applyVolume(state: AudioState) {
  if (state.resource.status !== 'ready') return;
  try {
    state.resource.loop.setVolume(state.volume);
  } catch {
    fail(state);
  }
}
function prepare(state: AudioState, load: DrawingLoopLoader) {
  if (state.resource.status !== 'idle') return;
  const request = new AbortController();
  const generation = state.generation;
  const deadline = setTimeout(() => fail(state), AUDIO_LOAD_TIMEOUT_MS);
  state.resource = { status: 'loading', request, deadline };
  const expired = () => request.signal.aborted || state.disposed || generation !== state.generation;
  void load(request.signal, () => {
    if (!expired()) fail(state);
  })
    .then((ready) => {
      clearTimeout(deadline);
      if (expired()) {
        ready.dispose();
        return;
      }
      state.resource = { status: 'ready', loop: ready };
      if (state.active && state.enabled && state.foreground) {
        try {
          ready.start();
          applyVolume(state);
        } catch {
          fail(state);
        }
      }
    })
    .catch(() => {
      clearTimeout(deadline);
      if (!expired()) fail(state);
    });
}
export function createDrawingAudio(load: DrawingLoopLoader, onFailure: () => void) {
  const state: AudioState = {
    enabled: false,
    foreground: true,
    disposed: false,
    generation: 0,
    active: null,
    resource: { status: 'idle' },
    stillness: null,
    volume: 0,
    failureReported: false,
    onFailure,
  };
  return {
    begin(point: Point, timestamp: number) {
      stop(state);
      if (!state.enabled || !state.foreground || state.disposed || !Number.isFinite(timestamp))
        return;
      state.failureReported = false;
      state.active = { point, timestamp };
      try {
        if (state.resource.status === 'ready') state.resource.loop.start();
        prepare(state, load);
      } catch {
        fail(state);
      }
    },
    sample(point: Point, timestamp: number) {
      if (!state.active || !Number.isFinite(timestamp) || timestamp < state.active.timestamp)
        return;
      const elapsed = Math.max(MIN_SAMPLE_INTERVAL_MS, timestamp - state.active.timestamp);
      const speed =
        Math.hypot(point.x - state.active.point.x, point.y - state.active.point.y) / elapsed;
      state.active = { point, timestamp };
      state.volume = BASE_SCRATCH_GAIN * Math.min(speed / FULL_VOLUME_SPEED, 1);
      applyVolume(state);
      clearStillness(state);
      state.stillness = setTimeout(() => {
        state.volume = 0;
        applyVolume(state);
        state.stillness = null;
      }, STILLNESS_MS);
    },
    end() {
      stop(state);
    },
    setEnabled(value: boolean) {
      state.enabled = value;
      if (!value) release(state);
    },
    setForeground(value: boolean) {
      state.foreground = value;
      if (!value) release(state);
    },
    dispose() {
      state.disposed = true;
      release(state);
    },
  };
}
