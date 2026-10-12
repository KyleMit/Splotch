import type { AiCredentialReference } from './credentials';
import { recoveryDigest } from './recoveryDigest';
import { parseRecoveryAckReply } from '../../../../web/src/lib/ai/generationAttempt';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_EXPIRES_HEADER,
  parseRecoveryJson,
  originalRecoveryExpiry,
  type RecoveryReply,
} from './recoveryContract';
import type {
  AiRecoveryAckConfirmation,
  AiRecoveryDelivery,
  AiRecoveryRequestReceipt,
  AiRecoveryKnownExpiry,
} from './journal';
import { isAiMime, isInstallationId, MAX_RESULT_BYTES } from './contract';

export function invalidRecovery(): never {
  throw new Error('Recovery storage could not be confirmed. Reopen AI picture before continuing.');
}
export function checkedRecoveryCredential(raw: unknown): AiCredentialReference {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).sort().join(',') !== 'kind,reference' ||
    !('kind' in raw) ||
    !('reference' in raw) ||
    !isInstallationId(raw.reference) ||
    (raw.kind !== 'free' && raw.kind !== 'managed' && raw.kind !== 'byok')
  )
    invalidRecovery();
  return Object.freeze({ kind: raw.kind, reference: raw.reference });
}
export async function recoveryRequestId(nonce: string, createdAt: number): Promise<string> {
  if (!isInstallationId(nonce) || !Number.isSafeInteger(createdAt) || createdAt < 0)
    invalidRecovery();
  return recoveryDigest(
    new TextEncoder().encode(JSON.stringify([RECOVERY_PROTOCOL, nonce, createdAt]))
  );
}
export async function verifyRecoveryRequestIdentity(
  receipt: AiRecoveryRequestReceipt
): Promise<void> {
  if ((await recoveryRequestId(receipt.nonce, receipt.journal.createdAt)) !== receipt.recovery.id)
    invalidRecovery();
}
export function recoveryKnownExpiry(
  receipt: AiRecoveryRequestReceipt,
  expiresAt: number
): AiRecoveryKnownExpiry {
  originalRecoveryExpiry(String(expiresAt), {
    kind: 'collect',
    id: receipt.recovery.id,
    createdAt: receipt.journal.createdAt,
    expiry: receipt.recovery.expiry,
  });
  return Object.freeze({ kind: 'known', expiresAt, provenance: 'validated-recovery-response' });
}
export function checkedRecoveryAdmission(
  receipt: AiRecoveryRequestReceipt,
  status: Extract<RecoveryReply, { kind: 'status' }>
): Extract<RecoveryReply, { kind: 'status' }> {
  if (
    !status ||
    typeof status !== 'object' ||
    Object.keys(status).sort().join(',') !== 'expiresAt,id,kind,phase,pollAfterMs' ||
    status.kind !== 'status' ||
    receipt.recovery.state === 'prepared'
  )
    invalidRecovery();
  const result = parseRecoveryJson(
    202,
    {
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      id: status.id,
      expiresAt: status.expiresAt,
      phase: status.phase,
      pollAfterMs: status.pollAfterMs,
    },
    new Headers({ [RECOVERY_EXPIRES_HEADER]: String(status.expiresAt) }),
    {
      kind: 'collect',
      id: receipt.recovery.id,
      createdAt: receipt.journal.createdAt,
      expiry: receipt.recovery.expiry,
    }
  );
  if (result.kind !== 'status') invalidRecovery();
  return result;
}
export function checkedRecoveryDelivery(
  receipt: AiRecoveryRequestReceipt,
  raw: AiRecoveryDelivery
): AiRecoveryDelivery {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Object.keys(raw).sort().join(',') !== 'digest,expiresAt,length,mime,receipt' ||
    !isInstallationId(raw.digest) ||
    !isInstallationId(raw.receipt) ||
    !isAiMime(raw.mime) ||
    typeof raw.expiresAt !== 'number' ||
    !Number.isSafeInteger(raw.expiresAt) ||
    !Number.isSafeInteger(raw.length) ||
    raw.length < 1 ||
    raw.length > MAX_RESULT_BYTES ||
    ['prepared', 'terminal'].includes(receipt.recovery.state)
  )
    invalidRecovery();
  recoveryKnownExpiry(receipt, raw.expiresAt);
  const delivery = Object.freeze({
    expiresAt: raw.expiresAt,
    digest: raw.digest,
    receipt: raw.receipt,
    mime: raw.mime,
    length: raw.length,
  });
  if (
    'delivery' in receipt.recovery &&
    JSON.stringify(receipt.recovery.delivery) !== JSON.stringify(delivery)
  )
    invalidRecovery();
  return delivery;
}
export function checkedRecoveryAck(
  receipt: AiRecoveryRequestReceipt,
  confirmation: AiRecoveryAckConfirmation
): AiRecoveryAckConfirmation {
  if (
    !confirmation ||
    typeof confirmation !== 'object' ||
    Object.keys(confirmation).sort().join(',') !== 'body,status' ||
    confirmation.status !== 200 ||
    (receipt.recovery.state !== 'retained' && receipt.recovery.state !== 'acknowledged') ||
    !('delivery' in receipt.recovery)
  )
    invalidRecovery();
  const delivery = receipt.recovery.delivery;
  const body = parseRecoveryAckReply(confirmation.body, {
    id: receipt.recovery.id,
    expiresAt: delivery.expiresAt,
    digest: delivery.digest,
    receipt: delivery.receipt,
  });
  return Object.freeze({ status: 200, body });
}
