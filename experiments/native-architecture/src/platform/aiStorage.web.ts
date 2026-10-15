import { sha256Hex } from '../../../../web/src/lib/digestHex';
import { bytesBase64 } from '../ai/base64';
import { MAX_RESULT_BYTES, MAX_UPLOAD_BYTES, isAiMime, type AiMime } from '../ai/contract';
import {
  parseAiJournal,
  type AiJournal,
  type AiStorage,
  type AiPreparedReceipt,
  type AiRecoveryHeldReceipt,
  type AiResult,
} from '../ai/journal';
import type { AiCredentialReference } from '../ai/credentials';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_EXPIRES_HEADER,
  parseRecoveryJson,
  type RecoveryReply,
} from '../ai/recoveryContract';
import { validateAiOriginalModel } from './aiOriginalModel';
import { admitAiImage } from './aiImage.web';
import { record, exact, parseNativeReceipt, parseRecoveryHeldReceipt } from './nativeAiReceipt';
import {
  decodeAiBytes,
  resultAiBytes,
  invalidAiStorage,
  type WebAiReceipt,
} from './aiStorageRecords.web';
import { sameAiIdentity } from './aiStorageOwner.web';
import { WebAiRecoveryStorage } from './aiRecoveryStorage.web';

const AI_ATTEMPT_NONCE_BYTES = 32;
function nonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(AI_ATTEMPT_NONCE_BYTES)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

