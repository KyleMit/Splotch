import { randomBytes } from 'node:crypto';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_ADMISSION_AGE_MS,
  RECOVERY_FUTURE_SKEW_MS,
  RECOVERY_TTL_MS,
  RECOVERY_MAX_INPUT_BYTES,
  RECOVERY_MAX_IMAGE_BYTES,
  RecoveryFault,
  isRecoveryHex,
  isRecoveryMime,
  parseRecoveryIdentity,
  parseRecoveryInput,
  type RecoveryAttemptIdentity,
  type RecoveryInputMetadata,
  type RecoveryMime,
  type RecoveryAckReply,
} from '../../src/lib/ai/generationAttempt';
import {
  RECOVERY_PROVISIONAL_TOMBSTONE_MS,
  attemptDigest,
  deriveAttemptId,
  attemptRequestFingerprint,
  parseAttemptFunding,
  parseAttemptOutcome,
  parseAttemptDelivery,
  outcomeOf,
  type AttemptRecord,
  type AttemptFunding,
  type AttemptOutcome,
  type AttemptDelivery,
} from './generationAttemptRecord';
import {
  attemptKey,
  lookupFromIdentity,
  readAttemptVersion,
  requireAttemptVersion,
  requireAttemptLive,
  requireAttemptTime,
  requireAttemptIdentity,
  sameAttemptValue,
  writeAttemptVersion,
  type AttemptLookup,
} from './generationAttemptPersistence';
import {
  createNetlifyAttemptStorage,
  attemptBlobMetadata,
  parseAttemptBlobMetadata,
  readAttemptBlob,
  putImmutableAttemptBlob,
  type AttemptStorage,
} from './generationAttemptStorage';

export {
  deriveAttemptId,
  attemptRequestFingerprint,
  bindAttemptCredential,
  attemptDigest,
  outcomeOf,
  RECOVERY_PROVISIONAL_TOMBSTONE_MS,
} from './generationAttemptRecord';
export type { AttemptRecord, AttemptFunding, AttemptOutcome } from './generationAttemptRecord';
export type { AttemptLookup } from './generationAttemptPersistence';
export type AttemptAdmissionRequest = Readonly<{
  identity: RecoveryAttemptIdentity;
  credentialBinding: string;
  input: RecoveryInputMetadata;
}>;
type ClaimedAttempt = Readonly<{
  id: string;
  claimId: string;
  admission: AttemptRecord['admission'];
  funding: AttemptFunding;
  bytes: Uint8Array;
}>;
type DeliveryProposal = Readonly<{
  sourceOutcomeDigest: string;
  settlementReceiptDigest: string;
  mime: RecoveryMime;
  reportToken: string | null;
  remaining: number | null;
}>;
type CollectedDelivery = Readonly<{
  admission: AttemptRecord['admission'];
  delivery: AttemptDelivery;
  bytes: Uint8Array;
}>;
const ATTEMPT_SECRET_BYTES = 32;
type AttemptStatusLookup =
  | Readonly<{ kind: 'live'; record: AttemptRecord }>
  | Readonly<{ kind: 'expired'; identity: RecoveryAttemptIdentity; expiresAt: number }>;
