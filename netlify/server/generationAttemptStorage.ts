import { getStore } from './blobs';
import type { BlobNamespace } from './blobNamespace';
import {
  RecoveryFault,
  isRecoveryTime,
  recoveryObject,
  recoveryExact,
  RECOVERY_PROTOCOL,
  isRecoveryHex,
} from '../../src/lib/ai/generationAttempt';
import { attemptDigest } from './generationAttemptRecord';

export const GENERATION_ATTEMPT_STORE_NAME = 'ai-generation-attempts-v1';
export type AttemptBlobMetadata = Readonly<{
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  expiresAt: number;
  digest: string;
}>;
export type AttemptBlob = Readonly<{ bytes: Uint8Array; etag: string; metadata: unknown }>;
export type AttemptWriteCondition =
  Readonly<{ onlyIfNew: true }> | Readonly<{ onlyIfMatch: string }>;
// Injection is the unit-test seam; production uses openGenerationAttempts with this Netlify adapter.
export interface AttemptStorage {
  read(key: string): Promise<AttemptBlob | null>;
  write(
    key: string,
    bytes: Uint8Array,
    metadata: AttemptBlobMetadata,
    condition: AttemptWriteCondition
  ): Promise<boolean>;
  delete(key: string): Promise<void>;
  keys(): AsyncIterable<string>;
}
export function createNetlifyAttemptStorage(namespace: BlobNamespace = 'active'): AttemptStorage {
  const store = () =>
    getStore({ name: GENERATION_ATTEMPT_STORE_NAME, consistency: 'strong' }, namespace);
  return {
    async read(key) {
      const entry = await store().getWithMetadata(key, { type: 'arrayBuffer' });
      if (entry === null) return null;
      const bytes: unknown = entry.data;
      const etag: unknown = entry.etag;
      if (!(bytes instanceof ArrayBuffer) || typeof etag !== 'string' || !etag.trim())
        throw new RecoveryFault('RECOVERY_UNAVAILABLE');
      return { bytes: new Uint8Array(bytes), etag, metadata: entry.metadata };
    },
    async write(key, bytes, metadata, condition) {
      const result = await store().set(key, new Uint8Array(bytes).buffer, {
        ...condition,
        metadata,
      });
      return result.modified;
    },
    async delete(key) {
      await store().delete(key);
    },
    async *keys() {
      for await (const page of store().list({ paginate: true }))
        for (const blob of page.blobs) yield blob.key;
    },
  };
}
export function parseAttemptBlobMetadata(value: unknown): AttemptBlobMetadata {
  const item = recoveryObject(value);
  recoveryExact(item, ['protocol', 'id', 'expiresAt', 'digest']);
  if (
    item.protocol !== RECOVERY_PROTOCOL ||
    !isRecoveryHex(item.id) ||
    !isRecoveryTime(item.expiresAt) ||
    !isRecoveryHex(item.digest)
  )
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  return {
    protocol: RECOVERY_PROTOCOL,
    id: item.id,
    expiresAt: item.expiresAt,
    digest: item.digest,
  };
}
export function attemptBlobMetadata(
  id: string,
  expiresAt: number,
  bytes: Uint8Array
): AttemptBlobMetadata {
  return { protocol: RECOVERY_PROTOCOL, id, expiresAt, digest: attemptDigest(bytes) };
}
export async function readAttemptBlob(
  storage: AttemptStorage,
  key: string,
  maximumBytes: number
): Promise<AttemptBlob | null> {
  try {
    const entry = await storage.read(key);
    if (!entry) return null;
    if (!entry.etag?.trim() || entry.bytes.byteLength < 1 || entry.bytes.byteLength > maximumBytes)
      throw new RecoveryFault('RECOVERY_UNAVAILABLE');
    const metadata = parseAttemptBlobMetadata(entry.metadata);
    if (attemptDigest(entry.bytes) !== metadata.digest)
      throw new RecoveryFault('RECOVERY_UNAVAILABLE');
    return entry;
  } catch {
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  }
}
export async function putImmutableAttemptBlob(
  storage: AttemptStorage,
  key: string,
  bytes: Uint8Array,
  metadata: AttemptBlobMetadata
): Promise<void> {
  try {
    await storage.write(key, bytes, metadata, { onlyIfNew: true });
  } catch {
    /* A lost write reply is resolved only by exact readback below. */
  }
  const entry = await readAttemptBlob(storage, key, bytes.byteLength);
  if (!entry) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  if (
    attemptDigest(entry.bytes) !== metadata.digest ||
    entry.bytes.byteLength !== bytes.byteLength ||
    JSON.stringify(parseAttemptBlobMetadata(entry.metadata)) !== JSON.stringify(metadata) ||
    !entry.bytes.every((byte, index) => byte === bytes[index])
  )
    throw new RecoveryFault('RECOVERY_CONFLICT');
}
