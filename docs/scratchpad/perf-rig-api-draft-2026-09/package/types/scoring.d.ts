/**
 * Scoring.
 *
 * Pure functions from raw rows to numbers. Nothing here reads a file or a device, so a whole
 * corpus can be re-derived offline when a definition turns out to be wrong. Field names on the
 * summaries are the ones every tracked capture already carries; renaming them is what breaks a
 * corpus. Every function that needs app knowledge takes it as an argument, and the package ships
 * no calibration constant: a threshold set from the automation is not calibrated.
 */

import type { FramesReport } from './artifact.js';
import type { FrameStampEpoch } from './probe.js';
import type { RefreshRegimeBand, RefreshRegimeId } from './target.js';

export declare function percentile(values: readonly number[], fraction: number): number | undefined;

/** The dominant frame interval: the largest 0.5 ms bucket's own median. A percentile drags toward doubled intervals. */
export declare function observedFrameIntervalMs(frames: FramesReport['frames']): number;

/** Lost time over elapsed time, priced against the beat, crediting a late frame the next frame gives back. */
export interface PacingStats {
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly lostFrameTimeShare: number;
  readonly lateFrames: number;
  readonly creditedFrames: number;
  readonly frames: number;
}
export declare function frameStats(deltas: readonly number[], intervalMs: number): PacingStats;

export interface RegimeMixture {
  readonly minorityShare: number;
  readonly sustainedMinorityShare: number;
  readonly slowerThanObserved: boolean;
}

export declare function classifyRefreshRegime(
  intervalMs: number,
  regimes: readonly RefreshRegimeBand[]
): RefreshRegimeId | null;

/**
 * `matched` is the runner's question (retry or bank); `scoreable` is the fold's (publish a number).
 * An unestablished target is banked but never scored; a mixed in-contact presentation is refused.
 */
export interface RefreshRegimeVerdict {
  readonly regime: RefreshRegimeId | null;
  readonly expected: RefreshRegimeId | null;
  readonly outcome: 'in-regime' | 'off-regime' | 'unestablished' | 'mixed';
  readonly matched: boolean;
  readonly scoreable: boolean;
  readonly reason?: string;
}
export declare function refreshRegimeVerdict(
  intervalMs: number,
  expected: RefreshRegimeId | null,
  mixture: RegimeMixture,
  regimes: readonly RefreshRegimeBand[]
): RefreshRegimeVerdict;

/** The input block every phase summary carries; the legacy field names are the contract. */
export interface InputSummary {
  readonly kinds: 'touch' | 'pen' | 'mouse' | 'mixed' | 'none';
  readonly trust: { readonly share: number };
  readonly movesPerSecond: number;
  readonly movesPerFrame: number;
  readonly moveGapP95Ms: number;
  readonly pressure?: { readonly p50: number };
  readonly contactWidth?: { readonly p50: number };
  readonly contactHeight?: { readonly p50: number };
  readonly coalescedPerMove?: number;
}

/**
 * Input fidelity. Two checks are universal: trusted touch and cadence (density in moves per frame
 * plus a burst cap on the p95 gap, never a rate, because a rate encodes the panel's refresh). The
 * rest describe a runtime and carry one of three states: calibrated against a hand capture and a
 * known-bad control; uncalibrated, which is a gap recapturing cannot close and never a pass; or
 * not-applicable, measured and found to carry no information, recorded as a witness and absent
 * from the checks so silence is never mistaken for a pass.
 */
export type UniversalCheck = 'trustedTouch' | 'cadence';
export type RuntimeCheck = 'pressure' | 'contactGeometry' | 'coalescing';
export type FidelityCheckKind = UniversalCheck | RuntimeCheck;

export type RuntimeCheckState =
  | {
      readonly state: 'calibrated';
      readonly bounds: { readonly min?: number; readonly max?: number };
      readonly basis: string;
      readonly negativeControl: string;
    }
  | { readonly state: 'uncalibrated' }
  | { readonly state: 'not-applicable'; readonly basis: string };

