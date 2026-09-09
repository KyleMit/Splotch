/**
 * Campaigns, acceptance, evidence, and re-scoring (`perf-rig/campaign`).
 *
 * A campaign drives a target through a grid of cells resumably. The package owns the runner, the
 * append-only ledger, the retry budget, the instrument-change refusal, and the one artifact
 * inspector that both the runner and any report generator call. The app owns the grid: what a
 * variant is, what a cell is, where it writes, and which rules beyond the standard ones prove it
 * measured what it claims.
 */

import type { AppContract, DimensionSelection } from './app.js';
import type { CaptureArtifact, CaptureArtifactOf } from './artifact.js';
import type { CaptureOptions, RefusalCode } from './capture.js';
import type { GatePolicy } from './gates.js';
import type { Scenario, ScenarioKind } from './scenario.js';
import type { FidelityExpectations } from './scoring.js';
import type { TargetDefinition, Viewport } from './target.js';

export type StandardLedgerStatus =
  | 'valid-json'
  | 'already-valid'
  | 'missing-or-invalid-json'
  | 'attempts-exhausted'
  | 'guard-refused'
  | 'runtime-mismatch'
  | 'verdict-absent'
  | 'failed-input-fidelity'
  | 'uncalibrated-runtime'
  | 'off-refresh-regime'
  | 'wrong-gesture-repeats'
  | 'wrong-gesture-plan'
  | 'prime-failed'
  | 'blank-output'
  | 'instrument-change-accepted';

/**
 * Statuses a pre-package ledger may carry under another name, and what `parseLedger` reads them
 * as. Every other base status the shipped ledger module exports is a member of
 * `StandardLedgerStatus` verbatim; this table is the whole difference, declared so the resume
 * proof in migration phase 4 is reviewable here rather than in a loop.
 */
export declare const LEGACY_LEDGER_STATUS: {
  readonly 'eraser-fill-failed': 'prime-failed';
};

/**
 * A pre-package row records a child's exit code as a suffix on the status
 * (`run-campaign.mjs`: `${status}-exit-${code}`); `parseLedger` splits it into `exitCode` and maps
 * the base through `LEGACY_LEDGER_STATUS`. The parser test pins these cases:
 *
 *   `missing-or-invalid-json-exit-2`  → status `missing-or-invalid-json`, exitCode 2
 *   `failed-input-fidelity-exit-1`    → status `failed-input-fidelity`, exitCode 1
 *   `eraser-fill-failed-exit-1`       → status `prime-failed`, exitCode 1
 *   `eraser-fill-failed`              → status `prime-failed`, exitCode null
 *   `valid-json`                      → status `valid-json`, exitCode null
 *   `attempts-exhausted`              → status `attempts-exhausted`, exitCode null
 *
 * An unknown base status is kept as the app's own (`AppStatus`), never coerced.
 */
export declare function normaliseLegacyStatus(raw: string): {
  readonly status: StandardLedgerStatus | string;
  readonly exitCode: number | null;
};

export interface LedgerRow<AppStatus extends string = never> {
  readonly timestamp: string;
  readonly cell: string;
  readonly status: StandardLedgerStatus | AppStatus;
  /** Its own column; a legacy `-exit-N` suffix on the status is split into it. */
  readonly exitCode: number | null;
  readonly attempt: number;
  readonly artifact: string;
  readonly log: string;
  readonly instrument: string | null;
}

export interface CellDefinition<
  A extends AppContract = AppContract,
  K extends ScenarioKind = ScenarioKind,
> {
  readonly id: string;
  readonly variant: string;
  readonly item: string;
  readonly scenario: Extract<Scenario<A>, { kind: K }>;
  readonly options: CaptureOptions<A>;
  /** Path relative to the campaign output root; asserted unique at plan time. */
  readonly artifact: string;
  /** Files beyond the package's own that decide what this cell measures; fingerprinted per cell. */
  readonly instrument?: readonly string[];
}

