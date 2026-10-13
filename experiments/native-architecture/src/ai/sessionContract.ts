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
// What became of a credential saved or forgotten from Settings › AI Art. Each is numbered, so a
// section shows only the outcomes of its own visit; the server's own words come with a refusal.
export type AiCredentialResult = Readonly<
  { id: number; kind: CredentialKind } & (
    | { outcome: 'invalid' | 'checkUnavailable' | 'throttled'; detail: string | null }
    | { outcome: 'accepted' | 'unreachable' | 'saveFailed' | 'forgotten' | 'forgetFailed' }
  )
>;
export type AiState = Readonly<{
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
};
