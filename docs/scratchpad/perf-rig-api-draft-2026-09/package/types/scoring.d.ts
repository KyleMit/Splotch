/**
 * Scoring.
 *
 * Pure functions from raw rows to numbers. Nothing here reads a file or a device, so a whole
 * corpus can be re-derived offline when a definition turns out to be wrong — which happened three
 * times in one campaign. Every constant that encodes a measured decision is exported with its unit
 * so an app can cite it, and every function that needs app knowledge takes it as an argument.
 */

import type { RawReport } from './artifact.js';
import type { RefreshRegimeBand, RefreshRegimeId } from './target.js';

export declare function percentile(values: readonly number[], fraction: number): number | undefined;

/**
 * The dominant frame interval (ADR-0134): the largest 0.5 ms bucket's own median. A percentile
 * drags toward doubled intervals on a variable-refresh display.
 */
export declare function observedFrameIntervalMs(frames: RawReport['frames']): number;

/** Lost time over elapsed time, priced against the beat, crediting a late frame the next frame gives back (ADR-0136). */
export declare function frameStats(
  deltas: readonly number[],
  intervalMs: number
): {
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly lostFrameTimeShare: number;
  readonly lateFrames: number;
  readonly creditedFrames: number;
};

export declare const REFRESH_REGIMES: readonly RefreshRegimeBand[];
export declare function classifyRefreshRegime(
  intervalMs: number,
  regimes?: readonly RefreshRegimeBand[]
): RefreshRegimeId | null;
export declare function refreshRegimeVerdict(
  intervalMs: number,
  expected: RefreshRegimeId | null,
  mixture: { readonly minorityShare: number }
): {
  readonly regime: RefreshRegimeId | null;
  readonly scoreable: boolean;
  readonly reason?: string;
};

/**
 * Input fidelity: whether a capture exercised a hand-shaped input path, judged per capture runtime
 * against an app-owned expectation table. Three outcomes per check, because most checks describe a
 * runtime rather than faithful input: `failed` invalidates the number; `uncalibrated` means no
 * measured expectation exists yet and recapturing cannot help; a check absent from the record was
 * measured and found to carry no information, and is never a silent pass (ADR-0141).
 */
export interface FidelityCheckSpec {
  readonly kind:
    'trustedTouch' | 'cadence' | 'moveGap' | 'pressure' | 'contactGeometry' | 'coalescing';
  readonly state: 'calibrated' | 'uncalibrated' | 'not-applicable' | 'witness';
  readonly bounds?: { readonly min?: number; readonly max?: number };
  /** Where the bound came from. A threshold set from the automation is not calibrated. */
  readonly basis?: string;
}

export type FidelityExpectations = Readonly<Record<string, readonly FidelityCheckSpec[]>>;

export interface InputSummary {
  readonly movesPerSecond: number;
  readonly movesPerFrame: number;
  readonly moveGapP95Ms: number;
  readonly trustShare: number;
  readonly pressureP50?: number;
  readonly contactWidthP50?: number;
  readonly contactHeightP50?: number;
  readonly coalescedPerMove?: number;
}

export interface FidelityVerdict {
  readonly passed: boolean;
  readonly checks: readonly {
    readonly kind: FidelityCheckSpec['kind'];
    readonly state: 'passed' | 'failed' | 'uncalibrated';
    readonly observed?: number;
  }[];
  readonly witnesses: readonly {
    readonly kind: FidelityCheckSpec['kind'];
    readonly observed?: number;
  }[];
  readonly onlyUncalibratedFailed: boolean;
}

export declare function inputFidelity(
  input: InputSummary,
  runtime: string,
  expectations: FidelityExpectations
): FidelityVerdict;

/** Cadence gates on moves per frame, not on a rate; a rate encodes the panel's refresh (ADR-0145). */
export declare const FIDELITY_MOVES_PER_FRAME_MIN_DEFAULT: 0.9;
export declare const FIDELITY_MOVE_GAP_P95_MAX_MS_DEFAULT: 25;

export interface FramesSummaryOptions {
  readonly measures: { readonly draw: string; readonly commit: string; readonly namespace: string };
  /** Phase keys carried through from the probe untouched. */
  readonly passthroughPhaseFields?: readonly string[];
  readonly baselinePhase?: string;
}

export interface PhaseSummary {
  readonly key: string;
  readonly intervalMs: number;
  readonly frames: ReturnType<typeof frameStats>;
  readonly input: InputSummary;
  readonly engine: Readonly<
    Record<string, { readonly count: number; readonly maxMs: number; readonly totalMs: number }>
  >;
  readonly starvation: readonly {
    readonly startMs: number;
    readonly durationMs: number;
    readonly trustedMoves: number;
  }[];
  readonly classification:
    | 'clean'
    | 'input loss'
    | 'redundant per-event work'
    | 'input queued'
    | 'frame loss'
    | 'stalls'
    | 'paint latency';
  readonly [passthrough: string]: unknown;
}

export declare function summariseFrames(
  report: RawReport,
  options: FramesSummaryOptions
): {
  readonly intervalMs: number;
  readonly regimeMixture: { readonly minorityShare: number };
  readonly phases: readonly PhaseSummary[];
};

export interface ActionSample {
  readonly label: string;
  readonly repeat: number;
  readonly warmup: boolean;
  readonly readyMs: number;
  readonly firstFrameMs: number;
  readonly postActionFrames: readonly { readonly gapMs: number; readonly actualGapMs?: number }[];
}

export interface ActionSummary {
  readonly label: string;
  readonly count: number;
  readonly firstFrame: { readonly p95: number; readonly max: number };
  readonly ready: { readonly p95: number };
  readonly postActionFrames: {
    readonly p95: number;
    readonly max: number;
    readonly maxBreachSamples: number;
  };
  /** Non-gating attribution from the actual clock (ADR-0163). */
  readonly frameStamps?: { readonly hiddenOverruns: number; readonly actualGapP95: number };
}

export declare function summariseActions(
  samples: readonly ActionSample[],
  expectedLabels: readonly string[]
): readonly ActionSummary[];

/** Engine duration plus next-frame delay for a repeated measured action. */
export declare function summariseMeasuredAction(
  actions: readonly { readonly engineMs: number; readonly nextFrameMs: number }[]
): {
  readonly count: number;
  readonly engine: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  };
  readonly nextFrame: { readonly p95: number; readonly max: number };
};

export declare const LONG_TASK_MS: 50;
export declare const HOST_QUIET_MAX_LOAD_PER_CORE: 0.5;
