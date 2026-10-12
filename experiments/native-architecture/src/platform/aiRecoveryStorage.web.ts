import { sha256Hex } from '../../../../web/src/lib/digestHex';
import { bytesBase64 } from '../ai/base64';
import { RECOVERY_PROTOCOL, type RecoveryReply } from '../ai/recoveryContract';
import type { AiCredentialReference } from '../ai/credentials';
import type {
  AiRecoveryStorage,
  AiRecoveryHeldReceipt,
  AiRecoveryRequestReceipt,
  AiRecoveryDelivery,
  AiRecoveryAckConfirmation,
} from '../ai/journal';
import {
  checkedRecoveryCredential,
  checkedRecoveryAdmission,
  checkedRecoveryDelivery,
  checkedRecoveryAck,
  recoveryKnownExpiry,
  recoveryRequestId,
} from '../ai/recoveryRequest';
import { MAX_UPLOAD_BYTES } from '../ai/contract';
import { admitAiImage } from './aiImage.web';
import { parseRecoveryRequestReceipt } from './nativeAiReceipt';
import { decodeAiBytes, invalidAiStorage, type WebAiAttempt } from './aiStorageRecords.web';
import { WebAiStorageOwner } from './aiStorageOwner.web';

const RECOVERY_NONCE_BYTES = 32;
function newNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(RECOVERY_NONCE_BYTES)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
export class WebAiRecoveryStorage implements AiRecoveryStorage {
  protected readonly owner = new WebAiStorageOwner();
  private async confirmed(receipt: AiRecoveryRequestReceipt): Promise<WebAiAttempt> {
    this.owner.request(receipt);
    const state = await this.owner.readState();
    const attempt = state?.attempts.find(
      ({ receipt: found }) => found.journal.id === receipt.journal.id
    );
    if (!attempt || JSON.stringify(attempt.receipt) !== JSON.stringify(receipt)) invalidAiStorage();
    return attempt;
  }
  private async save(receipt: AiRecoveryRequestReceipt): Promise<AiRecoveryRequestReceipt> {
    const saved = await this.owner.replace(receipt);
    if (saved.kind !== 'recovery-request') invalidAiStorage();
    return saved;
  }
  prepareRecoverySendFromHeld(
    source: AiRecoveryHeldReceipt,
    id: number,
    createdAt: number,
    credential: AiCredentialReference
  ): Promise<AiRecoveryRequestReceipt> {
    return this.owner.queue(false, async () => {
      this.owner.held(source);
      const pinnedCredential = checkedRecoveryCredential(credential);
      const state = await this.owner.readState();
      const original = state?.attempts.find(
        ({ receipt }) => receipt.journal.id === source.journal.id
      );
      if (
        !original ||
        JSON.stringify(original.receipt) !== JSON.stringify(source) ||
        !Number.isSafeInteger(id) ||
        id <= (state?.attempts.at(-1)?.receipt.journal.id ?? 0) ||
        !Number.isSafeInteger(createdAt) ||
        state?.attempts.some(({ receipt }) => createdAt <= receipt.journal.createdAt) ||
        state?.attempts.some(
          ({ receipt }) =>
            receipt.kind !== 'recovery-held' &&
            !['result', 'failed'].includes(receipt.journal.phase)
        )
      )
        invalidAiStorage();
      const nonce = newNonce();
      const receipt = parseRecoveryRequestReceipt({
        ...source,
        kind: 'recovery-request',
        nonce,
        revision: 1,
        journal: { ...source.journal, id, createdAt, phase: 'unknown', jobId: null, result: null },
        resultDigest: null,
        resultLength: null,
        recovery: {
          version: 3,
          protocol: RECOVERY_PROTOCOL,
          id: await recoveryRequestId(nonce, createdAt),
          credential: pinnedCredential,
          sourceHeld: { id: source.journal.id, nonce: source.nonce, revision: source.revision },
          state: 'prepared',
          expiry: { kind: 'unknown' },
        },
      });
      const saved = await this.owner.commit([...this.owner.attempts(), { ...original, receipt }]);
      if (saved.kind !== 'recovery-request') invalidAiStorage();
      return saved;
    });
  }
  markRecoverySubmission(receipt: AiRecoveryRequestReceipt): Promise<AiRecoveryRequestReceipt> {
    return this.owner.queue(false, async () => {
      await this.confirmed(receipt);
      if (receipt.recovery.state === 'submission-uncertain') return receipt;
      if (receipt.recovery.state !== 'prepared') invalidAiStorage();
      return this.save(
        parseRecoveryRequestReceipt({
          ...receipt,
          revision: receipt.revision + 1,
          recovery: { ...receipt.recovery, state: 'submission-uncertain' },
        })
      );
    });
  }
  readRecoveryUpload(receipt: AiRecoveryRequestReceipt): Promise<Uint8Array> {
    return this.owner.queue(false, async () => {
      const attempt = await this.confirmed(receipt);
      if (receipt.recovery.state !== 'submission-uncertain') invalidAiStorage();
      const bytes = decodeAiBytes(attempt.upload, MAX_UPLOAD_BYTES);
      if (
        bytes.length !== receipt.inputLength ||
        (await sha256Hex(new Uint8Array(bytes).buffer)) !== receipt.inputDigest
      )
        invalidAiStorage();
      return new Uint8Array(bytes);
    });
  }
  recordRecoveryAdmission(
    receipt: AiRecoveryRequestReceipt,
    status: Extract<RecoveryReply, { kind: 'status' }>
  ): Promise<AiRecoveryRequestReceipt> {
    return this.owner.queue(false, async () => {
      await this.confirmed(receipt);
      const admitted = checkedRecoveryAdmission(receipt, status);
      const expiry = recoveryKnownExpiry(receipt, admitted.expiresAt);
      const terminal = admitted.phase === 'refusal' || admitted.phase === 'error';
      if (
        receipt.recovery.state !== 'submission-uncertain' &&
        receipt.recovery.state !== 'admitted'
      ) {
        if (
          receipt.recovery.state === 'terminal' &&
          terminal &&
          receipt.recovery.outcome !== admitted.phase
        )
          invalidAiStorage();
        return receipt;
      }
      if (receipt.recovery.state === 'admitted' && !terminal) return receipt;
      return this.save(
        parseRecoveryRequestReceipt({
          ...receipt,
          revision: receipt.revision + 1,
          journal: { ...receipt.journal, phase: terminal ? 'failed' : 'unknown' },
          recovery: {
            ...receipt.recovery,
            expiry,
            state: terminal ? 'terminal' : 'admitted',
            ...(terminal ? { outcome: admitted.phase } : {}),
          },
        })
      );
    });
  }
  retainRecoveryResult(
    receipt: AiRecoveryRequestReceipt,
    raw: AiRecoveryDelivery,
    bytes: Uint8Array
  ): ReturnType<AiRecoveryStorage['retainRecoveryResult']> {
    const ownedBytes = new Uint8Array(bytes);
    return this.owner.queue(false, async () => {
      await this.confirmed(receipt);
      const delivery = checkedRecoveryDelivery(receipt, raw);
      if (
        ownedBytes.length !== delivery.length ||
        (await sha256Hex(ownedBytes.buffer)) !== delivery.digest
      )
        invalidAiStorage();
      await admitAiImage(ownedBytes, delivery.mime);
      const picture = Object.freeze({
        uri: `data:${delivery.mime};base64,${bytesBase64(ownedBytes)}`,
        mime: delivery.mime,
      });
      if (receipt.recovery.state === 'retained' || receipt.recovery.state === 'acknowledged') {
        if (JSON.stringify(picture) !== JSON.stringify(receipt.journal.result)) invalidAiStorage();
        return Object.freeze({ picture: receipt.journal.result!, receipt });
      }
      let pinned = receipt;
      if (receipt.recovery.state !== 'delivery-pinned')
        pinned = await this.save(
          parseRecoveryRequestReceipt({
            ...receipt,
            revision: receipt.revision + 1,
            recovery: {
              ...receipt.recovery,
              expiry: recoveryKnownExpiry(receipt, delivery.expiresAt),
              state: 'delivery-pinned',
              delivery,
            },
          })
        );
      const saved = await this.save(
        parseRecoveryRequestReceipt({
          ...pinned,
          revision: pinned.revision + 1,
          resultDigest: delivery.digest,
          resultLength: delivery.length,
          journal: { ...pinned.journal, phase: 'result', result: picture },
          recovery: { ...pinned.recovery, state: 'retained' },
        })
      );
      await this.confirmed(saved);
      return Object.freeze({ picture: saved.journal.result!, receipt: saved });
    });
  }
  recordAck(
    receipt: AiRecoveryRequestReceipt,
    confirmation: AiRecoveryAckConfirmation
  ): Promise<AiRecoveryRequestReceipt> {
    return this.owner.queue(false, async () => {
      await this.confirmed(receipt);
      checkedRecoveryAck(receipt, confirmation);
      if (receipt.recovery.state === 'acknowledged') return receipt;
      return this.save(
        parseRecoveryRequestReceipt({
          ...receipt,
          revision: receipt.revision + 1,
          recovery: { ...receipt.recovery, state: 'acknowledged' },
        })
      );
    });
  }
  readRecoveryAttempt(id: number): ReturnType<AiRecoveryStorage['readRecoveryAttempt']> {
    return this.owner.queue(true, async () => {
      if (!Number.isSafeInteger(id) || id < 1) invalidAiStorage();
      await this.owner.load();
      const receipt = this.owner
        .attempts()
        .find(({ receipt }) => receipt.journal.id === id)?.receipt;
      if (!receipt) return null;
      if (receipt.kind !== 'recovery-held' && receipt.kind !== 'recovery-request')
        invalidAiStorage();
      return receipt;
    });
  }
}
