import type { FeedbackGateState } from '../feedback/feedbackGate';
import type { AiStyle, CredentialKind } from './contract';
import type { AiVault, AiReferencedVault } from './credentials';
import type { AiTransport } from './transport';
import type {
  AiJournal,
  AiResult,
  AiStorage,
  AiRecoveryHeldReceipt,
  AiRecoveryRequestReceipt,
} from './journal';
import type { AiImageAdmission } from './imageAdmission';
import type { ParentOperationPort } from '../parentCenter/parentPolicy';
import type { AiReportState } from './reportContract';
import type { AiProblemState, AiProblemTransport } from './problemReport';
// The run the AI Result card shows: one being prepared before its journal exists, the journal it
// became, or one that stopped before it had a journal.
type AiAttempt =
  | Readonly<{ kind: 'starting'; startedAt: number }>
  | Readonly<{ kind: 'journal'; id: number }>
  | Readonly<{ kind: 'stopped' }>;
// What went wrong in the last run that failed, bounded to what a problem report may carry: the
// HTTP status when there was a reply, the endpoint, and the app's own words for the failure.
// `storageFull` marks a run the device's storage refused before anything was sent.
export type AiFailureDetails = Readonly<{
  status: number | null;
  endpoint: '/api/generate-image' | '/api/generation-result';
  message: string;
  storageFull: boolean;
}>;
// What became of a credential saved or forgotten from Settings › AI Art. Each is numbered, so a
// section shows only the outcomes of its own visit; the server's own words come with a refusal.
export type AiCredentialResult = Readonly<
  { id: number; kind: CredentialKind } & (
    | { outcome: 'invalid' | 'checkUnavailable' | 'throttled'; detail: string | null }
    | { outcome: 'accepted' | 'unreachable' | 'saveFailed' | 'forgotten' | 'forgetFailed' }
  )
>;
export type AiState = Readonly<{
  failure: AiFailureDetails | null;
  // The grown-up's problem report about the last failure; null where the app cannot send one.
  problem: AiProblemState | null;
  // Which surface an open owner shows on the RSD screen: the AI Style Prompt or the AI Result.
  view: 'prompt' | 'result';
  attempt: AiAttempt | null;
  // Whether a saved credential or the free allowance makes the AI Image Button usable, checked
  // without a grown-up's answer, as shipping's free grant is.
  availability: 'loading' | 'ready' | 'unavailable';
  // Failed runs in a row, which turn the error card's Try again into Keep drawing.
  failures: number;
  open: boolean;
  // Tucked into the canvas corner so the child can keep drawing while a sent
  // picture is made; the sheet stays open underneath, so the run keeps polling.
  minimized: boolean;
  authorized: boolean;
  gate: FeedbackGateState;
  style: AiStyle;
  busy: boolean;
  remaining: number | null;
  credential: 'free' | CredentialKind | 'unavailable';
  // The saved credential as Settings shows it: the key masked to its last four characters, or the
  // access code; null with neither.
  saved: string | null;
  // Settings' own read of the saved credential and the free allowance is in flight.
  checking: boolean;
  credentialResult: AiCredentialResult | null;
  journal: AiJournal | null;
  recovery: AiRecoveryHeldReceipt | AiRecoveryRequestReceipt | null;
  heldResult: AiResult | null;
  pictures: readonly AiResult[];
  message: string;
  retryAt: number;
  report: AiReportState;
  refusal: { id: number } | null;
  // The PNG this session sent for the journal with this id, kept in memory only
  // so the waiting print can show the child their own drawing.
  submitted: { id: number; uri: string } | null;
}>;
export type PreparedAiDrawing = {
  bytes: Uint8Array;
  originalId: string;
  originalModel: string;
};
export type AiSessionDependencies = {
  vault: AiVault & AiReferencedVault;
  storage: AiStorage;
  transport: AiTransport;
  prepare: () => Promise<PreparedAiDrawing>;
  admit: AiImageAdmission;
  parent?: ParentOperationPort;
  problems?: AiProblemTransport;
  // Where the id of the last finished picture whose card was closed outlives the app, so that
  // picture is not offered again; owners without it forget a dismissal on reload.
  dismissal?: AiDismissalStore;
};
export type AiDismissalStore = {
  read(): Promise<string | null>;
  write(id: string): Promise<void>;
};
