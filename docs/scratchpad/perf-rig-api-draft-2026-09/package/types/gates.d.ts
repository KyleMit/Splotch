/**
 * Gates.
 *
 * A gate is a policy applied to a summary: thresholds, per-cell exceptions, per-label allowances,
 * and the confirmation rule that says how many scored repeats must breach. The package ships the
 * evaluator and the vocabulary; every number is the app's, and every exception carries its basis
 * so the artifact and the report can quote it. A single capture cannot know its matrix target id,
 * so exceptions keyed by target are applied by the caller that does.
 */

export interface DrawingGate {
  readonly paintP95Ms: number;
  readonly paintP99Ms: number;
  readonly paintMaxMs: number;
  readonly lostFrameTimeShare: number;
  /** Keyed `<targetId>:<mode>`; entries only ratchet down, and are set from the worst single capture. */
  readonly exceptions?: Readonly<
    Record<string, { readonly lostFrameTimeShare: number; readonly basis: string }>
  >;
}

export interface ActionGate {
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly firstFrameMs: number;
  /** A max breach is confirmed by this many scored repeats; one breach is `unconfirmed`. */
  readonly maxBreachConfirmingSamples: number;
  readonly warmupRepeats: number;
  readonly minGatedSamples: number;
  /** Per-target, per-label allowances with their measured basis. */
  readonly allowances?: Readonly<
    Record<
      string,
      Readonly<
        Record<string, { readonly p95Ms?: number; readonly maxMs?: number; readonly basis: string }>
      >
    >
  >;
  /** Labels whose first frame is not applicable on a runtime, with the reason. */
  readonly firstFrameNotApplicable?: (runtime: string, label: string) => string | null;
}

export interface MeasuredActionGate {
  readonly engineP95Ms: number;
  readonly nextFrameP95Ms: number;
  readonly nextFrameMaxMs: number;
}

export interface CommitGate {
  readonly budgetMs: number;
  readonly percentile: number;
  /** A breach is confirmed by a second measurement of the same case. */
  readonly confirmations: number;
}

export interface GatePolicy {
  readonly drawing?: DrawingGate;
  readonly actions?: ActionGate;
  readonly measuredAction?: MeasuredActionGate;
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
  /** Stable fingerprint `<scope>:<cause>` per breach, so a retry can confirm only the same failure (ADR-0158). */
  readonly fingerprint: readonly string[];
}

export declare function evaluateDrawing(
  phases: readonly {
    readonly key: string;
    readonly frames: {
      readonly p95: number;
      readonly p99: number;
      readonly max: number;
      readonly lostFrameTimeShare: number;
    };
  }[],
  gate: DrawingGate,
  cell?: { readonly targetId: string; readonly mode: string }
): GateVerdict;

export declare function evaluateActions(
  summaries: readonly {
    readonly label: string;
    readonly firstFrame: { readonly p95: number };
    readonly postActionFrames: {
      readonly p95: number;
      readonly max: number;
      readonly maxBreachSamples: number;
    };
  }[],
  gate: ActionGate,
  context: { readonly targetId?: string; readonly runtime: string }
): GateVerdict;

export declare function evaluateCommit(
  cases: readonly { readonly key: string; readonly measurements: readonly number[] }[],
  gate: CommitGate
): GateVerdict;

export declare function reproducedFailures(
  first: readonly string[],
  second: readonly string[]
): readonly string[] | 'not-comparable';

export declare function defineGates<const G extends GatePolicy>(gates: G): G;
