/**
 * Scoring.
 *
 * Pure functions from raw rows to numbers. Nothing here reads a file or a device, so a whole
 * corpus can be re-derived offline when a definition turns out to be wrong. The summary shapes are
 * transcribed from the shipped scorers with their field names, because every tracked capture
 * already carries them and renaming them is what breaks a corpus. Every function that needs app
 * knowledge takes it as an argument, and the package ships no calibration constant.
 */

import type { FramesReport } from './artifact.js';
import type { ActionGate } from './gates.js';
import type { FrameStampEpoch } from './probe.js';
import type { ResolvedActionPlan } from './scenario.js';
import type { DesktopEngine, RefreshRegimeBand, RefreshRegimeId } from './target.js';

export declare function percentile(values: readonly number[], fraction: number): number | undefined;

/** The dominant frame interval: the largest 0.5 ms bucket's own median. A percentile drags toward doubled intervals. */
export declare function observedFrameIntervalMs(frames: FramesReport['frames']): number;

/** Frame pacing over one population, priced against the beat, crediting a late frame the next frame gives back. */
export interface PacingStats {
  readonly frames: number;
  readonly p50: number | undefined;
  readonly p95: number | undefined;
  readonly p99: number | undefined;
  readonly max: number | undefined;
  readonly budgetMs: number;
  readonly lateThresholdMs: number;
  readonly lateShare: number;
  readonly stallShare: number;
  readonly elapsedMs: number;
  readonly lostMs: number;
  readonly lostFrameTimeShare: number | undefined;
}
export declare function frameStats(
  deltas: readonly number[],
  intervalMs: number,
  nextDeltas?: readonly number[]
): PacingStats;

/** As the shipped regime module records it; `null` when no minority frames were observed. */
export interface RegimeMixture {
  readonly observedRegime: RefreshRegimeId;
  readonly minorityRegime: RefreshRegimeId;
  readonly slowerThanObserved: boolean;
  readonly sustainedMinorityShare: number;
  readonly runMinFrames: number;
  readonly frames: number;
}

export declare function classifyRefreshRegime(
  intervalMs: number,
  regimes: readonly RefreshRegimeBand[]
): RefreshRegimeId | null;

/** `matched` is the runner's question (retry or bank); `scoreable` is the fold's (publish a number). */
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
  mixture: RegimeMixture | null,
  regimes: readonly RefreshRegimeBand[]
): RefreshRegimeVerdict;

/** The input block every phase summary carries. `kinds` is the pointer kinds seen joined with `+`. */
export interface InputSummary {
  readonly moves: number;
  readonly movesPerFrame: number;
  readonly movesPerSecond: number;
  readonly kinds: string;
  readonly coalescedPerMove: number;
  readonly coalescedSpanMs: { readonly p50: number | undefined; readonly p95: number | undefined };
  readonly trust: { readonly share: number; readonly untrusted: number };
  readonly pressure: { readonly p50: number | undefined; readonly nonZero: number };
  readonly contactWidth: { readonly p50: number | undefined };
  readonly contactHeight: { readonly p50: number | undefined };
  readonly moveGapP95Ms: number | undefined;
  readonly moveGapMaxMs: number | undefined;
}

/**
 * Input fidelity. Trusted touch and cadence are universal; the rest describe a runtime and carry
 * one of three states: calibrated against a hand capture and a known-bad control; uncalibrated,
 * which is a gap recapturing cannot close and never a pass; or not-applicable, measured and found
 * to carry no information, recorded as a witness and absent from the checks so silence is never
 * mistaken for a pass.
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

/** The shipped verdict shape: `null` marks an uncalibrated check; a not-applicable check is absent. */
export interface FidelityVerdict {
  readonly runtime: string;
  readonly passed: boolean;
  readonly checks: Readonly<Partial<Record<FidelityCheckKind, boolean | null>>>;
  readonly uncalibrated: readonly FidelityCheckKind[];
  readonly notApplicable: readonly FidelityCheckKind[];
}

export declare function inputFidelity<R extends string>(
  input: InputSummary,
  runtime: R,
  expectations: FidelityExpectations<R>
): FidelityVerdict;
export declare function describeFidelityFailures(verdict: FidelityVerdict): string;
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

export type PhaseFinding =
  | 'input loss'
  | 'redundant per-event work'
  | 'input queued'
  | 'frame loss'
  | 'stalls'
  | 'paint latency';

export interface StarvationPopulation {
  readonly episodes: number;
  readonly lostMs: number;
  readonly lostFrameTimeShare: number | undefined;
  readonly commitsAttributed: number;
}

