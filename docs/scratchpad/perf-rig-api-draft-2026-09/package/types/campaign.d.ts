/**
 * Campaigns, acceptance, evidence, and re-scoring.
 *
 * A campaign drives a target through a grid of cells resumably. The package owns the runner, the
 * append-only ledger, the retry budget, the instrument-change refusal, and the one artifact
 * inspector that both the runner and any report generator call. The app owns the grid: what a
 * variant is, what a cell is, where it writes, and which fields beyond the standard ones prove it
 * measured what it claims.
 */

import type { AppContract, DimensionOf } from './app.js';
import type { CaptureArtifact } from './artifact.js';
import type { CaptureOptions, RefusalCode } from './capture.js';
import type { Scenario, ScenarioKind } from './scenario.js';
import type { FidelityExpectations } from './scoring.js';
import type { TargetDefinition, Viewport } from './target.js';

export type StandardLedgerStatus =
  | 'valid-json'
  | 'already-valid'
  | 'missing-or-invalid-json'
  | 'attempts-exhausted'
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

export interface LedgerRow<AppStatus extends string = never> {
  readonly timestamp: string;
  readonly cell: string;
  readonly status: StandardLedgerStatus | AppStatus;
  /** Its own column, never suffixed onto the status. */
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
  /** `<variant>/<item>`; unique within a target. */
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
  readonly dimensions: Readonly<Partial<Record<DimensionOf<A>, string>>>;
  /** Desktop targets take orientation from a viewport pair rather than the device. */
  readonly viewport?: Viewport;
}

export interface AcceptanceRule<
  AppStatus extends string = string,
  K extends ScenarioKind = ScenarioKind,
> {
  readonly status: AppStatus;
  readonly spendsAttempt: boolean;
  /** `never` ends the retry loop; `until-calibrated` re-asks the fidelity table on every resume. */
  readonly retry: 'always' | 'never' | 'until-calibrated';
  readonly appliesTo: readonly K[];
  check(
    artifact: CaptureArtifact<K>,
    cell: CellDefinition<AppContract, K>
  ): { readonly ok: true } | { readonly ok: false; readonly detail: string };
}

/**
 * Applied to every cell before the app's rules, in this order, so the ledger names the recapture's
 * first problem: missing-or-invalid-json, runtime-mismatch, verdict-absent, failed-input-fidelity
 * or uncalibrated-runtime, off-refresh-regime, wrong-gesture-repeats, wrong-gesture-plan,
 * prime-failed (anomalous entry or a shortfall of repeats − 1), blank-output. Absent fields on an
 * artifact predating a rule are tolerated; malformed ones are refused.
 */
/** A rule for one scenario kind; a list of rules is a union over kinds so a frames-only rule sits beside a generic one. */
export type AcceptanceRules<Status extends string> = {
  [K in ScenarioKind]: AcceptanceRule<Status, K>;
}[ScenarioKind];

export declare const STANDARD_ACCEPTANCE: readonly AcceptanceRules<StandardLedgerStatus>[];

export interface CampaignDefinition<
  A extends AppContract = AppContract,
  AppStatus extends string = never,
> {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly variants: readonly CampaignVariant<A>[];
  readonly items: readonly string[];
  cellFor(variant: CampaignVariant<A>, item: string): CellDefinition<A>;
  readonly fidelity: FidelityExpectations;
  /**
   * A cell repeated at the start, middle and end of a physical-device queue to measure
   * within-session drift; rides the first planned variant; a sub-threshold spread is reported,
   * never treated as an acquittal.
   */
  readonly reference?: {
    readonly item: string;
    readonly onlyWhenQueueContains: readonly string[];
    metric(artifact: CaptureArtifact<'frames'>): number;
    readonly warnAboveDelta: number;
  };
  readonly acceptance: readonly AcceptanceRules<StandardLedgerStatus | AppStatus>[];
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
  readonly dryRun?: boolean;
  readonly acceptInstrumentChange?: boolean;
  readonly device?: CaptureOptions['device'];
  readonly url?: string;
  readonly rebootSimulator?: string;
  /** Each cell in a fresh process, so an edit mid-run splits at a cell boundary and the fingerprint names it. */
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

/** The single artifact inspector. Any report generator calls this too. */
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

/** Per-part hashes, so a change names the part; scorers are outside it on purpose and re-derive at fold time. */
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

/**
 * Promote captures into a tracked corpus, whole and minified, one per key, preferring the
 * scoreability tier and never the score; device identifiers redacted; a `cellAttributable: false`
 * mark where the nonce audit contradicts the label.
 */
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

/** Re-derive every capture in a corpus from `report` through the shipped scorers, never from stored summaries. */
export declare function rescore(
  options: RescoreOptions
): Promise<readonly Readonly<Record<string, unknown>>[]>;
