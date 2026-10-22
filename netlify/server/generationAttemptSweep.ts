import {
  RECOVERY_MAX_IMAGE_BYTES,
  RECOVERY_MAX_RECORD_BYTES,
} from '../../src/lib/ai/generationAttempt';
import { RECOVERY_PROVISIONAL_TOMBSTONE_MS } from './generationAttemptRecord';
import { attemptKey, readAttemptVersion, requireAttemptTime } from './generationAttemptPersistence';
import {
  createNetlifyAttemptStorage,
  parseAttemptBlobMetadata,
  readAttemptBlob,
  type AttemptStorage,
} from './generationAttemptStorage';

export type AttemptSweepResult = Readonly<{
  inspected: number;
  deleted: number;
  retained: number;
  unavailable: number;
}>;
const KEY_PATTERN = /^([a-f0-9]{64})\/(record|input|raw|delivery)$/;
// Storage and time are the sweep's unit-test seams; the scheduled caller uses purgeExpiredGenerationAttempts.
export async function sweepGenerationAttempts(
  storage: AttemptStorage,
  now: number
): Promise<AttemptSweepResult> {
  requireAttemptTime(now);
  let inspected = 0;
  let deleted = 0;
  let retained = 0;
  let unavailable = 0;
  const seen = new Set<string>();
  for await (const key of storage.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    inspected++;
    const match = KEY_PATTERN.exec(key);
    if (!match) {
      unavailable++;
      continue;
    }
    const [, id, kind] = match;
    try {
      const blob = await readAttemptBlob(
        storage,
        key,
        kind === 'record' ? RECOVERY_MAX_RECORD_BYTES : RECOVERY_MAX_IMAGE_BYTES
      );
      if (!blob) continue;
      const metadata = parseAttemptBlobMetadata(blob.metadata);
      if (metadata.id !== id) {
        unavailable++;
        continue;
      }
      const version = await readAttemptVersion(storage, id);
      const expiry = version?.record.admission.expiresAt ?? metadata.expiresAt;
      if (version && expiry !== metadata.expiresAt) {
        unavailable++;
        continue;
      }
      const deleteAt = kind === 'record' ? expiry + RECOVERY_PROVISIONAL_TOMBSTONE_MS : expiry;
      const acknowledged = version?.record.phase === 'acknowledged';
      if (now < deleteAt && !(acknowledged && kind !== 'record')) {
        retained++;
        continue;
      }
      if (kind === 'record') {
        const byteKeys = ['input', 'raw', 'delivery'].map((part) => `${id}/${part}`);
        const removals = await Promise.allSettled(byteKeys.map((part) => storage.delete(part)));
        if (removals.some((result) => result.status === 'rejected')) {
          unavailable++;
          continue;
        }
        const latest = await readAttemptVersion(storage, id);
        if (latest && latest.record.admission.expiresAt + RECOVERY_PROVISIONAL_TOMBSTONE_MS > now) {
          retained++;
          continue;
        }
      }
      await storage.delete(kind === 'record' ? attemptKey(id, 'record') : key);
      deleted++;
    } catch {
      unavailable++;
    }
  }
  return { inspected, deleted, retained, unavailable };
}
export async function purgeExpiredGenerationAttempts(): Promise<AttemptSweepResult> {
  return sweepGenerationAttempts(createNetlifyAttemptStorage(), Date.now());
}
