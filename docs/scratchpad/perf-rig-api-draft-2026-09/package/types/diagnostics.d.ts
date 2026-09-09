/**
 * Diagnostics and analysers.
 *
 * Library calls at the nested rung; the published CLI (`perf-rig verify`, `perf-rig analyze`)
 * wraps these and nothing else. Each takes the app knowledge it narrates or judges with as an
 * argument: the marks contract for engine attribution, the fidelity table for a verdict, the
 * gesture plan for the input it drives.
 */

import type { AppContract, MarksContract, ToolOf } from './app.js';
import type { CaptureArtifactOf, FramesReport, TraceReport } from './artifact.js';
import type { DeviceSelection, HostOptions } from './capture.js';
import type { GesturePlan } from './scenario.js';
import type {
  FidelityExpectations,
  FidelityVerdict,
  FramesSummary,
  InputSummary,
  SampleStats,
} from './scoring.js';
import type { TargetDefinition } from './target.js';

/** Drive one gesture pass over the split transport and judge it against the app's table; the preflight's input check. */
export interface VerifyInputOptions<A extends AppContract = AppContract> {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly gesture: GesturePlan;
  readonly repeats: number;
  readonly device: DeviceSelection;
  readonly fidelity: FidelityExpectations;
  readonly host?: HostOptions;
  /** A non-loopback address the device can reach; resolved from the host's interfaces when absent. */
  readonly probeHostAddress?: string;
}
export declare function verifyInput<A extends AppContract>(
  options: VerifyInputOptions<A>
): Promise<{
  readonly verdict: FidelityVerdict;
  readonly input: InputSummary;
  readonly report: FramesReport;
}>;

/** Rotate the device both ways through the floor-control host and prove the page follows; restores the lock it found. */
export declare function verifyRotation<A extends AppContract>(options: {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly device: DeviceSelection;
  readonly host?: HostOptions;
  readonly probeHostAddress?: string;
}): Promise<{
  readonly observed: Readonly<
    Record<'PORTRAIT' | 'LANDSCAPE', { readonly reached: boolean; readonly settleMs: number }>
  >;
  readonly lockRestored: boolean;
}>;

/** Two-arm design: the same swipes with and without the frames probe installed, so the probe's own cost is a number. */
export declare function probeOverhead<A extends AppContract>(options: {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly tool: ToolOf<A>;
  readonly samples: number;
  readonly device: DeviceSelection;
  readonly host?: HostOptions;
  readonly upstream?: string;
  readonly probeHostAddress?: string;
}): Promise<{
  readonly arms: Readonly<Record<'bare' | 'probed', SampleStats & { readonly samples: number }>>;
  readonly overheadP95Ms: number | undefined;
}>;

/** Re-derive and print one frames capture; writes `summaries.json` beside it so the capture outlives its maths. */
export declare function analyzeFrames(
  path: string,
  options: {
    readonly marks: MarksContract;
    readonly forensics?: boolean;
    readonly includeUnattributable?: boolean;
  }
): Promise<{
  readonly artifact: CaptureArtifactOf<'frames'>;
  readonly summaries: FramesSummary;
  readonly summariesPath: string;
  readonly text: string;
}>;

export interface TraceAnalysis {
  readonly longTasks: readonly { readonly startTime: number; readonly duration: number }[];
  readonly measures: TraceReport['measures'];
  readonly mainThreadBusyMs: number;
  readonly byCategory: Readonly<Record<string, number>>;
  /** Engine time per measure name, attributed through the marks contract. */
  readonly engine: Readonly<Record<string, { readonly count: number; readonly totalMs: number }>>;
}

/** A Chrome trace (a `trace.json` or the directory holding one) into `summary.json` and `report.md`. */
export declare function analyzeChromeTrace(
  target: string,
  options: { readonly marks: MarksContract }
): Promise<{
  readonly summary: TraceAnalysis;
  readonly files: readonly string[];
  readonly text: string;
}>;

/** A Safari Web Inspector timeline export; paired operations are the contract's `marks.pairedEnd`. */
export declare function analyzeWebInspector(
  path: string,
  options: { readonly marks: MarksContract }
): Promise<{
  readonly records: number;
  readonly byOperation: Readonly<
    Record<string, { readonly count: number; readonly totalMs: number; readonly maxMs: number }>
  >;
  readonly text: string;
}>;
