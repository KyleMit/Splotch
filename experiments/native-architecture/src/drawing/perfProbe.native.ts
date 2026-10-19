import { useLayoutEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import type * as Contract from './perfProbe';
import {
  appendOutcome,
  createPerfCohorts,
  PERF_LOG_MODULE,
  PERF_LOG_TAG,
  type ClockJoin,
} from './perfCohort';

// The Android and iOS perf probe, with the types perfProbe.ts declares. babel-preset-expo replaces
// process.env.EXPO_PUBLIC_* with the bundling process's value when it builds a production bundle,
// so a Release bundle built without the variable holds `false` here and each probe call site costs
// one falsy check. DEVELOPMENT.md has the probe build recipe.
export const PERF_PROBE: typeof Contract.PERF_PROBE =
  process.env.EXPO_PUBLIC_SPLOTCH_PERF_PROBE === '1';

// React Native's performance.now() is HighResTimeStamp::now(): mach_absolute_time on iOS, the
// clock UITouch.timestamp reads, and steady_clock (CLOCK_MONOTONIC) on Android, the clock
// MotionEvent.getEventTime() reads in whole milliseconds, so an Android interval can read up to
// 1 ms long.
const CLOCK_JOINS = {
  ios: { clock: 'mach_absolute_time', errorMs: 0 },
  android: { clock: 'CLOCK_MONOTONIC', errorMs: 1 },
} satisfies Record<'ios' | 'android', ClockJoin>;

type PerfLog = { write: (line: string) => void };

function isPerfLog(value: unknown): value is PerfLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    'write' in value &&
    typeof value.write === 'function'
  );
}

function writeLine(line: string) {
  const log: unknown = Reflect.get(NativeModules, PERF_LOG_MODULE);
  if (isPerfLog(log)) log.write(line);
  else console.warn(`${PERF_LOG_TAG} ${line}`);
}

const cohorts = PERF_PROBE
  ? createPerfCohorts(
      {
        now: () => performance.now(),
        schedule: (run, delayMs) => setTimeout(run, delayMs),
        cancel: (handle) => clearTimeout(handle),
      },
      {
        platform: Platform.OS,
        build: process.env.EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD,
        clockJoin: Platform.OS === 'android' ? CLOCK_JOINS.android : CLOCK_JOINS.ios,
      },
      writeLine
    )
  : null;

export const perfPacket: typeof Contract.perfPacket = (packet) => cohorts?.packet(packet);
export const perfIdle: typeof Contract.perfIdle = () => cohorts?.idle();
export const perfStroke: typeof Contract.perfStroke = (timestamp) => cohorts?.stroke(timestamp);
export const perfSampleTime: typeof Contract.perfSampleTime = (timestamp) =>
  cohorts?.sampleTime(timestamp);
export const perfAppend: typeof Contract.perfAppend = (before, after, point) =>
  cohorts?.append(appendOutcome(before, after, point));
export const perfDrained: typeof Contract.perfDrained = (strokes) => cohorts?.drained(strokes);

export const perfTimed: typeof Contract.perfTimed = (timer, record) => {
  if (!PERF_PROBE) return record;
  return (...args) => {
    const start = performance.now();
    try {
      return record(...args);
    } finally {
      cohorts?.timed(timer, performance.now() - start);
    }
  };
};

function useNothing() {}

// Layout effects without dependencies run once per commit that rendered the component; React's
// <Profiler> onRender does not run in a React Native production renderer.
function useSurfaceCommits() {
  useLayoutEffect(() => {
    cohorts?.surfaceCommit();
  });
}

// SkiaPictureView hands a new picture to its native view with a JSI setter in its own
// componentDidUpdate (or constructor, on mount), which React runs before this parent's layout
// effects in the same commit, so the stamp falls just after the hand-off.
function useInkCommits(picture: unknown) {
  useLayoutEffect(() => {
    cohorts?.inkCommit();
  });
  useLayoutEffect(() => {
    if (picture) cohorts?.submitted();
  }, [picture]);
}

export const useSurfaceCommitProbe: typeof Contract.useSurfaceCommitProbe = PERF_PROBE
  ? useSurfaceCommits
  : useNothing;
export const useInkCommitProbe: typeof Contract.useInkCommitProbe = PERF_PROBE
  ? useInkCommits
  : useNothing;
