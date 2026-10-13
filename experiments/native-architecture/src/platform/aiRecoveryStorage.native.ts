import { File } from 'expo-file-system';
import type { AiRecoveryStorage, AiRecoveryRequestReceipt } from '../ai/journal';
import { bytesBase64 } from '../ai/base64';
import { MAX_UPLOAD_BYTES } from '../ai/contract';
import { RECOVERY_PROTOCOL } from '../ai/recoveryContract';
import { recoveryDigest } from '../ai/recoveryDigest';
import {
  invalidRecovery,
  checkedRecoveryCredential,
  checkedRecoveryAdmission,
  checkedRecoveryDelivery,
  checkedRecoveryAck,
  checkedRecoveryTerminal,
  verifyRecoveryRequestIdentity,
} from '../ai/recoveryRequest';
import { admitAiImage } from './aiImage';
import { exact, parseRecoveryRequestReceipt } from './nativeAiReceipt';
import type { RecoveryReceiptOwner } from './recoveryReceiptOwner';

export type RecoveryStorageOperation =
  | 'prepareRecoverySendFromHeld'
  | 'markRecoverySubmission'
  | 'readRecoveryUpload'
  | 'recordRecoveryAdmission'
  | 'recordRecoveryTerminal'
  | 'retainRecoveryResult'
  | 'recordAck'
  | 'readRecoveryAttempt';
