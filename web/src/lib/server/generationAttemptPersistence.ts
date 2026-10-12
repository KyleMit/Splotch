import {
  RecoveryFault,
  RECOVERY_MAX_RECORD_BYTES,
  isRecoveryHex,
  isRecoveryTime,
  type RecoveryAttemptIdentity,
} from '../ai/generationAttempt';
import {
  encodeAttemptRecord,
  parseAttemptRecord,
  type AttemptRecord,
} from './generationAttemptRecord';
import {
  attemptBlobMetadata,
  parseAttemptBlobMetadata,
  readAttemptBlob,
  type AttemptStorage,
  type AttemptWriteCondition,
} from './generationAttemptStorage';

export type AttemptLookup = Readonly<{ id: string; createdAt: number; credentialBinding: string }>;
export type AttemptVersion = Readonly<{ record: AttemptRecord; etag: string }>;
export type AttemptBlobKind = 'record' | 'input' | 'raw' | 'delivery';
export const attemptKey = (id: string, kind: AttemptBlobKind): string => `${id}/${kind}`;
export function requireAttemptId(id: string): void {
  if (!isRecoveryHex(id)) throw new RecoveryFault('RECOVERY_INVALID');
}
export function requireAttemptTime(now: number): void {
  if (!isRecoveryTime(now)) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
}
export function requireAttemptLive(record: AttemptRecord, now: number): void {
  requireAttemptTime(now);
  if (now >= record.admission.expiresAt) throw new RecoveryFault('RECOVERY_EXPIRED');
}
export function requireAttemptIdentity(record: AttemptRecord, lookup: AttemptLookup): void {
  if (
    !isRecoveryHex(lookup.id) ||
    !isRecoveryHex(lookup.credentialBinding) ||
    !isRecoveryTime(lookup.createdAt)
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  if (
    record.admission.identity.id !== lookup.id ||
    record.admission.identity.createdAt !== lookup.createdAt ||
    record.admission.credentialBinding !== lookup.credentialBinding
  )
    throw new RecoveryFault('RECOVERY_CONFLICT');
}
export function sameAttemptValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
export async function readAttemptVersion(
  storage: AttemptStorage,
  id: string
): Promise<AttemptVersion | null> {
  requireAttemptId(id);
  const entry = await readAttemptBlob(storage, attemptKey(id, 'record'), RECOVERY_MAX_RECORD_BYTES);
  if (!entry) return null;
  const record = parseAttemptRecord(entry.bytes);
  const metadata = parseAttemptBlobMetadata(entry.metadata);
  if (
    record.admission.identity.id !== id ||
    metadata.id !== id ||
    metadata.expiresAt !== record.admission.expiresAt
  )
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  return { record, etag: entry.etag };
}
export async function requireAttemptVersion(
  storage: AttemptStorage,
  lookup: AttemptLookup
): Promise<AttemptVersion> {
  const version = await readAttemptVersion(storage, lookup.id);
  if (!version) throw new RecoveryFault('RECOVERY_ABSENT');
  requireAttemptIdentity(version.record, lookup);
  return version;
}
export async function writeAttemptVersion(
  storage: AttemptStorage,
  record: AttemptRecord,
  condition: AttemptWriteCondition
): Promise<AttemptRecord> {
  const bytes = encodeAttemptRecord(record);
  const { identity, expiresAt } = record.admission;
  let unknownWrite = false;
  try {
    await storage.write(
      attemptKey(identity.id, 'record'),
      bytes,
      attemptBlobMetadata(identity.id, expiresAt, bytes),
      condition
    );
  } catch {
    unknownWrite = true;
  }
  const actual = await readAttemptVersion(storage, identity.id);
  if (actual && sameAttemptValue(actual.record, record)) return actual.record;
  throw new RecoveryFault(unknownWrite ? 'RECOVERY_UNAVAILABLE' : 'RECOVERY_CONFLICT');
}
export function lookupFromIdentity(
  identity: RecoveryAttemptIdentity,
  credentialBinding: string
): AttemptLookup {
  return { id: identity.id, createdAt: identity.createdAt, credentialBinding };
}
