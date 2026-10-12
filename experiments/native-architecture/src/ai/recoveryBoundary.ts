import { RECOVERY_PATH, RECOVERY_PROTOCOL, RECOVERY_VERSION_HEADER } from './recoveryContract';
import {
  credentialHeaders,
  type AiCredentialLease,
  type AiCredentialReference,
} from './credentials';
import { requestAi, type AiReply, type AiRequest } from './transport';
import type { AiRecoveryHeldReceipt, AiRecoveryRequestReceipt } from './journal';
import { recoveryDigest } from './recoveryDigest';
import { resultImageGrid } from './imageAdmission';
import { AiSession } from './session';

export type RecoveryReceipt = AiRecoveryHeldReceipt | AiRecoveryRequestReceipt;
export type RecoveryAction = {
  proof: number;
  lease: AiCredentialLease;
  receipt: RecoveryReceipt | null;
};
export class AiRecoveryBoundary extends AiSession {
  // Tests subclass this seam; production owners always use the guarded requestAi default.
  protected dispatchRecovery: typeof requestAi = requestAi;
  protected sameAction = (action: RecoveryAction) =>
    this.state.open &&
    this.state.authorized &&
    !this.disposed &&
    this.consented() &&
    action.proof === this.authorization &&
    this.state.recovery === action.receipt;
  protected permitted = (action: RecoveryAction) => this.sameAction(action) && action.lease.valid();
  protected pinForAction = async (action: RecoveryAction, kind: AiCredentialReference['kind']) => {
    this.assertCurrent(action);
    const pinned = await this.deps.vault.pinLeased(kind);
    if (!this.sameAction(action) || !pinned.lease.valid())
      throw new Error('Recovery permission changed.');
    action.lease = pinned.lease;
    this.assertCurrent(action);
    return pinned.reference;
  };
  protected assertCurrent = (action: RecoveryAction) => {
    if (!this.permitted(action)) throw new Error('Recovery permission changed.');
  };
  protected publishReceipt = (action: RecoveryAction, receipt: RecoveryReceipt) => {
    action.receipt = receipt;
    this.update({ recovery: receipt, journal: null, heldResult: receipt.journal.result });
  };
  protected recoverStorage = async (action: RecoveryAction) => {
    this.recoveryUncertain = true;
    try {
      const stored = await this.deps.storage.read();
      if (stored?.kind === 'recovery-held' || stored?.kind === 'recovery-request') {
        this.publishReceipt(action, stored.receipt);
        this.recoveryUncertain = false;
      }
    } catch {
      /* An unconfirmed reread cannot release the recovery hold. */
    }
  };
  protected runRecovery = async (work: (action: RecoveryAction) => Promise<void>) => {
    if (this.active || !this.state.open || !this.state.authorized || !this.consented()) return;
    const action: RecoveryAction = {
      proof: this.authorization,
      lease: this.deps.vault.lease(),
      receipt: this.state.recovery,
    };
    this.active = true;
    this.update({ busy: true });
    try {
      this.assertCurrent(action);
      await work(action);
      if (!this.permitted(action)) return;
    } catch {
      if (this.recoveryUncertain || this.permitted(action)) await this.recoverStorage(action);
      if (this.permitted(action))
        this.update({
          message:
            'Recovery could not be confirmed. Your saved drawing stays here. Nothing will be sent again automatically.',
        });
    } finally {
      this.active = false;
      this.update({ busy: false });
    }
  };
  protected requestRecovery = async (
    action: RecoveryAction,
    request: AiRequest
  ): Promise<AiReply> => {
    this.assertCurrent(action);
    const reply = await this.dispatchRecovery(this.deps.transport, request, () => {
      if (this.permitted(action))
        this.update({
          message:
            'A recovery reply arrived late. Check the saved request again before continuing.',
        });
    });
    this.assertCurrent(action);
    return reply;
  };
  protected referencedHeaders = async (action: RecoveryAction, receipt: RecoveryReceipt) => {
    this.assertCurrent(action);
    const credential = await this.deps.vault.readReferenced(receipt.recovery.credential);
    this.assertCurrent(action);
    if (credential.kind !== receipt.recovery.credential.kind)
      throw new Error('Credential changed.');
    return { ...credentialHeaders(credential), [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL };
  };
  protected rereadRequest = async (action: RecoveryAction): Promise<AiRecoveryRequestReceipt> => {
    this.assertCurrent(action);
    const expected = action.receipt;
    if (!expected || expected.kind !== 'recovery-request') throw new Error('No saved request.');
    const receipt = await this.deps.storage.readRecoveryAttempt(expected.journal.id);
    if (
      !receipt ||
      receipt.kind !== 'recovery-request' ||
      receipt.nonce !== expected.nonce ||
      receipt.recovery.id !== expected.recovery.id ||
      receipt.revision < expected.revision
    )
      throw new Error('Recovery read could not be confirmed.');
    this.publishReceipt(action, receipt);
    this.recoveryUncertain = false;
    this.assertCurrent(action);
    return receipt;
  };
  protected acceptReply = async (action: RecoveryAction, reply: AiReply) => {
    const receipt = action.receipt;
    if (!receipt) return;
    this.assertCurrent(action);
    if (reply.kind === 'recovery-terminal' && receipt.kind === 'recovery-request') {
      await this.referencedHeaders(action, receipt);
      this.assertCurrent(action);
      this.recoveryUncertain = true;
      const next = await this.deps.storage.recordRecoveryTerminal(receipt, reply.confirmation);
      this.publishReceipt(action, next);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      this.update({
        message: 'This request has finished without a picture. Your original drawing is saved.',
      });
      return;
    }
    if (reply.kind === 'recovery' && reply.reply.kind === 'status') {
      await this.referencedHeaders(action, receipt);
      this.assertCurrent(action);
      this.recoveryUncertain = true;
      const next =
        receipt.kind === 'recovery-held'
          ? await this.deps.storage.recordRecoveryStatus(receipt, reply.reply)
          : await this.deps.storage.recordRecoveryAdmission(receipt, reply.reply);
      this.publishReceipt(action, next);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      this.update({
        message:
          next.kind === 'recovery-request' && next.recovery.state === 'terminal'
            ? 'This request has finished without a picture. Your original drawing is saved.'
            : 'The saved request was checked. Choose Check saved picture again when you are ready.',
      });
      return;
    }
    if (reply.kind === 'recovery-delivery' && receipt.kind === 'recovery-request') {
      const image = reply.reply;
      const bytes = new Uint8Array(image.bytes);
      if (recoveryDigest(bytes) !== image.digest) throw new Error('Recovery image digest changed.');
      await resultImageGrid(bytes, image.mime, () => this.permitted(action));
      this.assertCurrent(action);
      await this.deps.admit(bytes, image.mime);
      this.assertCurrent(action);
      this.recoveryUncertain = true;
      const saved = await this.deps.storage.retainRecoveryResult(
        receipt,
        {
          expiresAt: image.expiresAt,
          digest: image.digest,
          receipt: reply.receipt,
          mime: image.mime,
          length: bytes.length,
        },
        bytes
      );
      this.publishReceipt(action, saved.receipt);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      // The storage owner rereads, re-fences and fully decodes retained bytes before returning.
      await this.rereadRequest(action);
      this.assertCurrent(action);
      await this.acknowledgeAuthorized(action);
      this.assertCurrent(action);
      return;
    }
    await this.recoverStorage(action);
    this.assertCurrent(action);
    this.update({
      message:
        reply.kind === 'recovery' && reply.reply.kind === 'held' && reply.reply.reason === 'expired'
          ? 'This saved request is no longer available from the service. Your original stays saved. It will not be sent again automatically.'
          : 'Recovery sending and collection are unavailable. Your saved drawing stays here.',
    });
  };
  protected acknowledgeAuthorized = async (action: RecoveryAction) => {
    const receipt = await this.rereadRequest(action);
    this.assertCurrent(action);
    if (receipt.recovery.state === 'acknowledged') return;
    if (receipt.recovery.state !== 'retained') throw new Error('No confirmed retained picture.');
    const delivery = receipt.recovery.delivery;
    const headers = await this.referencedHeaders(action, receipt);
    this.assertCurrent(action);
    const reply = await this.requestRecovery(action, {
      path: RECOVERY_PATH,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'ack',
        id: receipt.recovery.id,
        createdAt: receipt.journal.createdAt,
        digest: delivery.digest,
        receipt: delivery.receipt,
      }),
      recovery: {
        kind: 'ack',
        id: receipt.recovery.id,
        createdAt: receipt.journal.createdAt,
        expiry: receipt.recovery.expiry,
        digest: delivery.digest,
        receipt: delivery.receipt,
      },
    });
    this.assertCurrent(action);
    if (reply.kind !== 'recovery-ack') throw new Error('Acknowledgement was not confirmed.');
    this.recoveryUncertain = true;
    const acknowledged = await this.deps.storage.recordAck(receipt, reply.confirmation);
    this.publishReceipt(action, acknowledged);
    this.recoveryUncertain = false;
    this.assertCurrent(action);
    this.update({ message: 'Your AI picture and original are saved on this device.' });
  };
}
