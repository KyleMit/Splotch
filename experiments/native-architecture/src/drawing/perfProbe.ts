import type { AppendOutcome, Stroke } from './model';
import type { PaperInput } from './paperInput';
import type { PerfTimer } from './perfCohort';

// The perf probe's contract, and the build without it: the web export, Node and the type checker
// resolve this file, where every export does nothing and PERF_PROBE stays false. Metro's Android
// and iOS bundles resolve perfProbe.native.ts, which implements each export with these types.
// Function declarations, not consts: Metro exports a const through a getter, which costs the web
// startup path more bytes.
export const PERF_PROBE = false;

export function perfTimed<A extends unknown[], R>(
  _timer: PerfTimer,
  record: (...args: A) => R
): (...args: A) => R {
  return record;
}

export function perfPacket(_packet: PaperInput) {}
export function perfIdle() {}
export function perfStroke(_timestamp: number) {}
export function perfSampleTime(_timestamp: number) {}
export function perfAppend(_outcome: AppendOutcome) {}
export function perfDrained(_strokes: readonly Stroke[]) {}
export function useSurfaceCommitProbe() {}
export function useInkCommitProbe(_picture: unknown) {}
