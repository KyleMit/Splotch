/**
 * Gates.
 *
 * A gate is a policy applied to a summary: thresholds, per-cell exceptions, per-label allowances,
 * and the confirmation rule that says how many scored repeats must breach. The package ships the
 * evaluator and the vocabulary; every number is the app's, and every exception carries its basis
 * so the artifact and the report can quote it. The artifact records the policy it was scored
 * under as provenance; a campaign fold re-evaluates under the current policy and never reads the
 * stored verdict for a decision.
 */

import type { DesktopEngine } from './target.js';
import type { PhaseSummary } from './scoring.js';

export interface DrawingGate<Target extends string = string, Tool extends string = string> {
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly frameMaxMs: number;
  readonly lostFrameTimeShare: number;
  /** Entries only ratchet down and are set from the worst single capture, never the best median. */
  readonly exceptions?: readonly {
    readonly target: Target;
    readonly tool: Tool;
    readonly lostFrameTimeShare: number;
    readonly basis: string;
  }[];
}

export interface ActionGate<Target extends string = string, Runtime extends string = string> {
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly firstFrameMs: number;
  readonly maxBreachConfirmingSamples: number;
  readonly warmupRepeats: number;
  readonly minGatedSamples: number;
  readonly allowances?: readonly {
    readonly target: Target;
    readonly adrs: readonly string[];
    readonly entries: readonly {
      readonly actionId: string;
      readonly p95Ms?: number;
      readonly maxMs?: number;
      readonly basis: string;
    }[];
  }[];
  /** Actions whose first frame is not applicable on a runtime (and, on desktop, an engine measured inert). */
  readonly firstFrameNotApplicable?: readonly {
    readonly actionIdPattern: string;
    readonly runtimes: readonly Runtime[];
    readonly engines?: readonly DesktopEngine[];
    readonly reason: string;
  }[];
}

export interface RepeatedActionGate {
  readonly engineP95Ms: number;
  readonly nextFrameP95Ms: number;
  readonly nextFrameMaxMs: number;
}

export interface CommitGate {
  readonly budgetMs: number;
  readonly percentile: number;
  /** A breach is confirmed by a second measurement of the same case. */
  readonly confirmations: number;
  /** Optional per-case normalisation by same-run throughput against a controlled reference. */
  readonly normalise?: {
    readonly caseKey: string;
    readonly referenceTotalMs: number;
    readonly enabled: boolean;
  };
}

export interface GatePolicy<
  Target extends string = string,
  Tool extends string = string,
  Runtime extends string = string,
> {
  readonly drawing?: DrawingGate<Target, Tool>;
  readonly actions?: ActionGate<Target, Runtime>;
  readonly repeatedAction?: RepeatedActionGate;
  readonly commit?: CommitGate;
}

export interface GateVerdict {
  readonly passed: boolean;
  readonly breaches: readonly {
    readonly scope: string;
    readonly cause: string;
    readonly observed: number;
    readonly limit: number;
  }[];
  readonly unconfirmed: readonly { readonly scope: string; readonly cause: string }[];
  /** `<scope>:<cause>` per breach, so a retry can confirm only the same failure. */
  readonly fingerprint: readonly string[];
}

export declare function evaluateDrawing<T extends string, M extends string>(
  phases: readonly PhaseSummary[],
  gate: DrawingGate<T, M>,
  cell: { readonly target: T; readonly tool: M }
): GateVerdict;

export declare function evaluateActions<T extends string, R extends string>(
  summaries: readonly {
    readonly label: string;
    readonly actionId: string;
    readonly firstFrame: { readonly p95: number; readonly na: string | null };
    readonly frames: {
      readonly p95: number;
      readonly max: number;
      readonly maxBreachSamples: number;
    };
  }[],
  gate: ActionGate<T, R>,
  context: { readonly target: T; readonly runtime: R; readonly engine: DesktopEngine | null }
): GateVerdict;

/** Per case: the measurement, its confirmation, and a tri-state outcome. */
export declare function evaluateCommit(
  cases: readonly {
    readonly key: string;
    readonly first: readonly number[];
    readonly confirmation?: readonly number[];
    readonly normaliser?: number;
  }[],
  gate: CommitGate
): GateVerdict & {
  readonly cases: readonly {
    readonly key: string;
    readonly outcome: 'pass' | 'unconfirmed' | 'confirmed-breach' | 'skipped';
  }[];
};

/** Intersect two failure fingerprints; an uncomparable pair is named rather than read as "nothing reproduced". */
export declare function reproducedFailures(
  first: readonly string[],
  second: readonly string[]
): readonly string[] | 'not-comparable';

export declare function defineGates<const G extends GatePolicy>(gates: G): G;