/** Transcribed from the shipped phase summariser; the app's passthrough fields ride alongside. */
export interface PhaseSummary {
  readonly key: string;
  readonly suppress: string;
  readonly abandoned: boolean;
  readonly contactSeconds: number;
  readonly pacing: PacingStats;
  readonly betweenStrokes: PacingStats;
  readonly wholeWindow: PacingStats;
  readonly starvation: {
    readonly thresholdMs: number;
    readonly attributionWindowMs: number;
    readonly all: StarvationPopulation;
    readonly inContact: StarvationPopulation;
    readonly betweenStrokes: StarvationPopulation;
    readonly episodes: readonly {
      readonly startMs: number;
      readonly durationMs: number;
      readonly trustedMoves: number;
      readonly engineShare: number;
    }[];
  };
  readonly paintLatencyMs: {
    readonly p50: number | undefined;
    readonly p95: number | undefined;
    readonly p99: number | undefined;
    readonly max: number | undefined;
  };
  readonly queueDelayMs: {
    readonly p50: number | undefined;
    readonly p95: number | undefined;
    readonly max: number | undefined;
  };
  readonly input: InputSummary;
  readonly engine: {
    readonly msPerFrame: number;
    readonly msPerLateFrame: number;
    readonly lateFrames: number;
    readonly byName: Readonly<
      Record<string, { readonly count: number; readonly maxMs: number; readonly totalMs: number }>
    >;
  };
  readonly strokes: {
    readonly count: number;
    readonly long: number;
    readonly short: number;
    readonly adopted: number;
    readonly movesPerLongStroke: number;
    readonly endHitchMaxMs: number | undefined;
    readonly stalledLifts: number;
    readonly measuredLifts: number;
    readonly notableLifts: number;
    readonly liftMs: { readonly p50: number | undefined; readonly p95: number | undefined };
    readonly longStrokeTrend: number | null;
  };
  readonly worstFrames: readonly {
    readonly atMs: number;
    readonly gapMs: number;
    readonly marks: readonly string[];
  }[];
  /** The findings joined with ` + `, or `clean`, or `no drawing recorded`. */
  readonly verdict: string;
  readonly findings: readonly PhaseFinding[];
  readonly [passthrough: string]: unknown;
}

export interface FramesSummary {
  readonly intervalMs: number;
  readonly regimeMixture: RegimeMixture | null;
  readonly phases: readonly PhaseSummary[];
  readonly scoringEpoch: number;
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

/** A sample as the actions probe emits it, stamped with the resolved action id by the runner. */
export interface ActionSample {
  readonly actionId: string;
  readonly label: string;
  readonly repeat: number;
  readonly warmup: boolean;
  readonly eventType: string;
  readonly trusted: boolean | null;
  readonly readyMs: number | null;
  readonly firstFrameMs: number | null;
  readonly postActionFrames: readonly ActionFrameRow[];
  /** Kept for artifacts that predate `postActionFrames`. */
  readonly frameGapsMs?: readonly number[];
  readonly postActionFrameGapsMs?: readonly number[];
  readonly activities: readonly {
    readonly atFromActionMs: number;
    readonly type: string;
    readonly property?: string;
  }[];
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

export interface Distribution {
  readonly count: number;
  readonly p50: number | undefined;
  readonly p95: number | undefined;
  readonly max: number | undefined;
}

/** Transcribed from the shipped action-group summariser. */
export interface ActionSummary {
  readonly actionId: string;
  readonly label: string;
  readonly count: number;
  readonly totalCount: number;
  readonly activation: {
    readonly captured: number;
    readonly valid: number;
    readonly passed: boolean;
  };
  readonly firstFrame: Distribution & { readonly na?: true };
  readonly ready: Distribution;
  readonly frames: Distribution & {
    readonly raw: Distribution;
    readonly maxBreachSamples: number;
    readonly maxUnconfirmed: boolean;
  };
  readonly frameSamples: { readonly scored: number; readonly raw: number };
  readonly frameStamps?: {
    readonly hiddenOverruns: number;
    readonly actualGapP95: number;
    readonly callbackDelayP95: number;
  };
  readonly gateAllowance?: { readonly p95Ms?: number; readonly maxMs?: number };
  readonly passed: boolean;
}

/** The plan is the join between samples, allowances and the first-frame rule; nothing is keyed by label. */
export declare function summariseActions<T extends string, R extends string>(
  samples: readonly ActionSample[],
  plan: ResolvedActionPlan,
  gate: ActionGate<T, R>,
  context: { readonly target: T; readonly runtime: R; readonly engine: DesktopEngine | null }
): readonly ActionSummary[];

/** Exported so a corpus test and a doc guard derive the callback from the same data the scorer uses. */
export declare function firstFrameNaFor<T extends string, R extends string>(
  gate: ActionGate<T, R>,
  context: { readonly runtime: R; readonly engine: DesktopEngine | null }
): (actionId: string) => string | null;
export declare function allowancesFor<T extends string>(
  gate: ActionGate<T, string>,
  target: T
): Readonly<Record<string, { readonly p95Ms?: number; readonly maxMs?: number }>>;

/** Scheduled-versus-actual clock divergence over the scored frames; attribution, never gating. */
export declare function frameStampDivergence(
  frames: readonly ActionFrameRow[],
  maxGateMs: number
): {
  readonly hiddenOverruns: number;
  readonly actualGapP95: number;
  readonly callbackDelayP95: number;
} | null;

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
  samples: readonly {
    readonly engineMs: number;
    readonly nextFrameMs: number;
    readonly startedAt: number;
    readonly endedAt: number;
  }[],
  frames: FramesReport['frames'] | null,
  gate: {
    readonly engineP95Ms: number;
    readonly nextFrameP95Ms: number;
    readonly nextFrameMaxMs: number;
  }
): RepeatedActionSummary;

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