export interface FidelityExpectations<Runtime extends string = string> {
  readonly universal: {
    readonly cadence: {
      readonly movesPerFrameMin: number;
      readonly moveGapP95MaxMs: number;
      readonly basis: string;
    };
  };
  readonly runtimes: Readonly<Record<Runtime, Readonly<Record<RuntimeCheck, RuntimeCheckState>>>>;
}

export interface FidelityVerdict {
  readonly runtime: string;
  readonly passed: boolean;
  /** `null` marks an uncalibrated check; a not-applicable check is absent. */
  readonly checks: Readonly<Partial<Record<FidelityCheckKind, boolean | null>>>;
  readonly uncalibrated: readonly FidelityCheckKind[];
  readonly notApplicable: readonly FidelityCheckKind[];
  readonly witnesses: Readonly<Partial<Record<RuntimeCheck, number>>>;
}

export declare function inputFidelity<R extends string>(
  input: InputSummary,
  runtime: R,
  expectations: FidelityExpectations<R>
): FidelityVerdict;
export declare function describeFidelityFailures(verdict: FidelityVerdict): string;
/** A failure that invalidates the number, as opposed to one that only reveals an uncalibrated instrument. */
export declare function numberInvalidatingFailure(
  verdict: FidelityVerdict | null | undefined
): boolean;
export declare function onlyUncalibratedChecksFailed(verdict: FidelityVerdict): boolean;
export declare function runtimeHasUncalibratedChecks<R extends string>(
  runtime: R,
  expectations: FidelityExpectations<R>
): boolean;

export interface FramesSummaryOptions {
  readonly namespace: string;
  readonly attribution?: { readonly draw?: string; readonly commit?: string };
  readonly passthroughPhaseFields?: readonly string[];
}

export type PhaseVerdict =
  | 'clean'
  | 'input loss'
  | 'redundant per-event work'
  | 'input queued'
  | 'frame loss'
  | 'stalls'
  | 'paint latency'
  | 'no drawing recorded';

export interface PhaseSummary {
  readonly key: string;
  readonly intervalMs: number;
  readonly pacing: PacingStats;
  readonly betweenStrokes: PacingStats;
  readonly wholeWindow: PacingStats;
  readonly paintLatencyMs: {
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  } | null;
  readonly queueDelayMs: { readonly p95: number; readonly max: number } | null;
  readonly input: InputSummary;
  readonly strokes: { readonly count: number; readonly longestMs: number };
  readonly starvation: {
    readonly all: { readonly lostFrameTimeShare: number };
    readonly inContact: { readonly lostFrameTimeShare: number };
    readonly betweenStrokes: { readonly lostFrameTimeShare: number };
    readonly episodes: readonly {
      readonly startMs: number;
      readonly durationMs: number;
      readonly trustedMoves: number;
    }[];
  };
  readonly engine: {
    readonly msPerFrame: number;
    readonly msPerLateFrame: number;
    readonly lateFrames: number;
    readonly byName: Readonly<
      Record<string, { readonly count: number; readonly maxMs: number; readonly totalMs: number }>
    >;
  } | null;
  readonly worstFrames: readonly {
    readonly atMs: number;
    readonly gapMs: number;
    readonly marks: readonly string[];
  }[];
  readonly verdict: PhaseVerdict;
  readonly [passthrough: string]: unknown;
}

export interface FramesSummary {
  readonly intervalMs: number;
  readonly regimeMixture: RegimeMixture;
  readonly phases: readonly PhaseSummary[];
}

export declare function summariseFrames(
  report: FramesReport,
  options: FramesSummaryOptions
): FramesSummary;

export interface ActionFrameRow {
  readonly startFromActionMs: number;
  readonly endFromActionMs: number;
  readonly gapMs: number;
  readonly visualEffectsActive: boolean;
  readonly ranFromActionMs?: number;
  readonly actualGapMs?: number;
}

