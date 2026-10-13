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
export type AiState = Readonly<{
  open: boolean;
  authorized: boolean;
  gate: FeedbackGateState;
  style: AiStyle;
  busy: boolean;
  remaining: number | null;
  credential: 'free' | CredentialKind | 'unavailable';
  journal: AiJournal | null;
  recovery: AiRecoveryHeldReceipt | AiRecoveryRequestReceipt | null;
  heldResult: AiResult | null;
  pictures: readonly AiResult[];
  message: string;
  retryAt: number;
  report: AiReportState;
  refusal: { id: number } | null;
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