class WebAiStorage extends WebAiRecoveryStorage implements AiStorage {
  private async prepareAttempt(
    journal: AiJournal,
    originalModel: string,
    upload: Uint8Array,
    recovery: AiRecoveryHeldReceipt['recovery'] | null
  ): Promise<WebAiReceipt> {
    await this.owner.ready();
    const value = parseAiJournal(journal);
    const current = this.owner.latest();
    if (
      value.phase !== (recovery ? 'unknown' : 'sent') ||
      value.jobId !== null ||
      value.result !== null ||
      (current &&
        ((recovery && !['result', 'failed'].includes(current.journal.phase)) ||
          value.id <= current.journal.id))
    )
      invalidAiStorage();
    validateAiOriginalModel(originalModel, 'current');
    const model = new TextEncoder().encode(originalModel);
    const bytes = new Uint8Array(upload);
    if (
      !bytes.length ||
      bytes.length > MAX_UPLOAD_BYTES ||
      new TextDecoder('utf-8', { fatal: true }).decode(model) !== originalModel
    )
      invalidAiStorage();
    await admitAiImage(bytes, 'image/png', 'original');
    const base = {
      kind: 'prepared',
      journal: value,
      nonce: nonce(),
      revision: 1,
      originalRevision: 1,
      originalDigest: await sha256Hex(model.buffer),
      inputDigest: await sha256Hex(bytes.buffer),
      inputLength: bytes.length,
      resultDigest: null,
      resultLength: null,
    };
    const receipt = recovery
      ? parseRecoveryHeldReceipt({ ...base, kind: 'recovery-held', recovery })
      : parseNativeReceipt(base);
    const kept = recovery ? this.owner.attempts() : [];
    return this.owner.commit([
      ...kept,
      { receipt, originalModel, originalLength: model.length, upload: bytesBase64(bytes) },
    ]);
  }
  read(): ReturnType<AiStorage['read']> {
    return this.owner.queue(true, async () => {
      await this.owner.load();
      const current = this.owner.latest();
      if (!current) return null;
      if (current.kind === 'recovery-request')
        return Object.freeze({ kind: 'recovery-request' as const, receipt: current });
      return current.kind === 'recovery-held'
        ? Object.freeze({ kind: 'recovery-held' as const, receipt: current })
        : Object.freeze({ kind: 'native' as const, receipt: current });
    });
  }
  prepare(journal: AiJournal, model: string, upload: Uint8Array): Promise<AiPreparedReceipt> {
    return this.owner.queue(false, async () => {
      const receipt = await this.prepareAttempt(journal, model, upload, null);
      if (receipt.kind !== 'prepared') invalidAiStorage();
      return receipt;
    });
  }
  readPreparedUpload(receipt: AiPreparedReceipt): Promise<Uint8Array> {
    return this.owner.queue(false, async () => {
      if (this.owner.owned(receipt.journal.id) !== receipt || receipt.kind !== 'prepared')
        invalidAiStorage();
      const found = await this.owner.readState();
      const attempt = found?.attempts.find(
        (entry) => entry.receipt.journal.id === receipt.journal.id
      );
      if (!attempt || JSON.stringify(attempt.receipt) !== JSON.stringify(receipt))
        invalidAiStorage();
      return decodeAiBytes(attempt.upload, MAX_UPLOAD_BYTES);
    });
  }
  write(journal: AiJournal): ReturnType<AiStorage['write']> {
    return this.owner.queue(false, async () => {
      const value = parseAiJournal(journal);
      const before = this.owner.prepared(value.id);
      if (
        !sameAiIdentity(before.journal, value) ||
        (before.journal.jobId !== null && value.jobId !== before.journal.jobId) ||
        (['result', 'failed'].includes(before.journal.phase) &&
          JSON.stringify(value) !== JSON.stringify(before.journal)) ||
        (value.phase === 'result' && before.journal.phase !== 'result') ||
        (value.phase === 'sent' && before.journal.phase !== 'sent')
      )
        invalidAiStorage();
      const receipt = await this.owner.replace(
        parseNativeReceipt({ ...before, journal: value, revision: before.revision + 1 })
      );
      if (receipt.kind !== 'prepared') invalidAiStorage();
      return receipt;
    });
  }
  retain(id: number, bytes: Uint8Array, mime: AiMime): ReturnType<AiStorage['retain']> {
    return this.owner.queue(false, async () => {
      const before = this.owner.prepared(id);
      const ownedBytes = new Uint8Array(bytes);
      if (!isAiMime(mime) || !ownedBytes.length || ownedBytes.length > MAX_RESULT_BYTES)
        invalidAiStorage();
      await admitAiImage(ownedBytes, mime);
      const result = { uri: `data:${mime};base64,${bytesBase64(ownedBytes)}`, mime };
      if (before.journal.result) {
        const found = await this.owner.readState();
        const confirmed = found?.attempts.find(
          (attempt) => attempt.receipt.journal.id === id
        )?.receipt;
        if (
          !confirmed ||
          confirmed.kind !== 'prepared' ||
          JSON.stringify(confirmed) !== JSON.stringify(before) ||
          confirmed.journal.result?.uri !== result.uri ||
          confirmed.journal.result.mime !== mime
        )
          invalidAiStorage();
        return Object.freeze({ picture: confirmed.journal.result, receipt: before });
      }
      const next = parseNativeReceipt({
        ...before,
        revision: before.revision + 1,
        journal: { ...before.journal, phase: 'result', result },
        resultDigest: await sha256Hex(ownedBytes.buffer),
        resultLength: ownedBytes.length,
      });
      const receipt = await this.owner.replace(next);
      if (receipt.kind !== 'prepared' || !receipt.journal.result) invalidAiStorage();
      return Object.freeze({ picture: receipt.journal.result, receipt });
    });
  }
  pictures(): Promise<AiResult[]> {
    return this.owner.queue(true, async () => {
      const found = await this.owner.readState();
      return (
        found?.attempts.flatMap(({ receipt }) =>
          receipt.journal.result ? [receipt.journal.result] : []
        ) ?? []
      );
    });
  }
  prepareRecovery(
    journal: AiJournal,
    model: string,
    upload: Uint8Array,
    credential: AiCredentialReference
  ): Promise<AiRecoveryHeldReceipt> {
    return this.owner.queue(false, async () => {
      const receipt = await this.prepareAttempt(journal, model, upload, {
        version: 2,
        protocol: RECOVERY_PROTOCOL,
        id: nonce(),
        credential,
        expiry: { kind: 'unknown' },
        intent: 'prepared',
      });
      if (receipt.kind !== 'recovery-held') invalidAiStorage();
      return receipt;
    });
  }
  commitRecoveryIntent(receipt: AiRecoveryHeldReceipt): Promise<AiRecoveryHeldReceipt> {
    return this.owner.queue(false, async () => {
      this.owner.held(receipt);
      const next = parseRecoveryHeldReceipt({
        ...receipt,
        revision: receipt.revision + 1,
        recovery: { ...receipt.recovery, intent: 'committed' },
      });
      const saved = await this.owner.replace(next);
      if (saved.kind !== 'recovery-held') invalidAiStorage();
      return saved;
    });
  }
  recordRecoveryStatus(
    receipt: AiRecoveryHeldReceipt,
    status: Extract<RecoveryReply, { kind: 'status' }>
  ): Promise<AiRecoveryHeldReceipt> {
    return this.owner.queue(false, async () => {
      this.owner.held(receipt);
      if (!record(status)) invalidAiStorage();
      exact(status, ['kind', 'id', 'expiresAt', 'phase', 'pollAfterMs']);
      if (receipt.recovery.intent !== 'committed' || status.kind !== 'status') invalidAiStorage();
      const admitted = parseRecoveryJson(
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
      if (admitted.kind !== 'status') invalidAiStorage();
      const next = parseRecoveryHeldReceipt({
        ...receipt,
        revision: receipt.revision + 1,
        recovery: {
          ...receipt.recovery,
          expiry: {
            kind: 'known',
            expiresAt: admitted.expiresAt,
            provenance: 'admitted-status-202',
          },
        },
      });
      const saved = await this.owner.replace(next);
      if (saved.kind !== 'recovery-held') invalidAiStorage();
      return saved;
    });
  }
}

export function createAiStorage(): AiStorage {
  return new WebAiStorage();
}
export const aiStorage = createAiStorage();
export async function readAiPictureBytes(picture: AiResult): Promise<Uint8Array> {
  const pictures = await aiStorage.pictures();
  const owned = pictures.find((entry) => entry.uri === picture.uri && entry.mime === picture.mime);
  if (!owned) invalidAiStorage();
  return new Uint8Array(resultAiBytes(owned.uri, owned.mime));
}