export interface CampaignVariant<A extends AppContract> {
  readonly id: string;
  readonly dimensions: DimensionSelection<A>;
  /** Desktop targets take orientation from a viewport pair rather than the device. */
  readonly viewport?: Viewport;
}

export interface AcceptanceRule<Status extends string = string> {
  readonly status: Status;
  /** `never` ends the retry loop; `until-calibrated` re-asks the fidelity table on every resume. A `never` rule spends no attempt. */
  readonly retry: 'always' | 'never' | 'until-calibrated';
  readonly appliesTo: readonly ScenarioKind[] | 'all';
  check(
    artifact: CaptureArtifact,
    cell: CellDefinition
  ): { readonly ok: true } | { readonly ok: false; readonly detail: string };
}

/** Narrow once, so an app rule is written against one kind with no cast and is a no-op for the others. */
export declare function ruleFor<K extends ScenarioKind, S extends string>(
  kind: K,
  rule: {
    readonly status: S;
    readonly retry: AcceptanceRule['retry'];
    check(
      artifact: CaptureArtifactOf<K>,
      cell: CellDefinition<AppContract, K>
    ): { readonly ok: true } | { readonly ok: false; readonly detail: string };
  }
): AcceptanceRule<S>;

/**
 * Applied to every cell before the app's rules, in this order, so the ledger names the recapture's
 * first problem: missing-or-invalid-json, guard-refused (a `RefusedCapture` envelope; no rule sees
 * one), runtime-mismatch, verdict-absent, failed-input-fidelity or uncalibrated-runtime,
 * off-refresh-regime, wrong-gesture-repeats, wrong-gesture-plan, prime-failed (an anomalous entry
 * or a shortfall of repeats − 1), blank-output. Absent fields on an artifact predating a rule are
 * tolerated; malformed ones are refused.
 */
export declare const STANDARD_ACCEPTANCE: readonly AcceptanceRule<StandardLedgerStatus>[];

export interface CampaignDefinition<
  A extends AppContract = AppContract,
  AppStatus extends string = never,
> {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly variants: readonly CampaignVariant<A>[];
  readonly items: readonly string[];
  cellFor(variant: CampaignVariant<A>, item: string): CellDefinition<A>;
  /** Threaded into every cell's capture; the fold re-evaluates the same policy. */
  readonly gates: GatePolicy;
  readonly fidelity: FidelityExpectations;
  /** A cell repeated at start, middle and end of a physical-device queue; rides the first planned variant. */
  readonly reference?: {
    readonly item: string;
    readonly onlyWhenQueueContains: readonly string[];
    /** `null` when the artifact carries no measurement; recorded as unmeasured, never as zero. */
    metric(artifact: CaptureArtifactOf<'frames'>): number | null;
    readonly warnAboveDelta: number;
  };
  readonly acceptance: readonly AcceptanceRule<StandardLedgerStatus | AppStatus>[];
  readonly maxAttempts: number;
  readonly outputRoot: string;
}

export declare function parseLedger(text: string): readonly LedgerRow<string>[];
export declare function formatLedgerRow(row: LedgerRow<string>): string;
export declare function completedCells(
  rows: readonly LedgerRow<string>[],
  inspect: (cell: string) => boolean
): readonly string[];
export declare function nextAction(
  rows: readonly LedgerRow<string>[],
  cellId: string,
  options: {
    readonly artifactValid: boolean;
    readonly maxAttempts: number;
    readonly runtimeStillUncalibrated: boolean;
  }
): { readonly action: 'skip' | 'run' | 'p1'; readonly attempt: number; readonly reason: string };

export interface RunCampaignOptions {
  readonly variants?: readonly string[];
  readonly items?: readonly string[];
  readonly label?: string;
  readonly ledgerPath?: string;
  readonly maxAttempts?: number;
  readonly dryRun?: boolean;
  readonly acceptInstrumentChange?: boolean;
  readonly device?: CaptureOptions['device'];
  readonly url?: string;
  readonly rebootSimulator?: string;
  readonly isolation?: 'child-process' | 'in-process';
}