/** A sample as the actions probe emits it; the scorer selects frames from these fields. */
export interface ActionSample {
  readonly label: string;
  readonly repeat: number;
  readonly warmup: boolean;
  readonly eventType: string;
  readonly trusted: boolean;
  readonly readyMs: number | null;
  readonly firstFrameMs: number;
  readonly postActionFrames: readonly ActionFrameRow[];
  readonly activities: readonly { readonly atFromActionMs: number; readonly type: string }[];
  readonly canvasMutations: readonly {
    readonly atFromActionMs: number;
    readonly kind: string;
    readonly property: string;
  }[];
  readonly measures: readonly {
    readonly name: string;
    readonly startFromActionMs: number;
    readonly duration: number;
  }[];
  readonly frameStampEpoch: FrameStampEpoch;
}

export interface ActionSummary {
  readonly label: string;
  readonly count: number;
  readonly totalCount: number;
  readonly activation: string;
  readonly firstFrame: { readonly p95: number; readonly max: number; readonly na: string | null };
  readonly ready: { readonly p95: number };
  readonly frames: {
    readonly p95: number;
    readonly max: number;
    readonly raw: readonly number[];
    readonly maxBreachSamples: number;
    readonly maxUnconfirmed: boolean;
  };
  readonly frameSamples: number;
  readonly frameStamps?: {
    readonly hiddenOverruns: number;
    readonly actualGapP95: number;
    readonly callbackDelayP95: number;
  };
  readonly gateAllowance?: { readonly p95Ms?: number; readonly maxMs?: number };
  readonly passed: boolean;
}

export declare const ACTION_SETTLE_TAIL_FRAMES: 4;

export declare function summariseActions(
  samples: readonly ActionSample[],
  expectedLabels: readonly string[],
  allowances: Readonly<Record<string, { readonly p95Ms?: number; readonly maxMs?: number }>>,
  firstFrameNaFor: (label: string) => string | null
): readonly ActionSummary[];

/** Scheduled-versus-actual clock divergence over the scored frames; attribution, never gating. */
export declare function frameStampDivergence(
  frames: readonly ActionFrameRow[],
  maxGateMs: number
): { readonly hiddenOverruns: number; readonly actualGapP95: number } | null;

export interface RepeatedActionSummary {
  readonly count: number;
  readonly engine: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  };
  readonly nextFrame: { readonly p95: number; readonly max: number };
  readonly passed: boolean;
}

export declare function summariseRepeatedAction(
  samples: readonly { readonly engineMs: number; readonly nextFrameMs: number }[],
  frames: readonly number[] | null,
  gate: {
    readonly engineP95Ms: number;
    readonly nextFrameP95Ms: number;
    readonly nextFrameMaxMs: number;
  }
): RepeatedActionSummary;

/** Fast-set selection over a rolling history of full runs: sole exercisers are mandatory, the rest rank by headroom. */
export interface FastSetHistory {
  readonly schemaVersion: 1;
  readonly runs: readonly {
    readonly startedAt: string;
    readonly budgetMs: number;
    readonly cases: readonly {
      readonly key: string;
      readonly measuredMs: number;
      readonly headroomRatio: number;
      readonly breached: boolean;
    }[];
  }[];
}
export declare function soleExercisers(
  cases: readonly { readonly key: string; readonly exercises: readonly string[] }[]
): readonly string[];
export declare function deriveIdealFastSet(
  history: FastSetHistory,
  cases: readonly { readonly key: string; readonly exercises: readonly string[] }[],
  size: number
): readonly string[];
export declare function evaluateFastSet(
  history: FastSetHistory,
  current: readonly string[],
  cases: readonly { readonly key: string; readonly exercises: readonly string[] }[]
): { readonly drift: readonly string[]; readonly consecutiveMisses: number };
export declare function appendFullRun(
  history: FastSetHistory,
  run: FastSetHistory['runs'][number],
  retain: number
): FastSetHistory;
export declare function validateFastSetHistory(
  value: unknown,
  caseKeys: readonly string[]
): FastSetHistory;

export declare const LONG_TASK_MS: 50;
export declare const HOST_QUIET_MAX_LOAD_PER_CORE: 0.5;
