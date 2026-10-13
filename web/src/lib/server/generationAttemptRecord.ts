import { createHash, createHmac } from 'node:crypto';
import { FREE_GENERATION_LIMIT } from '../freeGenerations';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_TTL_MS,
  RECOVERY_ADMISSION_AGE_MS,
  RECOVERY_FUTURE_SKEW_MS,
  RECOVERY_MAX_IMAGE_BYTES,
  RECOVERY_MAX_RECORD_BYTES,
  RECOVERY_MAX_REASON_BYTES,
  RECOVERY_MAX_REPORT_TOKEN_BYTES,
  RecoveryFault,
  isRecoveryHex,
  isRecoveryMime,
  isRecoveryTime,
  parseRecoveryIdentity,
  parseRecoveryInput,
  recoveryExact,
  recoveryInvalid,
  recoveryObject,
  recoveryText,
  type RecoveryAttemptIdentity,
  type RecoveryInputMetadata,
  type RecoveryMime,
} from '../ai/generationAttempt';

// Provisional proposal; activating a route requires the product/privacy retention decision.
export const RECOVERY_PROVISIONAL_TOMBSTONE_MS = 24 * 60 * 60 * 1_000;
type AttemptAdmission = Readonly<{
  protocol: typeof RECOVERY_PROTOCOL;
  identity: RecoveryAttemptIdentity;
  credentialBinding: string;
  input: RecoveryInputMetadata;
  admittedAt: number;
  expiresAt: number;
}>;
export type AttemptFunding = Readonly<{
  kind: 'free' | 'managed' | 'byok';
  receiptDigest: string;
}>;
type AttemptImage = Readonly<{ digest: string; byteLength: number; mime: RecoveryMime }>;
export type AttemptOutcome =
  | Readonly<{ phase: 'image'; image: AttemptImage }>
  | Readonly<{ phase: 'refusal'; reason: string }>
  | Readonly<{ phase: 'error'; reason: string }>;
export type AttemptDelivery = Readonly<{
  image: AttemptImage;
  receipt: string;
  sourceOutcomeDigest: string;
  settlementReceiptDigest: string;
  reportToken: string | null;
  remaining: number | null;
}>;
type Funded = Readonly<{ admission: AttemptAdmission; funding: AttemptFunding }>;
export type AttemptRecord =
  | Readonly<{ phase: 'preparing'; admission: AttemptAdmission }>
  | (Funded & Readonly<{ phase: 'funded' }>)
  | (Funded & Readonly<{ phase: 'pending' }>)
  | (Funded & Readonly<{ phase: 'working'; claimId: string }>)
  | (Funded & Readonly<{ phase: 'image'; claimId: string; image: AttemptImage }>)
  | (Funded & Readonly<{ phase: 'refusal'; claimId: string; reason: string }>)
  | (Funded & Readonly<{ phase: 'error'; claimId: string; reason: string }>)
  | (Funded & Readonly<{ phase: 'delivery'; delivery: AttemptDelivery }>)
  | Readonly<{
      phase: 'acknowledged';
      admission: AttemptAdmission;
      digest: string;
      receipt: string;
      acknowledgedAt: number;
      retainUntil: number;
    }>;
