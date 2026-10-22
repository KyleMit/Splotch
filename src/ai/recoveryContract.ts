import { JOB_TTL_MS, isAiMime, isInstallationId, type AiMime } from './contract';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_PATH,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
  RECOVERY_TERMINAL_CODE,
  RECOVERY_ADMISSION_AGE_MS as ADMISSION_AGE_MS,
  RECOVERY_FUTURE_SKEW_MS as FUTURE_SKEW_MS,
  RECOVERY_POLL_AFTER_MS as POLL_AFTER_MS,
  RECOVERY_PHASES as PHASES,
  type RecoveryPhase,
} from '../lib/ai/generationAttempt';
export {
  RECOVERY_PROTOCOL,
  RECOVERY_PATH,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
  RECOVERY_TERMINAL_CODE,
  type RecoveryPhase,
};
export type RecoveryExpiry =
  Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'known'; expiresAt: number }>;
export type RecoveryRead =
  | Readonly<{ kind: 'capability' }>
  | Readonly<{ kind: 'collect'; id: string; createdAt: number; expiry: RecoveryExpiry }>;
export type RecoveryReply =
  | Readonly<{ kind: 'capability' }>
  | Readonly<{
      kind: 'status';
      id: string;
      expiresAt: number;
      phase: RecoveryPhase;
      pollAfterMs: number;
    }>
  | Readonly<{
      kind: 'unadmitted-image';
      bytes: Uint8Array;
      mime: AiMime;
      digest: string;
      expiresAt: number;
    }>
  | Readonly<{
      kind: 'held';
      reason:
        | 'absent'
        | 'expired'
        | 'conflict'
        | 'unavailable'
        | 'unsupported'
        | 'authorization'
        | 'rate-limit'
        | 'rejected';
    }>;
function invalid(): never {
  throw new Error('Recovery response could not be confirmed. The attempt stays held.');
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).sort().join(',') !== names.sort().join(',')) invalid();
}
export function originalRecoveryExpiry(
  raw: string | null,
  read: Extract<RecoveryRead, { kind: 'collect' }>
): number {
  if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw)) invalid();
  const expiresAt = Number(raw);
  const minimum = read.createdAt + JOB_TTL_MS - FUTURE_SKEW_MS;
  const maximum = read.createdAt + JOB_TTL_MS + ADMISSION_AGE_MS;
  if (
    !Number.isSafeInteger(read.createdAt) ||
    read.createdAt < 0 ||
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < 1 ||
    String(expiresAt) !== raw ||
    expiresAt < minimum ||
    expiresAt > maximum ||
    (read.expiry.kind === 'known' && read.expiry.expiresAt !== expiresAt)
  )
    invalid();
  return expiresAt;
}
export function parseRecoveryJson(
  status: number,
  value: unknown,
  headers: Pick<Headers, 'get'>,
  read: RecoveryRead
): RecoveryReply {
  if (!object(value)) invalid();
  if (status === 200 && read.kind === 'capability') {
    exact(value, ['ok', 'protocol', 'jobTtlMs']);
    if (value.ok !== true || value.protocol !== RECOVERY_PROTOCOL || value.jobTtlMs !== JOB_TTL_MS)
      invalid();
    return Object.freeze({ kind: 'capability' });
  }
  if (status === 202 && read.kind === 'collect') {
    exact(value, ['ok', 'protocol', 'id', 'expiresAt', 'phase', 'pollAfterMs']);
    const expiresAt = originalRecoveryExpiry(headers.get(RECOVERY_EXPIRES_HEADER), read);
    if (
      value.ok !== true ||
      value.protocol !== RECOVERY_PROTOCOL ||
      !isInstallationId(read.id) ||
      value.id !== read.id ||
      value.expiresAt !== expiresAt ||
      value.pollAfterMs !== POLL_AFTER_MS
    )
      invalid();
    const phase = PHASES.find((entry) => entry === value.phase);
    if (!phase) invalid();
    return Object.freeze({
      kind: 'status',
      id: read.id,
      expiresAt,
      phase,
      pollAfterMs: POLL_AFTER_MS,
    });
  }
  if (
    value.ok !== false ||
    typeof value.error !== 'string' ||
    !value.error ||
    Object.keys(value).some((key) => !['ok', 'error', 'code', 'remaining'].includes(key))
  )
    invalid();
  if (status === 429) return Object.freeze({ kind: 'held', reason: 'rate-limit' });
  if (status === 401 || status === 403)
    return Object.freeze({ kind: 'held', reason: 'authorization' });
  if (status === 404 && value.code === 'RECOVERY_ABSENT')
    return Object.freeze({ kind: 'held', reason: 'absent' });
  if (status === 404 && value.code === 'RECOVERY_EXPIRED')
    return Object.freeze({ kind: 'held', reason: 'expired' });
  if (status === 409 && value.code === 'RECOVERY_CONFLICT')
    return Object.freeze({ kind: 'held', reason: 'conflict' });
  if (status === 503 && value.code === 'RECOVERY_UNAVAILABLE')
    return Object.freeze({ kind: 'held', reason: 'unavailable' });
  if (status === 400) return Object.freeze({ kind: 'held', reason: 'unsupported' });
  if (status >= 400 && status <= 599) return Object.freeze({ kind: 'held', reason: 'rejected' });
  return invalid();
}
export function recoveryImageMetadata(
  headers: Pick<Headers, 'get'>,
  read: Extract<RecoveryRead, { kind: 'collect' }>
) {
  if (!isInstallationId(read.id) || headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL)
    invalid();
  const mime = headers.get('Content-Type')?.split(';')[0].trim();
  const digest = headers.get(RECOVERY_DIGEST_HEADER);
  if (!isAiMime(mime) || !isInstallationId(digest)) invalid();
  return Object.freeze({
    mime,
    digest,
    expiresAt: originalRecoveryExpiry(headers.get(RECOVERY_EXPIRES_HEADER), read),
  });
}

export type RecoveryAdmission = Readonly<{
  kind: 'admit';
  id: string;
  createdAt: number;
  expiry: RecoveryExpiry;
}>;
export type RecoveryMutation =
  | Readonly<{ kind: 'reconcile'; id: string; createdAt: number; expiry: RecoveryExpiry }>
  | Readonly<{
      kind: 'ack';
      id: string;
      createdAt: number;
      expiry: Readonly<{ kind: 'known'; expiresAt: number }>;
      digest: string;
      receipt: string;
    }>;
export type RecoveryOperation = RecoveryAdmission | RecoveryMutation;
export {
  RECOVERY_MAX_JSON_BYTES,
  RECOVERY_MAX_IMAGE_BYTES,
  parseRecoveryAckReply,
  parseRecoveryMutation,
  type RecoveryAckReply,
  type RecoveryReconcileBody,
  type RecoveryAckBody,
} from '../lib/ai/generationAttempt';

export {
  parseRecoveryTerminalReply,
  type RecoveryTerminalConfirmation,
} from '../lib/ai/generationAttempt';