export interface GenerationAttempts {
  lookupStatus(lookup: AttemptLookup): Promise<AttemptStatusLookup>;
  admit(request: AttemptAdmissionRequest, bytes: Uint8Array): Promise<AttemptRecord>;
  read(lookup: AttemptLookup): Promise<AttemptRecord>;
  markFunded(lookup: AttemptLookup, funding: AttemptFunding): Promise<AttemptRecord>;
  markPending(lookup: AttemptLookup): Promise<AttemptRecord>;
  claim(id: string): Promise<ClaimedAttempt | null>;
  complete(
    id: string,
    claimId: string,
    outcome: AttemptOutcome,
    bytes: Uint8Array | null
  ): Promise<AttemptRecord>;
  readRawImage(lookup: AttemptLookup): Promise<Uint8Array>;
  stageDelivery(
    lookup: AttemptLookup,
    proposal: DeliveryProposal,
    bytes: Uint8Array
  ): Promise<AttemptRecord>;
  readDelivery(lookup: AttemptLookup): Promise<CollectedDelivery>;
  acknowledge(lookup: AttemptLookup, digest: string, receipt: string): Promise<RecoveryAckReply>;
}
function boundedBytes(bytes: Uint8Array, maximum: number): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximum)
    throw new RecoveryFault('RECOVERY_INVALID');
  return new Uint8Array(bytes);
}
function inputMatches(request: AttemptAdmissionRequest, bytes: Uint8Array): void {
  if (
    request.identity.id !== deriveAttemptId(request.identity.nonce, request.identity.createdAt) ||
    !isRecoveryHex(request.credentialBinding) ||
    request.input.inputDigest !== attemptDigest(bytes) ||
    request.input.inputByteLength !== bytes.byteLength ||
    request.input.requestFingerprint !== attemptRequestFingerprint(request.input)
  )
    throw new RecoveryFault('RECOVERY_INVALID');
}
async function verifiedBytes(
  storage: AttemptStorage,
  record: AttemptRecord,
  kind: 'input' | 'raw' | 'delivery',
  digest: string,
  length: number
): Promise<Uint8Array> {
  const entry = await readAttemptBlob(
    storage,
    attemptKey(record.admission.identity.id, kind),
    length
  );
  if (!entry) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  const metadata = parseAttemptBlobMetadata(entry.metadata);
  if (
    metadata.id !== record.admission.identity.id ||
    metadata.expiresAt !== record.admission.expiresAt ||
    metadata.digest !== digest ||
    entry.bytes.byteLength !== length
  )
    throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  return new Uint8Array(entry.bytes);
}
async function cleanAttemptBytes(storage: AttemptStorage, id: string): Promise<void> {
  await Promise.allSettled(
    ['input', 'raw', 'delivery'].map((kind) => storage.delete(`${id}/${kind}`))
  );
}
function ackReply(record: Extract<AttemptRecord, { phase: 'acknowledged' }>): RecoveryAckReply {
  return {
    ok: true,
    protocol: RECOVERY_PROTOCOL,
    id: record.admission.identity.id,
    phase: 'acknowledged',
    expiresAt: record.admission.expiresAt,
    deliveryDigest: record.digest,
    deliveryReceipt: record.receipt,
  };
}
class GenerationAttemptService implements GenerationAttempts {
  constructor(
    private readonly storage: AttemptStorage,
    private readonly clock: () => number,
    private readonly random: () => string
  ) {}
  private async live(lookup: AttemptLookup) {
    const version = await requireAttemptVersion(this.storage, lookup);
    requireAttemptLive(version.record, this.clock());
    return version;
  }
  async admit(raw: AttemptAdmissionRequest, value: Uint8Array): Promise<AttemptRecord> {
    const request = {
      identity: parseRecoveryIdentity(raw.identity),
      credentialBinding: raw.credentialBinding,
      input: parseRecoveryInput(raw.input),
    };
    const bytes = boundedBytes(value, RECOVERY_MAX_INPUT_BYTES);
    const lookup = lookupFromIdentity(request.identity, request.credentialBinding);
    const version = await readAttemptVersion(this.storage, request.identity.id);
    if (version) {
      requireAttemptIdentity(version.record, lookup);
      if (
        !sameAttemptValue(version.record.admission.input, request.input) ||
        !sameAttemptValue(version.record.admission.identity, request.identity)
      )
        throw new RecoveryFault('RECOVERY_CONFLICT');
    }
    inputMatches(request, bytes);
    if (!version) {
      const admittedAt = this.clock();
      requireAttemptTime(admittedAt);
      if (
        request.identity.createdAt < admittedAt - RECOVERY_ADMISSION_AGE_MS ||
        request.identity.createdAt > admittedAt + RECOVERY_FUTURE_SKEW_MS
      )
        throw new RecoveryFault('RECOVERY_INVALID');
      const record: AttemptRecord = {
        phase: 'preparing',
        admission: {
          protocol: RECOVERY_PROTOCOL,
          ...request,
          admittedAt,
          expiresAt: admittedAt + RECOVERY_TTL_MS,
        },
      };
      try {
        await writeAttemptVersion(this.storage, record, { onlyIfNew: true });
      } catch (cause) {
        if (!(cause instanceof RecoveryFault) || cause.code !== 'RECOVERY_CONFLICT') throw cause;
      }
      await requireAttemptVersion(this.storage, lookup);
    }
    const { record } = await this.live(lookup);
    if (
      !sameAttemptValue(record.admission.input, request.input) ||
      !sameAttemptValue(record.admission.identity, request.identity)
    )
      throw new RecoveryFault('RECOVERY_CONFLICT');
    if (record.phase !== 'preparing') return record;
    await putImmutableAttemptBlob(
      this.storage,
      attemptKey(request.identity.id, 'input'),
      bytes,
      attemptBlobMetadata(request.identity.id, record.admission.expiresAt, bytes)
    );
    const current = (await this.live(lookup)).record;
    if (
      current.phase === 'working' ||
      current.phase === 'image' ||
      current.phase === 'refusal' ||
      current.phase === 'error' ||
      current.phase === 'delivery' ||
      current.phase === 'acknowledged'
    )
      await Promise.allSettled([this.storage.delete(attemptKey(lookup.id, 'input'))]);
    return current;
  }
  async markFunded(lookup: AttemptLookup, value: AttemptFunding): Promise<AttemptRecord> {
    const funding = parseAttemptFunding(value);
    const { record, etag } = await this.live(lookup);
    if (record.phase !== 'preparing') {
      if ('funding' in record && sameAttemptValue(record.funding, funding)) return record;
      throw new RecoveryFault('RECOVERY_CONFLICT');
    }
    await verifiedBytes(
      this.storage,
      record,
      'input',
      record.admission.input.inputDigest,
      record.admission.input.inputByteLength
    );
    return writeAttemptVersion(
      this.storage,
      { phase: 'funded', admission: record.admission, funding },
      { onlyIfMatch: etag }
    );
  }
  async markPending(lookup: AttemptLookup): Promise<AttemptRecord> {
    const { record, etag } = await this.live(lookup);
    if (record.phase === 'preparing') throw new RecoveryFault('RECOVERY_NOT_READY');
    if (record.phase !== 'funded') return record;
    return writeAttemptVersion(
      this.storage,
      { phase: 'pending', admission: record.admission, funding: record.funding },
      { onlyIfMatch: etag }
    );
  }
  async claim(id: string): Promise<ClaimedAttempt | null> {
    const version = await readAttemptVersion(this.storage, id);
    if (!version) return null;
    const { record, etag } = version;
    requireAttemptLive(record, this.clock());
    if (record.phase !== 'pending') return null;
    const bytes = await verifiedBytes(
      this.storage,
      record,
      'input',
      record.admission.input.inputDigest,
      record.admission.input.inputByteLength
    );
    const claimId = this.random();
    if (!isRecoveryHex(claimId)) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
    try {
      await writeAttemptVersion(
        this.storage,
        { phase: 'working', admission: record.admission, funding: record.funding, claimId },
        { onlyIfMatch: etag }
      );
    } catch (cause) {
      if (cause instanceof RecoveryFault && cause.code === 'RECOVERY_CONFLICT') return null;
      throw cause;
    }
    requireAttemptLive(record, this.clock());
    await Promise.allSettled([this.storage.delete(attemptKey(id, 'input'))]);
    requireAttemptLive(record, this.clock());
    return { id, claimId, admission: record.admission, funding: record.funding, bytes };
  }
  async complete(
    id: string,
    claimId: string,
    raw: AttemptOutcome,
    value: Uint8Array | null
  ): Promise<AttemptRecord> {
    if (!isRecoveryHex(claimId)) throw new RecoveryFault('RECOVERY_INVALID');
    const outcome = parseAttemptOutcome(raw);
    const imageBytes =
      outcome.phase === 'image' && value ? boundedBytes(value, RECOVERY_MAX_IMAGE_BYTES) : null;
    if (outcome.phase === 'image') {
      if (
        !imageBytes ||
        outcome.image.digest !== attemptDigest(imageBytes) ||
        outcome.image.byteLength !== imageBytes.byteLength
      )
        throw new RecoveryFault('RECOVERY_INVALID');
    } else if (value !== null) throw new RecoveryFault('RECOVERY_INVALID');
    const version = await readAttemptVersion(this.storage, id);
    if (!version) throw new RecoveryFault('RECOVERY_ABSENT');
    const { record, etag } = version;
    requireAttemptLive(record, this.clock());
    if (
      'claimId' in record &&
      record.claimId === claimId &&
      (record.phase === 'image' || record.phase === 'refusal' || record.phase === 'error') &&
      sameAttemptValue(outcomeOf(record), outcome)
    ) {
      if (record.phase === 'image')
        await verifiedBytes(
          this.storage,
          record,
          'raw',
          record.image.digest,
          record.image.byteLength
        );
      return record;
    }
    if (record.phase !== 'working' || record.claimId !== claimId)
      throw new RecoveryFault('RECOVERY_CONFLICT');
    if (imageBytes)
      await putImmutableAttemptBlob(
        this.storage,
        attemptKey(id, 'raw'),
        imageBytes,
        attemptBlobMetadata(id, record.admission.expiresAt, imageBytes)
      );
    return writeAttemptVersion(this.storage, { ...record, ...outcome }, { onlyIfMatch: etag });
  }
  async readRawImage(lookup: AttemptLookup): Promise<Uint8Array> {
    const { record } = await this.live(lookup);
    if (record.phase !== 'image') throw new RecoveryFault('RECOVERY_NOT_READY');
    return verifiedBytes(this.storage, record, 'raw', record.image.digest, record.image.byteLength);
  }
  async stageDelivery(
    lookup: AttemptLookup,
    proposal: DeliveryProposal,
    value: Uint8Array
  ): Promise<AttemptRecord> {
    const bytes = boundedBytes(value, RECOVERY_MAX_IMAGE_BYTES);
    if (!isRecoveryMime(proposal.mime)) throw new RecoveryFault('RECOVERY_INVALID');
    const { record, etag } = await this.live(lookup);
    const candidate = {
      image: { digest: attemptDigest(bytes), byteLength: bytes.byteLength, mime: proposal.mime },
      sourceOutcomeDigest: proposal.sourceOutcomeDigest,
      settlementReceiptDigest: proposal.settlementReceiptDigest,
      reportToken: proposal.reportToken,
      remaining: proposal.remaining,
    };
    if (record.phase === 'delivery') {
      const { receipt: _receipt, ...existing } = record.delivery;
      if (!sameAttemptValue(existing, candidate)) throw new RecoveryFault('RECOVERY_CONFLICT');
      await verifiedBytes(
        this.storage,
        record,
        'delivery',
        record.delivery.image.digest,
        record.delivery.image.byteLength
      );
      return record;
    }
    if (record.phase !== 'image') throw new RecoveryFault('RECOVERY_NOT_READY');
    if (proposal.sourceOutcomeDigest !== attemptDigest(JSON.stringify(outcomeOf(record))))
      throw new RecoveryFault('RECOVERY_CONFLICT');
    const delivery = parseAttemptDelivery({ ...candidate, receipt: this.random() });
    await putImmutableAttemptBlob(
      this.storage,
      attemptKey(lookup.id, 'delivery'),
      bytes,
      attemptBlobMetadata(lookup.id, record.admission.expiresAt, bytes)
    );
    try {
      return await writeAttemptVersion(
        this.storage,
        { phase: 'delivery', admission: record.admission, funding: record.funding, delivery },
        { onlyIfMatch: etag }
      );
    } catch (cause) {
      if (!(cause instanceof RecoveryFault) || cause.code !== 'RECOVERY_CONFLICT') throw cause;
      const actual = (await this.live(lookup)).record;
      if (actual.phase !== 'delivery') throw cause;
      const { receipt: _receipt, ...existing } = actual.delivery;
      if (!sameAttemptValue(existing, candidate)) throw cause;
      return actual;
    }
  }
  async readDelivery(lookup: AttemptLookup): Promise<CollectedDelivery> {
    const { record } = await this.live(lookup);
    if (record.phase !== 'delivery') throw new RecoveryFault('RECOVERY_NOT_READY');
    const bytes = await verifiedBytes(
      this.storage,
      record,
      'delivery',
      record.delivery.image.digest,
      record.delivery.image.byteLength
    );
    requireAttemptLive(record, this.clock());
    return { admission: record.admission, delivery: record.delivery, bytes };
  }
  async acknowledge(
    lookup: AttemptLookup,
    digest: string,
    receipt: string
  ): Promise<RecoveryAckReply> {
    if (!isRecoveryHex(digest) || !isRecoveryHex(receipt))
      throw new RecoveryFault('RECOVERY_INVALID');
    const { record, etag } = await requireAttemptVersion(this.storage, lookup);
    const now = this.clock();
    requireAttemptTime(now);
    if (now >= record.admission.expiresAt + RECOVERY_PROVISIONAL_TOMBSTONE_MS)
      throw new RecoveryFault('RECOVERY_EXPIRED');
    if (record.phase === 'acknowledged') {
      if (record.digest !== digest || record.receipt !== receipt)
        throw new RecoveryFault('RECOVERY_CONFLICT');
      await cleanAttemptBytes(this.storage, lookup.id);
      return ackReply(record);
    }
    if (record.phase !== 'delivery') throw new RecoveryFault('RECOVERY_NOT_READY');
    if (record.delivery.image.digest !== digest || record.delivery.receipt !== receipt)
      throw new RecoveryFault('RECOVERY_CONFLICT');
    const tombstone: AttemptRecord = {
      phase: 'acknowledged',
      admission: record.admission,
      digest,
      receipt,
      acknowledgedAt: now,
      retainUntil: record.admission.expiresAt + RECOVERY_PROVISIONAL_TOMBSTONE_MS,
    };
    let actual: AttemptRecord;
    try {
      actual = await writeAttemptVersion(this.storage, tombstone, { onlyIfMatch: etag });
    } catch (cause) {
      actual = (await requireAttemptVersion(this.storage, lookup)).record;
      if (actual.phase !== 'acknowledged' || actual.digest !== digest || actual.receipt !== receipt)
        throw cause;
    }
    if (actual.phase !== 'acknowledged') throw new RecoveryFault('RECOVERY_UNAVAILABLE');
    await cleanAttemptBytes(this.storage, lookup.id);
    return ackReply(actual);
  }
  async lookupStatus(lookup: AttemptLookup): Promise<AttemptStatusLookup> {
    const { record } = await requireAttemptVersion(this.storage, lookup);
    const now = this.clock();
    requireAttemptTime(now);
    return now >= record.admission.expiresAt
      ? Object.freeze({
          kind: 'expired',
          identity: record.admission.identity,
          expiresAt: record.admission.expiresAt,
        })
      : Object.freeze({ kind: 'live', record });
  }
  async read(lookup: AttemptLookup): Promise<AttemptRecord> {
    return (await this.live(lookup)).record;
  }
}
// Clock and random are test seams; production callers use openGenerationAttempts.
export function createGenerationAttempts(
  storage: AttemptStorage,
  clock: () => number,
  random: () => string
): GenerationAttempts {
  return new GenerationAttemptService(storage, clock, random);
}
export function openGenerationAttempts(): GenerationAttempts {
  return createGenerationAttempts(createNetlifyAttemptStorage(), Date.now, () =>
    randomBytes(ATTEMPT_SECRET_BYTES).toString('hex')
  );
}
