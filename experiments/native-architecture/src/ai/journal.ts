import type { AiCredentialReference } from './credentials';
import type { RecoveryReply } from './recoveryContract';
import { isAiStyle, isAiMime, isInstallationId, type AiStyle, type AiMime } from './contract';
export type AiResult = Readonly<{ uri: string; mime: AiMime }>;
export type AiJournal = Readonly<{
  version: 1;
  id: number;
  createdAt: number;
  style: AiStyle;
  originalId: string;
  phase: 'sent' | 'pending' | 'unknown' | 'result' | 'failed';
  jobId: string | null;
  result: AiResult | null;
}>;
type ReceiptCommon = Readonly<{
  journal: AiJournal;
  nonce: string;
  revision: number;
  originalRevision: 1;
  originalDigest: string;
  resultDigest: string | null;
  resultLength: number | null;
}>;
export type AiPreparedReceipt = ReceiptCommon &
  Readonly<{
    kind: 'prepared';
    inputDigest: string;
    inputLength: number;
  }>;
export type AiImportedReceipt = ReceiptCommon &
  Readonly<{
    kind: 'imported';
    inputDigest: null;
    inputLength: null;
  }>;
export type AiReceipt = AiPreparedReceipt | AiImportedReceipt;
export type AiRecoveryHeldReceipt = ReceiptCommon &
  Readonly<{
    kind: 'recovery-held';
    inputDigest: string;
    inputLength: number;
    recovery: Readonly<{
      version: 2;
      protocol: 'splotch-ai-recovery-v1';
      id: string;
      credential: AiCredentialReference;
      expiry:
        | Readonly<{ kind: 'unknown' }>
        | Readonly<{ kind: 'known'; expiresAt: number; provenance: 'admitted-status-202' }>;
      intent: 'prepared' | 'committed';
    }>;
  }>;
export type AiStoredAttempt =
  | Readonly<{ kind: 'recovery-held'; receipt: AiRecoveryHeldReceipt }>
  | Readonly<{ kind: 'native'; receipt: AiReceipt }>
  | Readonly<{ kind: 'legacy'; journal: AiJournal }>;
export type AiRetainedResult = Readonly<{ picture: AiResult; receipt: AiReceipt }>;
export interface AiStorage {
  read(): Promise<AiStoredAttempt | null>;
  prepare(value: AiJournal, originalModel: string, upload: Uint8Array): Promise<AiPreparedReceipt>;
  readPreparedUpload(receipt: AiPreparedReceipt): Promise<Uint8Array>;
  prepareRecovery(
    value: AiJournal,
    originalModel: string,
    upload: Uint8Array,
    credential: AiCredentialReference
  ): Promise<AiRecoveryHeldReceipt>;
  commitRecoveryIntent(receipt: AiRecoveryHeldReceipt): Promise<AiRecoveryHeldReceipt>;
  recordRecoveryStatus(
    receipt: AiRecoveryHeldReceipt,
    status: Extract<RecoveryReply, { kind: 'status' }>
  ): Promise<AiRecoveryHeldReceipt>;
  pictures(): Promise<AiResult[]>;
  write(value: AiJournal): Promise<AiReceipt>;
  retain(id: number, bytes: Uint8Array, mime: AiMime): Promise<AiRetainedResult>;
}
export function parseAiJournal(raw: unknown): AiJournal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('AI recovery data is invalid.');
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
      'createdAt,id,jobId,originalId,phase,result,style,version' ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.id) ||
    typeof value.id !== 'number' ||
    value.id < 1 ||
    !Number.isSafeInteger(value.createdAt) ||
    typeof value.createdAt !== 'number' ||
    value.createdAt < 0 ||
    !isAiStyle(value.style) ||
    typeof value.originalId !== 'string' ||
    !/^picture-\d+-[a-z0-9]+$/.test(value.originalId) ||
    !['sent', 'pending', 'unknown', 'result', 'failed'].includes(String(value.phase)) ||
    (value.jobId !== null && !isInstallationId(value.jobId))
  )
    throw new Error('AI recovery data is invalid.');
  const result = value.result;
  if (
    result !== null &&
    (!result ||
      typeof result !== 'object' ||
      !('uri' in result) ||
      typeof result.uri !== 'string' ||
      !result.uri ||
      !('mime' in result) ||
      !isAiMime(result.mime) ||
      Object.keys(result).sort().join(',') !== 'mime,uri')
  )
    throw new Error('AI result recovery data is invalid.');
  if (
    (value.phase === 'result') !== (result !== null) ||
    (value.phase === 'pending' && value.jobId === null)
  )
    throw new Error('AI recovery state is inconsistent.');
  return value as AiJournal;
}