export interface CampaignPlan {
  readonly cells: readonly {
    readonly id: string;
    readonly artifact: string;
    readonly endpoint: string;
  }[];
  readonly references: readonly {
    readonly id: string;
    readonly position: 'start' | 'middle' | 'end';
    readonly artifact: string;
  }[];
  readonly refusals: readonly {
    readonly code: RefusalCode | 'artifact-path-collision' | 'instrument-changed';
    readonly message: string;
    readonly remedy: string;
  }[];
}

export interface CampaignResult {
  readonly complete: number;
  readonly planned: number;
  readonly p1: readonly { readonly cell: string; readonly reason: string }[];
  readonly references?: {
    readonly measurements: readonly {
      readonly position: 'start' | 'middle' | 'end';
      readonly value: number;
      readonly capturedAt: string;
    }[];
    readonly delta: number;
    readonly exceedsWarning: boolean;
    readonly sessionScope: 'single' | 'mixed' | 'unknown';
  };
}

export declare function planCampaign<A extends AppContract, S extends string>(
  campaign: CampaignDefinition<A, S>,
  options?: RunCampaignOptions
): Promise<CampaignPlan>;
export declare function runCampaign<A extends AppContract, S extends string>(
  campaign: CampaignDefinition<A, S>,
  options?: RunCampaignOptions
): Promise<CampaignResult>;

/** The single artifact inspector. A stale `summaries.scoringEpoch` is reported in `detail`, never as a status. */
export declare function inspectCell<A extends AppContract, S extends string>(
  campaign: CampaignDefinition<A, S>,
  cell: CellDefinition<A>
): Promise<{
  readonly ok: boolean;
  readonly status: StandardLedgerStatus | S;
  readonly detail?: string;
}>;

export declare function campaignStatus<A extends AppContract, S extends string>(
  campaign: CampaignDefinition<A, S>,
  options?: { readonly ledgerPath?: string }
): Promise<{
  readonly complete: readonly string[];
  readonly remaining: readonly {
    readonly cell: string;
    readonly attempts: number;
    readonly lastStatus?: string;
  }[];
  readonly ledgerDisagrees: readonly string[];
}>;

export interface InstrumentDescriptor {
  readonly harnessVersion: string;
  readonly probes: readonly ('frames' | 'actions' | 'input-recorder')[];
  /** Only the contract fields the probes and bootstrap read. */
  readonly contract: Pick<AppContract, 'page' | 'hooks' | 'marks' | 'tools' | 'controls'>;
  readonly pageFunctions: readonly string[];
  readonly files?: readonly string[];
}

export declare function instrumentFingerprint(descriptor: InstrumentDescriptor): {
  readonly fingerprint: string;
  readonly parts: Readonly<Record<string, string>>;
};
export declare function instrumentChangeProblem(
  recorded: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>
): string | null;

export interface EvidenceSelection {
  readonly corpus: string;
  readonly campaign: string;
  readonly productCommit: string;
  readonly target?: string;
  readonly filter?: string;
  keyOf(artifact: CaptureArtifact, path: string): string;
  readonly keepAll?: { readonly study: string };
  readonly allowFailed?: boolean;
  readonly force?: boolean;
}

export declare function keepEvidence(
  selection: EvidenceSelection,
  evidenceRoot: string
): Promise<{ readonly kept: number; readonly index: string }>;

export interface RescoreOptions {
  readonly corpus: string;
  readonly filter?: string;
  readonly target?: string;
  readonly includeUnattributable?: boolean;
  readonly json?: string;
  /** Required only for pre-package artifacts; v1 artifacts carry their cell. */
  readonly legacy?: { upgrade(json: unknown, path: string): CaptureArtifact };
  score(artifact: CaptureArtifact): Readonly<Record<string, number | string | boolean>>;
}

/**
 * Re-derive every capture in a corpus from `report` through the shipped scorers, never from stored
 * summaries. A `RefusedCapture` is listed under `refused` and never passed to `score`.
 */
export declare function rescore(options: RescoreOptions): Promise<{
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly refused: readonly { readonly path: string; readonly guard: string }[];
}>;
