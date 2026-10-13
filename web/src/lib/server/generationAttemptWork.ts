import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  RECOVERY_PROTOCOL,
  RecoveryFault,
  isRecoveryHex,
  isRecoveryTime,
  recoveryExact,
  recoveryObject,
  recoveryText,
} from '../ai/generationAttempt';
import {
  openRecoveryCredential,
  sealRecoveryCredential,
  type RecoveryCredentialContext,
} from './generationAttemptWorkCredential';
import { bindAttemptCredential, type AttemptRecord } from './generationAttempts';
import {
  RECOVERY_WORK_DOMAIN,
  RECOVERY_WORK_MAX_BYTES,
  RECOVERY_WORK_TICKET_AGE_MS,
  RECOVERY_WORK_TICKET_SKEW_MS,
  RECOVERY_MAX_CREDENTIAL_BYTES,
} from './generationAttemptPolicy';
export type RecoveryWork = Readonly<{
  domain: typeof RECOVERY_WORK_DOMAIN;
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  createdAt: number;
  issuedAt: number;
  expiresAt: number;
  requestFingerprint: string;
  credential: Readonly<{ kind: 'free' | 'managed' | 'byok'; identity: string }>;
}>;
type RecoveryWorkHeader = Omit<RecoveryWork, 'credential'>;
function parseWorkKind(kind: unknown): RecoveryWork['credential']['kind'] {
  if (kind !== 'free' && kind !== 'managed' && kind !== 'byok')
    throw new RecoveryFault('RECOVERY_INVALID');
  return kind;
}
function parseWorkHeader(item: Record<string, unknown>, now: number): RecoveryWorkHeader {
  if (
    item.domain !== RECOVERY_WORK_DOMAIN ||
    item.protocol !== RECOVERY_PROTOCOL ||
    !isRecoveryHex(item.id) ||
    !isRecoveryHex(item.requestFingerprint) ||
    !isRecoveryTime(item.createdAt) ||
    !isRecoveryTime(item.issuedAt) ||
    !isRecoveryTime(item.expiresAt) ||
    !isRecoveryTime(now) ||
    item.expiresAt <= now ||
    item.issuedAt > now + RECOVERY_WORK_TICKET_SKEW_MS ||
    item.issuedAt < now - RECOVERY_WORK_TICKET_AGE_MS
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  return {
    domain: item.domain,
    protocol: item.protocol,
    id: item.id,
    createdAt: item.createdAt,
    issuedAt: item.issuedAt,
    expiresAt: item.expiresAt,
    requestFingerprint: item.requestFingerprint,
  };
}
function parseWorkCredential(
  kind: RecoveryWork['credential']['kind'],
  rawIdentity: unknown
): RecoveryWork['credential'] {
  const identity = recoveryText(rawIdentity, RECOVERY_MAX_CREDENTIAL_BYTES);
  if (
    identity !== identity.trim() ||
    /[,\r\n]/.test(identity) ||
    (kind === 'free' && !isRecoveryHex(identity))
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  return { kind, identity };
}
function sealedCredentialContext(
  work: RecoveryWorkHeader,
  kind: RecoveryWork['credential']['kind']
): RecoveryCredentialContext {
  return {
    domain: work.domain,
    protocol: work.protocol,
    id: work.id,
    createdAt: work.createdAt,
    issuedAt: work.issuedAt,
    expiresAt: work.expiresAt,
    requestFingerprint: work.requestFingerprint,
    kind,
  };
}
export function sealRecoveryWork(work: RecoveryWork, secret: string): string {
  const context = sealedCredentialContext(work, work.credential.kind);
  const credential = {
    kind: work.credential.kind,
    sealed: sealRecoveryCredential(work.credential.identity, context, secret),
  };
  const raw = JSON.stringify({
    domain: work.domain,
    protocol: work.protocol,
    id: work.id,
    createdAt: work.createdAt,
    issuedAt: work.issuedAt,
    expiresAt: work.expiresAt,
    requestFingerprint: work.requestFingerprint,
    credential,
  });
  if (Buffer.byteLength(raw) > RECOVERY_WORK_MAX_BYTES) throw new RecoveryFault('RECOVERY_INVALID');
  return raw;
}
export function openRecoveryWork(raw: string, secret: string, now: number): RecoveryWork {
  if (Buffer.byteLength(raw) > RECOVERY_WORK_MAX_BYTES) throw new RecoveryFault('RECOVERY_INVALID');
  const item = recoveryObject(JSON.parse(raw));
  if (JSON.stringify(item) !== raw) throw new RecoveryFault('RECOVERY_INVALID');
  recoveryExact(item, [
    'domain',
    'protocol',
    'id',
    'createdAt',
    'issuedAt',
    'expiresAt',
    'requestFingerprint',
    'credential',
  ]);
  const credential = recoveryObject(item.credential);
  recoveryExact(credential, ['kind', 'sealed']);
  const header = parseWorkHeader(item, now);
  const kind = parseWorkKind(credential.kind);
  const identity = openRecoveryCredential(
    credential.sealed,
    sealedCredentialContext(header, kind),
    secret
  );
  return { ...header, credential: parseWorkCredential(kind, identity) };
}
function workSignature(raw: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(RECOVERY_WORK_DOMAIN)
    .update('\0')
    .update(raw)
    .digest('hex');
}
export function signRecoveryWork(raw: string, secret: string | undefined): string | null {
  if (!secret || Buffer.byteLength(raw) > RECOVERY_WORK_MAX_BYTES) return null;
  return workSignature(raw, secret);
}
export function verifyRecoveryWork(
  raw: string,
  ticket: string | null,
  secret: string | undefined
): boolean {
  if (!ticket || !isRecoveryHex(ticket)) return false;
  const expected = signRecoveryWork(raw, secret);
  return (
    expected !== null && timingSafeEqual(Buffer.from(ticket, 'hex'), Buffer.from(expected, 'hex'))
  );
}
export function requireRecoveryWorkRecord(
  work: RecoveryWork,
  record: AttemptRecord,
  secret: string
): void {
  const { admission } = record;
  if (
    admission.identity.id !== work.id ||
    admission.identity.createdAt !== work.createdAt ||
    admission.expiresAt !== work.expiresAt ||
    admission.input.requestFingerprint !== work.requestFingerprint ||
    admission.credentialBinding !==
      bindAttemptCredential(secret, work.credential.kind, work.credential.identity) ||
    !('funding' in record) ||
    record.funding.kind !== work.credential.kind
  )
    throw new RecoveryFault('RECOVERY_CONFLICT');
}
export async function readRecoveryWorkBody(request: Request): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > RECOVERY_WORK_MAX_BYTES)
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > RECOVERY_WORK_MAX_BYTES) return null;
      chunks.push(next.value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
