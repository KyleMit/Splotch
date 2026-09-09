/**
 * Campaigns, acceptance, evidence, and re-scoring.
 *
 * A campaign drives a target through a grid of cells resumably. The package owns the runner, the
 * append-only ledger, the retry budget, the instrument-change refusal, and the one artifact
 * inspector that both the runner and the report generator call — two conforming implementations
 * once disagreed on absent-data boundaries, so there is exactly one. The app owns the grid: what a
 * mode is, what a cell is, where it writes, and which fields prove it measured what it claims.
 */

import type { CaptureArtifact } from './artifact.js';
import type { CaptureOptions } from './capture.js';
import type { Scenario } from './scenario.js';
import type { TargetDefinition } from './target.js';

export interface CellDefinition {
  /** `<mode>/<item>`; unique within a target. */
  readonly id: string;
  readonly mode: string;
  readonly item: string;
  readonly scenario: Scenario;
  readonly options: CaptureOptions;
  /** Path relative to the campaign output root; asserted unique at plan time. */
  readonly artifact: string;
  /** Whether the scenario's transport writes a fidelity verdict and a refresh regime. */
  readonly reports: { readonly fidelity: boolean; readonly refreshRegime: boolean };
}

export interface CampaignDefinition {
  readonly target: TargetDefinition;
  readonly modes: readonly {
    readonly id: string;
    readonly dimensions: Readonly<Record<string, string>>;
    readonly orientation: 'PORTRAIT' | 'LANDSCAPE';
  }[];
  readonly items: readonly string[];
  readonly cellFor: (mode: CampaignDefinition['modes'][number], item: string) => CellDefinition;
  /**
   * A cell repeated at the start, middle and end of a physical-device queue to measure
   * within-session drift; a sub-threshold spread is reported, never treated as an acquittal.
   */
  readonly reference?: {
    readonly item: string;
    readonly metric: (artifact: CaptureArtifact) => number;
    readonly warnAboveDelta: number;
  };
  /** Ordered most-fundamental-first, so the ledger names the recapture's first problem. */
  readonly acceptance: readonly AcceptanceRule[];
  readonly maxAttempts: number;
  readonly outputRoot: string;
}

export interface AcceptanceRule {
  /** Ledger status written when the rule rejects. */
  readonly status: string;
  /** Whether a rejection spends one of the cell's attempts. A rule that no retry can change returns false. */
  readonly spendsAttempt: boolean;
  readonly check: (
    artifact: CaptureArtifact,
    cell: CellDefinition
  ) => { readonly ok: true } | { readonly ok: false; readonly detail: string };
}

/** Rules every campaign gets, in this order, ahead of the app's own. */
export declare const STANDARD_ACCEPTANCE: readonly AcceptanceRule[];
// 'missing-or-invalid-json' → 'runtime-mismatch' → 'failed-input-fidelity' | 'uncalibrated-runtime'
// → 'off-refresh-regime' → 'wrong-gesture-plan' → 'wrong-gesture-repeats' → 'prime-failed' → 'blank-output'

export interface LedgerRow {
  readonly timestamp: string;
  readonly cell: string;
  readonly status: string;
  readonly attempt: number;
  readonly artifact: string;
  readonly log: string;
  readonly instrument: string;
}

export declare function parseLedger(text: string): readonly LedgerRow[];
export declare function formatLedgerRow(row: LedgerRow): string;
export declare function completedCells(
  rows: readonly LedgerRow[],
  inspect: (cell: string) => boolean
): readonly string[];

export interface RunCampaignOptions {
  readonly modes?: readonly string[];
  readonly items?: readonly string[];
  readonly ledgerPath?: string;
  readonly dryRun?: boolean;
  /** Write `instrument-change-accepted` rows and continue past a fingerprint mismatch. */
  readonly acceptInstrumentChange?: boolean;
  readonly device?: CaptureOptions['device'];
}

