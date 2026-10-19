import type { Point, Stroke } from './model';
import type { PaperInput } from './paperInput';
import type { PerfTimer } from './perfCohort';

// The perf probe's contract, and the build without it: the web export, Node and the type checker
// resolve this file, where every export does nothing and PERF_PROBE stays false. Metro's Android
// and iOS bundles resolve perfProbe.native.ts, which implements each export with these types.
export const PERF_PROBE: boolean = false;

export function perfTimed<A extends unknown[], R>(
  _timer: PerfTimer,
  record: (...args: A) => R
): (...args: A) => R {
  return record;
}

function off() {}

export const perfPacket: (packet: PaperInput) => void = off;
export const perfIdle: () => void = off;
export const perfStroke: (timestamp: number) => void = off;
export const perfSampleTime: (timestamp: number) => void = off;
export const perfAppend: (before: readonly Point[], after: readonly Point[], point: Point) => void =
  off;
export const perfDrained: (strokes: readonly Stroke[]) => void = off;
export const useSurfaceCommitProbe: () => void = off;
export const useInkCommitProbe: (picture: unknown) => void = off;