type Operation = (
  kind: RecoveryStorageOperation,
  payload: object
) => Promise<Record<string, unknown>>;
type Run = <T>(kind: RecoveryStorageOperation, work: () => Promise<T>) => Promise<T>;
export async function verifyNativeRecoveryResult(receipt: AiRecoveryRequestReceipt): Promise<void> {
  const picture = receipt.journal.result;
  if (!picture) return;
  const file = new File(picture.uri);
  if (!picture.uri.startsWith('file:') || !file.exists || file.size !== receipt.resultLength)
    invalidRecovery();
  const bytes = new Uint8Array(await file.bytes());
  if (bytes.length !== receipt.resultLength || recoveryDigest(bytes) !== receipt.resultDigest)
    invalidRecovery();
  await admitAiImage(bytes, picture.mime);
}
class NativeRecoveryStorage implements AiRecoveryStorage {
  constructor(
    private readonly operation: Operation,
    private readonly run: Run,
    private readonly owner: RecoveryReceiptOwner
  ) {}
  private async request(
    value: Record<string, unknown>,
    id: number
  ): Promise<AiRecoveryRequestReceipt> {
    exact(value, ['receipt']);
    const receipt = parseRecoveryRequestReceipt(value.receipt);
    if (receipt.journal.id !== id) invalidRecovery();
    await verifyRecoveryRequestIdentity(receipt);
    return this.owner.request(receipt);
  }
  prepareRecoverySendFromHeld(
    ...[source, id, createdAt, credential]: Parameters<
      AiRecoveryStorage['prepareRecoverySendFromHeld']
    >
  ) {
    return this.run('prepareRecoverySendFromHeld', async () => {
      const selector = this.owner.current(source);
      const pinnedCredential = checkedRecoveryCredential(credential);
      if (
        !Number.isSafeInteger(id) ||
        id <= source.journal.id ||
        !Number.isSafeInteger(createdAt) ||
        createdAt <= source.journal.createdAt
      )
        invalidRecovery();
      const receipt = await this.request(
        await this.operation('prepareRecoverySendFromHeld', {
          source: selector,
          id,
          createdAt,
          credential: pinnedCredential,
        }),
        id
      );
      if (
        receipt.nonce === source.nonce ||
        receipt.journal.id !== id ||
        receipt.journal.createdAt !== createdAt ||
        receipt.journal.originalId !== source.journal.originalId ||
        receipt.journal.style !== source.journal.style ||
        receipt.originalDigest !== source.originalDigest ||
        receipt.inputDigest !== source.inputDigest ||
        receipt.inputLength !== source.inputLength ||
        receipt.recovery.state !== 'prepared' ||
        JSON.stringify(receipt.recovery.sourceHeld) !== JSON.stringify(selector) ||
        JSON.stringify(receipt.recovery.credential) !== JSON.stringify(pinnedCredential)
      )
        invalidRecovery();
      return receipt;
    });
  }
  markRecoverySubmission(receipt: AiRecoveryRequestReceipt) {
    return this.run('markRecoverySubmission', async () => {
      if (
        receipt.recovery.state !== 'prepared' &&
        receipt.recovery.state !== 'submission-uncertain'
      )
        invalidRecovery();
      const next = await this.request(
        await this.operation('markRecoverySubmission', this.owner.current(receipt)),
        receipt.journal.id
      );
      if (next.recovery.state !== 'submission-uncertain') invalidRecovery();
      return next;
    });
  }
  readRecoveryUpload(receipt: AiRecoveryRequestReceipt) {
    return this.run('readRecoveryUpload', async () => {
      if (receipt.recovery.state !== 'submission-uncertain') invalidRecovery();
      const value = await this.operation('readRecoveryUpload', this.owner.current(receipt));
      exact(value, ['receipt', 'upload']);
      const next = this.owner.request(value.receipt);
      await verifyRecoveryRequestIdentity(next);
      if (
        JSON.stringify(next) !== JSON.stringify(receipt) ||
        typeof value.upload !== 'string' ||
        value.upload.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 ||
        value.upload.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.upload)
      )
        invalidRecovery();
      const bytes = Uint8Array.from(atob(value.upload), (part) => part.charCodeAt(0));
      if (
        bytes.length !== next.inputLength ||
        bytesBase64(bytes) !== value.upload ||
        recoveryDigest(bytes) !== next.inputDigest
      )
        invalidRecovery();
      await admitAiImage(bytes, 'image/png');
      return new Uint8Array(bytes);
    });
  }
  recordRecoveryAdmission(
    ...[receipt, status]: Parameters<AiRecoveryStorage['recordRecoveryAdmission']>
  ) {
    return this.run('recordRecoveryAdmission', async () => {
      const admitted = checkedRecoveryAdmission(receipt, status);
      const next = await this.request(
        await this.operation('recordRecoveryAdmission', {
          ...this.owner.current(receipt),
          status: {
            ...admitted,
            protocol: RECOVERY_PROTOCOL,
            headerExpiresAt: String(admitted.expiresAt),
          },
        }),
        receipt.journal.id
      );
      if (
        next.recovery.expiry.kind !== 'known' ||
        next.recovery.expiry.expiresAt !== admitted.expiresAt
      )
        invalidRecovery();
      return next;
    });
  }
  recordRecoveryTerminal(
    ...[receipt, confirmation]: Parameters<AiRecoveryStorage['recordRecoveryTerminal']>
  ) {
    return this.run('recordRecoveryTerminal', async () => {
      const checked = checkedRecoveryTerminal(receipt, confirmation);
      const next = await this.request(
        await this.operation('recordRecoveryTerminal', {
          ...this.owner.current(receipt),
          confirmation: checked,
        }),
        receipt.journal.id
      );
      if (
        next.recovery.state !== 'terminal' ||
        next.recovery.outcome !== checked.body.outcome ||
        next.recovery.expiry.kind !== 'known' ||
        next.recovery.expiry.expiresAt !== checked.body.expiresAt
      )
        invalidRecovery();
      return next;
    });
  }
  retainRecoveryResult(
    ...[receipt, raw, bytes]: Parameters<AiRecoveryStorage['retainRecoveryResult']>
  ) {
    const ownedBytes = new Uint8Array(bytes);
    return this.run('retainRecoveryResult', async () => {
      const delivery = checkedRecoveryDelivery(receipt, raw);
      if (ownedBytes.length !== delivery.length || recoveryDigest(ownedBytes) !== delivery.digest)
        invalidRecovery();
      await admitAiImage(ownedBytes, delivery.mime);
      const next = await this.request(
        await this.operation('retainRecoveryResult', {
          ...this.owner.current(receipt),
          delivery,
          bytes: bytesBase64(ownedBytes),
        }),
        receipt.journal.id
      );
      if (
        (next.recovery.state !== 'retained' && next.recovery.state !== 'acknowledged') ||
        !next.journal.result ||
        !('delivery' in next.recovery) ||
        JSON.stringify(next.recovery.delivery) !== JSON.stringify(delivery)
      )
        invalidRecovery();
      await verifyNativeRecoveryResult(next);
      return Object.freeze({ picture: next.journal.result, receipt: next });
    });
  }
  recordAck(...[receipt, confirmation]: Parameters<AiRecoveryStorage['recordAck']>) {
    return this.run('recordAck', async () => {
      const checked = checkedRecoveryAck(receipt, confirmation);
      await verifyNativeRecoveryResult(receipt);
      const next = await this.request(
        await this.operation('recordAck', {
          ...this.owner.current(receipt),
          confirmation: checked,
        }),
        receipt.journal.id
      );
      if (next.recovery.state !== 'acknowledged') invalidRecovery();
      await verifyNativeRecoveryResult(next);
      return next;
    });
  }
  readRecoveryAttempt(id: number) {
    return this.run('readRecoveryAttempt', async () => {
      if (!Number.isSafeInteger(id) || id < 1) invalidRecovery();
      const value = await this.operation('readRecoveryAttempt', { id });
      exact(value, ['receipt']);
      if (value.receipt === null) {
        this.owner.absent(id);
        return null;
      }
      const receipt = this.owner.admit(value.receipt);
      if (receipt.journal.id !== id) invalidRecovery();
      if (receipt.kind === 'recovery-request') {
        await verifyRecoveryRequestIdentity(receipt);
        await verifyNativeRecoveryResult(receipt);
      }
      return receipt;
    });
  }
}
export function createNativeRecoveryStorage(
  operation: Operation,
  run: Run,
  owner: RecoveryReceiptOwner
): AiRecoveryStorage {
  const storage = new NativeRecoveryStorage(operation, run, owner);
  return {
    prepareRecoverySendFromHeld: (...args) => storage.prepareRecoverySendFromHeld(...args),
    markRecoverySubmission: (...args) => storage.markRecoverySubmission(...args),
    readRecoveryUpload: (...args) => storage.readRecoveryUpload(...args),
    recordRecoveryAdmission: (...args) => storage.recordRecoveryAdmission(...args),
    recordRecoveryTerminal: (...args) => storage.recordRecoveryTerminal(...args),
    retainRecoveryResult: (...args) => storage.retainRecoveryResult(...args),
    recordAck: (...args) => storage.recordAck(...args),
    readRecoveryAttempt: (...args) => storage.readRecoveryAttempt(...args),
  };
}