export interface CampaignResult {
  readonly complete: number;
  readonly planned: number;
  readonly p1: readonly { readonly cell: string; readonly reason: string }[];
  readonly referenceDrift?: {
    readonly delta: number;
    readonly exceedsWarning: boolean;
    readonly sessionScope: 'single' | 'mixed' | 'unknown';
  };
}

export declare function runCampaign(
  campaign: CampaignDefinition,
  options?: RunCampaignOptions
): Promise<CampaignResult>;

/** The single artifact inspector. The report generator calls this too. */
export declare function inspectCell(
  campaign: CampaignDefinition,
  cell: CellDefinition
): Promise<{ readonly ok: boolean; readonly status: string; readonly detail?: string }>;

export declare function campaignStatus(
  campaign: CampaignDefinition,
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

/** Hash the modules and rendered probes that decide what a capture measures. Scorers are outside it on purpose. */
export declare function instrumentFingerprint(files: readonly string[]): {
  readonly fingerprint: string;
  readonly files: Readonly<Record<string, string>>;
};

export interface EvidenceSelection {
  readonly corpus: string;
  readonly campaign: string;
  readonly productCommit: string;
  /** Selection key per artifact; refuse to guess (no silent fallback). */
  readonly keyOf: (artifact: CaptureArtifact, path: string) => string;
  readonly keepAll?: { readonly study: string };
  readonly allowFailed?: boolean;
}

/**
 * Promote captures into a tracked corpus, whole and minified, one per key, preferring the
 * scoreability tier (passed, calibration-only failure, no verdict, invalidating failure) and never
 * the score; device identifiers redacted; a `cellAttributable: false` mark where the nonce audit
 * contradicts the label.
 */
export declare function keepEvidence(
  selection: EvidenceSelection,
  evidenceRoot: string
): Promise<{ readonly kept: number; readonly index: string }>;

export interface RescoreOptions {
  readonly corpus: string;
  readonly filter?: string;
  readonly includeUnattributable?: boolean;
  /** Resolve the cell an artifact belongs to; throws rather than guessing. */
  readonly cellOf: (
    artifact: CaptureArtifact,
    path: string
  ) => { readonly target: string; readonly mode: string; readonly item: string };
  readonly score: (
    artifact: CaptureArtifact
  ) => Readonly<Record<string, number | string | boolean>>;
}

/** Re-derive every capture in a corpus from `report`, through the shipped scorers, never from stored summaries. */
export declare function rescore(
  options: RescoreOptions
): Promise<readonly Readonly<Record<string, unknown>>[]>;

/**
 * Domain-free grid rendering for a published report: targets × modes × metrics with per-cell heat
 * and tooltips, every metric riding the cell as data so a switcher swaps number and heat
 * client-side. The model that feeds it is the app's.
 */
export declare function renderMatrix(model: MatrixModel): {
  readonly markdown: string;
  readonly html: string;
};

export interface MatrixModel {
  readonly title: string;
  readonly columns: readonly { readonly id: string; readonly label: string }[];
  readonly rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly role: 'gated' | 'tripwire' | 'advisory';
    readonly cells: Readonly<Record<string, MatrixCell>>;
  }[];
  readonly notes: readonly string[];
}

export interface MatrixCell {
  readonly metrics: Readonly<
    Record<
      string,
      {
        readonly value: number | null;
        readonly heat: 'pass' | 'warn' | 'fail' | 'unscoreable' | 'missing';
        readonly tooltip: string;
      }
    >
  >;
  readonly provenance: {
    readonly commit: string | null;
    readonly capturedAt: string | null;
    readonly preserved: boolean;
  };
}

/** Compare a captured commit's measured surface (tree hashes of declared paths) against a base. */
export declare function stalenessOutcome(
  rows: readonly {
    readonly target: string;
    readonly capturedAt: string;
    readonly verdict: 'current' | 'current (specs only)' | 'STALE' | 'UNVERIFIABLE';
  }[],
  options: { readonly strict: boolean }
): { readonly exitCode: 0 | 1; readonly summary: string };
