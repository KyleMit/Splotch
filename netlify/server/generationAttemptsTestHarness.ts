import { RECOVERY_PROTOCOL, type RecoveryInputMetadata } from '../../src/lib/ai/generationAttempt';
import {
  createGenerationAttempts,
  deriveAttemptId,
  attemptDigest,
  attemptRequestFingerprint,
  type AttemptAdmissionRequest,
  type AttemptLookup,
  type GenerationAttempts,
} from './generationAttempts';
import {
  type AttemptStorage,
  type AttemptBlob,
  type AttemptBlobMetadata,
  type AttemptWriteCondition,
} from './generationAttemptStorage';

export const ATTEMPT_TEST_TIME_MS = 2_000_000;
const ATTEMPT_TEST_BINDING = 'a'.repeat(64);
export const ATTEMPT_TEST_INPUT = new Uint8Array([1, 2, 3, 4]);
export const ATTEMPT_TEST_OUTPUT = new Uint8Array([5, 6, 7, 8]);
export const ATTEMPT_TEST_FUNDING = { kind: 'free', receiptDigest: 'f'.repeat(64) } as const;
type Stored = { bytes: Uint8Array; etag: string; metadata: AttemptBlobMetadata };
export class AttemptCasHarness implements AttemptStorage {
  readonly entries = new Map<string, Stored>();
  readonly operations: string[] = [];
  readonly readFailures = new Set<string>();
  readonly missingEtags = new Set<string>();
  readonly deleteFailures = new Set<string>();
  readonly nextWriteFaults = new Map<string, 'before' | 'after'>();
  readonly forceCasLoss = new Set<string>();
  private revision = 0;
  async read(key: string): Promise<AttemptBlob | null> {
    this.operations.push(`read:${key}`);
    if (this.readFailures.has(key)) throw new Error('read unavailable');
    const entry = this.entries.get(key);
    return entry
      ? {
          bytes: new Uint8Array(entry.bytes),
          metadata: { ...entry.metadata },
          etag: this.missingEtags.has(key) ? '' : entry.etag,
        }
      : null;
  }
  async write(
    key: string,
    bytes: Uint8Array,
    metadata: AttemptBlobMetadata,
    condition: AttemptWriteCondition
  ): Promise<boolean> {
    this.operations.push(`write:${key}`);
    const fault = this.nextWriteFaults.get(key);
    this.nextWriteFaults.delete(key);
    if (fault === 'before') throw new Error('write did not commit');
    const previous = this.entries.get(key);
    const permitted =
      'onlyIfNew' in condition ? !previous : previous?.etag === condition.onlyIfMatch;
    if (!permitted || this.forceCasLoss.delete(key)) return false;
    this.revision++;
    this.entries.set(key, {
      bytes: new Uint8Array(bytes),
      metadata: { ...metadata },
      etag: `v${this.revision}`,
    });
    if (fault === 'after') throw new Error('committed reply was lost');
    return true;
  }
  async delete(key: string): Promise<void> {
    this.operations.push(`delete:${key}`);
    if (this.deleteFailures.has(key)) throw new Error('delete unavailable');
    this.entries.delete(key);
  }
  async *keys(): AsyncIterable<string> {
    for (const key of [...this.entries.keys()]) yield key;
  }
  replace(key: string, bytes: Uint8Array, metadata: AttemptBlobMetadata): void {
    this.revision++;
    this.entries.set(key, {
      bytes: new Uint8Array(bytes),
      metadata: { ...metadata },
      etag: `v${this.revision}`,
    });
  }
}
export function attemptFixture() {
  const storage = new AttemptCasHarness();
  let time = ATTEMPT_TEST_TIME_MS;
  let sequence = 0;
  const api = createGenerationAttempts(
    storage,
    () => time,
    () => (++sequence).toString(16).padStart(64, '0')
  );
  const nonce = 'b'.repeat(64);
  const identity = { id: deriveAttemptId(nonce, time), nonce, createdAt: time };
  const base: Omit<RecoveryInputMetadata, 'requestFingerprint'> = {
    inputDigest: attemptDigest(ATTEMPT_TEST_INPUT),
    inputByteLength: ATTEMPT_TEST_INPUT.byteLength,
    mime: 'image/png',
    style: 'Magical',
    promptPolicyRevision: 'test-policy-v1',
    prompt: 'Transform the supplied drawing.',
  };
  const request: AttemptAdmissionRequest = {
    identity,
    credentialBinding: ATTEMPT_TEST_BINDING,
    input: { ...base, requestFingerprint: attemptRequestFingerprint(base) },
  };
  const lookup: AttemptLookup = {
    id: identity.id,
    createdAt: identity.createdAt,
    credentialBinding: ATTEMPT_TEST_BINDING,
  };
  return {
    storage,
    api,
    request,
    lookup,
    setTime: (value: number) => {
      time = value;
    },
    protocol: RECOVERY_PROTOCOL,
  };
}
export type AttemptFixture = ReturnType<typeof attemptFixture>;
export async function pendingFixture() {
  const fixture = attemptFixture();
  await fixture.api.admit(fixture.request, ATTEMPT_TEST_INPUT);
  await fixture.api.markFunded(fixture.lookup, ATTEMPT_TEST_FUNDING);
  await fixture.api.markPending(fixture.lookup);
  return fixture;
}
export async function imageFixture() {
  const fixture = await pendingFixture();
  const claimed = await fixture.api.claim(fixture.lookup.id);
  if (!claimed) throw new Error('fixture could not claim');
  const outcome = {
    phase: 'image',
    image: {
      digest: attemptDigest(ATTEMPT_TEST_OUTPUT),
      byteLength: ATTEMPT_TEST_OUTPUT.byteLength,
      mime: 'image/png',
    },
  } as const;
  await fixture.api.complete(claimed.id, claimed.claimId, outcome, ATTEMPT_TEST_OUTPUT);
  return { ...fixture, claimed, outcome };
}
export async function deliveryFixture() {
  const fixture = await imageFixture();
  const proposal = {
    sourceOutcomeDigest: attemptDigest(JSON.stringify(fixture.outcome)),
    settlementReceiptDigest: 'd'.repeat(64),
    mime: 'image/png',
    reportToken: 'bound-report-token',
    remaining: 9,
  } as const;
  await fixture.api.stageDelivery(fixture.lookup, proposal, ATTEMPT_TEST_OUTPUT);
  const collected = await fixture.api.readDelivery(fixture.lookup);
  return { ...fixture, proposal, collected };
}
export function forkAttemptApi(fixture: AttemptFixture, random: string): GenerationAttempts {
  return createGenerationAttempts(
    fixture.storage,
    () => ATTEMPT_TEST_TIME_MS,
    () => random
  );
}