export function attemptDigest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export function deriveAttemptId(nonce: string, createdAt: number): string {
  if (!isRecoveryHex(nonce) || !isRecoveryTime(createdAt)) recoveryInvalid();
  return attemptDigest(JSON.stringify([RECOVERY_PROTOCOL, nonce, createdAt]));
}
export function attemptRequestFingerprint(
  input: Omit<RecoveryInputMetadata, 'requestFingerprint'>
): string {
  return attemptDigest(
    JSON.stringify([
      RECOVERY_PROTOCOL,
      input.inputDigest,
      input.inputByteLength,
      input.mime,
      input.style,
      input.promptPolicyRevision,
      input.prompt,
    ])
  );
}
export function bindAttemptCredential(
  secret: string,
  kind: AttemptFunding['kind'],
  identity: string
): string {
  recoveryText(secret, RECOVERY_MAX_REPORT_TOKEN_BYTES);
  recoveryText(identity, RECOVERY_MAX_REPORT_TOKEN_BYTES);
  if (!['free', 'managed', 'byok'].includes(kind)) recoveryInvalid();
  return createHmac('sha256', secret)
    .update(JSON.stringify(['splotch-ai-recovery-credential-binding-v1', kind, identity]))
    .digest('hex');
}
export function parseAttemptFunding(value: unknown): AttemptFunding {
  const item = recoveryObject(value);
  recoveryExact(item, ['kind', 'receiptDigest']);
  if (
    (item.kind !== 'free' && item.kind !== 'managed' && item.kind !== 'byok') ||
    !isRecoveryHex(item.receiptDigest)
  )
    recoveryInvalid();
  return Object.freeze({ kind: item.kind, receiptDigest: item.receiptDigest });
}
function parseAttemptImage(value: unknown): AttemptImage {
  const item = recoveryObject(value);
  recoveryExact(item, ['digest', 'byteLength', 'mime']);
  if (
    !isRecoveryHex(item.digest) ||
    !isRecoveryTime(item.byteLength) ||
    item.byteLength < 1 ||
    item.byteLength > RECOVERY_MAX_IMAGE_BYTES ||
    !isRecoveryMime(item.mime)
  )
    recoveryInvalid();
  return Object.freeze({ digest: item.digest, byteLength: item.byteLength, mime: item.mime });
}
export function parseAttemptOutcome(value: unknown): AttemptOutcome {
  const item = recoveryObject(value);
  if (item.phase === 'image') {
    recoveryExact(item, ['phase', 'image']);
    return Object.freeze({ phase: 'image', image: parseAttemptImage(item.image) });
  }
  recoveryExact(item, ['phase', 'reason']);
  if (item.phase !== 'refusal' && item.phase !== 'error') recoveryInvalid();
  return Object.freeze({
    phase: item.phase,
    reason: recoveryText(item.reason, RECOVERY_MAX_REASON_BYTES),
  });
}
export function parseAttemptDelivery(value: unknown): AttemptDelivery {
  const item = recoveryObject(value);
  recoveryExact(item, [
    'image',
    'receipt',
    'sourceOutcomeDigest',
    'settlementReceiptDigest',
    'reportToken',
    'remaining',
  ]);
  if (
    !isRecoveryHex(item.receipt) ||
    !isRecoveryHex(item.sourceOutcomeDigest) ||
    !isRecoveryHex(item.settlementReceiptDigest) ||
    (item.remaining !== null &&
      (!isRecoveryTime(item.remaining) || item.remaining > FREE_GENERATION_LIMIT))
  )
    recoveryInvalid();
  const reportToken =
    item.reportToken === null
      ? null
      : recoveryText(item.reportToken, RECOVERY_MAX_REPORT_TOKEN_BYTES);
  return Object.freeze({
    image: parseAttemptImage(item.image),
    receipt: item.receipt,
    sourceOutcomeDigest: item.sourceOutcomeDigest,
    settlementReceiptDigest: item.settlementReceiptDigest,
    reportToken,
    remaining: item.remaining,
  });
}
function parseAdmission(value: unknown): AttemptAdmission {
  const item = recoveryObject(value);
  recoveryExact(item, [
    'protocol',
    'identity',
    'credentialBinding',
    'input',
    'admittedAt',
    'expiresAt',
  ]);
  const identity = parseRecoveryIdentity(item.identity);
  const input = parseRecoveryInput(item.input);
  if (
    item.protocol !== RECOVERY_PROTOCOL ||
    !isRecoveryHex(item.credentialBinding) ||
    !isRecoveryTime(item.admittedAt) ||
    !isRecoveryTime(item.expiresAt) ||
    item.expiresAt !== item.admittedAt + RECOVERY_TTL_MS ||
    identity.createdAt < item.admittedAt - RECOVERY_ADMISSION_AGE_MS ||
    identity.createdAt > item.admittedAt + RECOVERY_FUTURE_SKEW_MS ||
    !isRecoveryTime(item.expiresAt + RECOVERY_PROVISIONAL_TOMBSTONE_MS) ||
    identity.id !== deriveAttemptId(identity.nonce, identity.createdAt) ||
    input.requestFingerprint !== attemptRequestFingerprint(input)
  )
    recoveryInvalid();
  return Object.freeze({
    protocol: RECOVERY_PROTOCOL,
    identity,
    credentialBinding: item.credentialBinding,
    input,
    admittedAt: item.admittedAt,
    expiresAt: item.expiresAt,
  });
}
function parseRecordObject(value: unknown): AttemptRecord {
  const item = recoveryObject(value);
  const admission = parseAdmission(item.admission);
  if (item.phase === 'preparing') {
    recoveryExact(item, ['phase', 'admission']);
    return Object.freeze({ phase: 'preparing', admission });
  }
  if (item.phase === 'acknowledged') {
    recoveryExact(item, [
      'phase',
      'admission',
      'digest',
      'receipt',
      'acknowledgedAt',
      'retainUntil',
    ]);
    if (
      !isRecoveryHex(item.digest) ||
      !isRecoveryHex(item.receipt) ||
      !isRecoveryTime(item.acknowledgedAt) ||
      item.acknowledgedAt < admission.admittedAt ||
      !isRecoveryTime(item.retainUntil) ||
      item.acknowledgedAt >= item.retainUntil ||
      item.retainUntil !== admission.expiresAt + RECOVERY_PROVISIONAL_TOMBSTONE_MS
    )
      recoveryInvalid();
    return Object.freeze({
      phase: 'acknowledged',
      admission,
      digest: item.digest,
      receipt: item.receipt,
      acknowledgedAt: item.acknowledgedAt,
      retainUntil: item.retainUntil,
    });
  }
  const funding = parseAttemptFunding(item.funding);
  if (item.phase === 'funded' || item.phase === 'pending') {
    recoveryExact(item, ['phase', 'admission', 'funding']);
    return item.phase === 'funded'
      ? Object.freeze({ phase: 'funded', admission, funding })
      : Object.freeze({ phase: 'pending', admission, funding });
  }
  if (item.phase === 'delivery') {
    recoveryExact(item, ['phase', 'admission', 'funding', 'delivery']);
    return Object.freeze({
      phase: 'delivery',
      admission,
      funding,
      delivery: parseAttemptDelivery(item.delivery),
    });
  }
  if (!isRecoveryHex(item.claimId)) recoveryInvalid();
  if (item.phase === 'working') {
    recoveryExact(item, ['phase', 'admission', 'funding', 'claimId']);
    return Object.freeze({ phase: 'working', admission, funding, claimId: item.claimId });
  }
  const phase = item.phase;
  if (phase === 'image') {
    recoveryExact(item, ['phase', 'admission', 'funding', 'claimId', 'image']);
    return Object.freeze({
      phase,
      admission,
      funding,
      claimId: item.claimId,
      image: parseAttemptImage(item.image),
    });
  }
  recoveryExact(item, ['phase', 'admission', 'funding', 'claimId', 'reason']);
  if (phase !== 'refusal' && phase !== 'error') recoveryInvalid();
  const reason = recoveryText(item.reason, RECOVERY_MAX_REASON_BYTES);
  return phase === 'refusal'
    ? Object.freeze({ phase: 'refusal', admission, funding, claimId: item.claimId, reason })
    : Object.freeze({ phase: 'error', admission, funding, claimId: item.claimId, reason });
}
export function encodeAttemptRecord(record: AttemptRecord): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(parseRecordObject(record)));
  if (bytes.byteLength > RECOVERY_MAX_RECORD_BYTES) recoveryInvalid();
  return bytes;
}
export function parseAttemptRecord(bytes: Uint8Array): AttemptRecord {
  if (bytes.byteLength > RECOVERY_MAX_RECORD_BYTES) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  try {
    return parseRecordObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  }
}
export function outcomeOf(
  record: Extract<AttemptRecord, { phase: 'image' | 'refusal' | 'error' }>
): AttemptOutcome {
  return record.phase === 'image'
    ? { phase: 'image', image: record.image }
    : { phase: record.phase, reason: record.reason };
}
