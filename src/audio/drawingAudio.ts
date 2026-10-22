import type { Point } from '../drawing/model';
import {
  calculateStrokeSpeed,
  STROKE_SPEED_WINDOW_MS,
  type SpeedSample,
} from '../lib/drawing/strokeMath';
import { isSoundVolume, SOUND_VOLUME_DEFAULT, soundVolumeGain } from '../settings/soundVolume';

export type DrawingLoop = {
  start: () => void;
  setVolume: (volume: number) => void;
  stop: () => void;
  dispose: () => void;
};
export type DrawingLoopLoader = (
  signal: AbortSignal,
  onFailure: () => void
) => Promise<DrawingLoop>;
// native-audio-projection.test.mjs pins the portable gain/timing literals without a startup import.
export const BASE_SCRATCH_GAIN = 0.2;
export const FULL_VOLUME_BACKING_PX_PER_MS = 0.45;
export const GAIN_RAMP_S = 0.06;
export const STOP_DECLICK_S = 0.005;
export const TEARDOWN_SLACK_MS = 20;
export const AUDIO_LOAD_TIMEOUT_MS = 10_000;

export type AudioSample = { point: Point; timestamp: number; samples: SpeedSample[] };

type AudioResource =
  | { status: 'idle' }
  | { status: 'loading'; request: AbortController; deadline: ReturnType<typeof setTimeout> }
  | { status: 'ready'; loop: DrawingLoop };
type AudioState = {
  enabled: boolean;
  foreground: boolean;
  disposed: boolean;
  generation: number;
  active: AudioSample | null;
  resource: AudioResource;
  volume: number;
  gain: number;
  failureReported: boolean;
  onFailure: () => void;
  onReady: () => void;
};
function reportFailure(state: AudioState) {
  if (state.disposed || state.failureReported) return;
  state.failureReported = true;
  state.onFailure();
}
function release(state: AudioState) {
  state.generation += 1;
  const old = state.resource;
  state.resource = { status: 'idle' };
  state.active = null;
  state.volume = 0;
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
function failLoad(state: AudioState) {
  if (state.active) fail(state);
  else release(state);
}
function stop(state: AudioState) {
  state.active = null;
  state.volume = 0;
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
    state.resource.loop.setVolume(state.volume * state.gain);
  } catch {
    fail(state);
  }
}
function prepare(state: AudioState, load: DrawingLoopLoader) {
  if (state.resource.status !== 'idle') return;
  const request = new AbortController();
  const generation = state.generation;
  const deadline = setTimeout(() => failLoad(state), AUDIO_LOAD_TIMEOUT_MS);
  state.resource = { status: 'loading', request, deadline };
  const expired = () => request.signal.aborted || state.disposed || generation !== state.generation;
  void load(request.signal, () => {
    if (!expired()) failLoad(state);
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
      if (!expired() && state.resource.status === 'ready') state.onReady();
    })
    .catch(() => {
      clearTimeout(deadline);
      if (!expired()) failLoad(state);
    });
}
export function createDrawingAudio(
  load: DrawingLoopLoader,
  onFailure: () => void,
  onReady: () => void
) {
  const state: AudioState = {
    enabled: false,
    foreground: true,
    disposed: false,
    generation: 0,
    active: null,
    resource: { status: 'idle' },
    volume: 0,
    gain: soundVolumeGain(SOUND_VOLUME_DEFAULT),
    failureReported: false,
    onFailure,
    onReady,
  };
  return {
    prepare() {
      if (state.enabled && state.foreground && !state.disposed) prepare(state, load);
    },
    begin(point: Point, timestamp: number) {
      stop(state);
      if (!state.enabled || !state.foreground || state.disposed || !Number.isFinite(timestamp))
        return;
      state.failureReported = false;
      state.active = { point, timestamp, samples: [{ t: timestamp, distance: 0 }] };
      try {
        if (state.resource.status === 'ready') state.resource.loop.start();
        prepare(state, load);
      } catch {
        fail(state);
      }
    },
    sample(point: Point, timestamp: number, previous: AudioSample | null = state.active) {
      if (
        !state.active ||
        !previous ||
        !Number.isFinite(timestamp) ||
        !Number.isFinite(previous.timestamp) ||
        timestamp < previous.timestamp
      )
        return;
      const speed = calculateStrokeSpeed(
        previous.samples,
        {
          t: timestamp,
          distance: Math.hypot(point.x - previous.point.x, point.y - previous.point.y),
        },
        STROKE_SPEED_WINDOW_MS
      );
      state.active = { point, timestamp, samples: previous.samples };
      state.volume = BASE_SCRATCH_GAIN * Math.min(speed / FULL_VOLUME_BACKING_PX_PER_MS, 1);
      applyVolume(state);
    },
    end() {
      stop(state);
    },
    setVolume(volume: number) {
      if (state.disposed) return;
      if (!isSoundVolume(volume)) throw new Error('Volume is invalid.');
      const gain = soundVolumeGain(volume);
      if (state.gain === gain) return;
      state.gain = gain;
      applyVolume(state);
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

export type DrawingAudio = ReturnType<typeof createDrawingAudio>;
