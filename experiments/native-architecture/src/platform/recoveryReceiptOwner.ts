import type { AiRecoveryHeldReceipt, AiRecoveryRequestReceipt } from '../ai/journal';
import {
  assertRecoveryRequestProgress,
  parseRecoveryHeldReceipt,
  parseRecoveryRequestReceipt,
  record,
} from './nativeAiReceipt';
import { invalidRecovery } from '../ai/recoveryRequest';

type Receipt = AiRecoveryHeldReceipt | AiRecoveryRequestReceipt;
export class RecoveryReceiptOwner {
  private readonly receipts = new Map<number, Receipt>();
  admit(raw: unknown): Receipt {
    const next =
      record(raw) && raw.kind === 'recovery-request'
        ? parseRecoveryRequestReceipt(raw)
        : parseRecoveryHeldReceipt(raw);
    const prior = this.receipts.get(next.journal.id);
    if (
      [...this.receipts.values()].some(
        (receipt) => receipt.journal.id !== next.journal.id && receipt.nonce === next.nonce
      )
    )
      invalidRecovery();
    if (prior) {
      if (prior.kind !== next.kind) invalidRecovery();
      if (prior.kind === 'recovery-request' && next.kind === 'recovery-request')
        assertRecoveryRequestProgress(prior, next);
      else if (
        prior.kind === 'recovery-held' &&
        next.kind === 'recovery-held' &&
        (prior.nonce !== next.nonce ||
          prior.journal.createdAt !== next.journal.createdAt ||
          prior.journal.style !== next.journal.style ||
          prior.journal.originalId !== next.journal.originalId ||
          prior.originalDigest !== next.originalDigest ||
          prior.inputDigest !== next.inputDigest ||
          prior.inputLength !== next.inputLength ||
          prior.recovery.id !== next.recovery.id ||
          JSON.stringify(prior.recovery.credential) !== JSON.stringify(next.recovery.credential) ||
          next.revision < prior.revision ||
          (prior.recovery.intent === 'committed' && next.recovery.intent !== 'committed') ||
          (prior.recovery.expiry.kind === 'known' &&
            JSON.stringify(prior.recovery.expiry) !== JSON.stringify(next.recovery.expiry)) ||
          (next.revision === prior.revision && JSON.stringify(next) !== JSON.stringify(prior)))
      )
        invalidRecovery();
    }
    if (prior && JSON.stringify(prior) === JSON.stringify(next)) return prior;
    this.receipts.set(next.journal.id, next);
    return next;
  }
  held(raw: unknown): AiRecoveryHeldReceipt {
    const value = this.admit(raw);
    if (value.kind !== 'recovery-held') invalidRecovery();
    return value;
  }
  request(raw: unknown): AiRecoveryRequestReceipt {
    const value = this.admit(raw);
    if (value.kind !== 'recovery-request') invalidRecovery();
    return value;
  }
  current(receipt: Receipt) {
    if (this.receipts.get(receipt.journal.id) !== receipt)
      throw new Error('Recovery receipt is stale. Reopen AI picture before continuing.');
    return { id: receipt.journal.id, nonce: receipt.nonce, revision: receipt.revision };
  }
  absent(id: number): void {
    if (this.receipts.has(id)) invalidRecovery();
  }
  legacy(): void {
    if (this.receipts.size) invalidRecovery();
  }
}
