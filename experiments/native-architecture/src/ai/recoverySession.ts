import {
  RECOVERY_PATH,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
} from './recoveryContract';
import type { AiJournal } from './journal';
import { recoveryDigest } from './recoveryDigest';
import { AiRecoveryBoundary } from './recoveryBoundary';
export class AiRecoverySession extends AiRecoveryBoundary {
  private prepareRecoveryAuthorized = () =>
    this.runRecovery(async (action) => {
      if (this.unresolved() || !this.credential) return;
      const kind = this.credential.kind;
      const reference = await this.pinForAction(action, kind);
      this.assertCurrent(action);
      await this.deps.vault.readReferenced(reference);
      this.assertCurrent(action);
      const prepared = await this.deps.prepare();
      this.assertCurrent(action);
      await this.deps.vault.readReferenced(reference);
      this.assertCurrent(action);
      const createdAt = Date.now();
      const journal: AiJournal = {
        version: 1,
        id: Math.max(createdAt, (this.state.journal?.id ?? 0) + 1),
        createdAt,
        style: this.state.style,
        originalId: prepared.originalId,
        phase: 'unknown',
        jobId: null,
        result: null,
      };
      this.recoveryUncertain = true;
      const held = await this.deps.storage.prepareRecovery(
        journal,
        prepared.originalModel,
        prepared.bytes,
        reference
      );
      this.publishReceipt(action, held);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      await this.deps.vault.readReferenced(reference);
      this.assertCurrent(action);
      this.recoveryUncertain = true;
      const committed = await this.deps.storage.commitRecoveryIntent(held);
      this.publishReceipt(action, committed);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      this.update({
        message:
          'Your request and original are saved on this device. Nothing was uploaded. Recovery sending is unavailable.',
      });
    });
  private sendRecoveryAuthorized = () =>
    this.runRecovery(async (action) => {
      const source = action.receipt;
      if (!source || source.kind !== 'recovery-held' || this.recoveryUncertain) return;
      const restored = await this.deps.storage.readRecoveryAttempt(source.journal.id);
      this.assertCurrent(action);
      if (
        !restored ||
        restored.kind !== 'recovery-held' ||
        restored.nonce !== source.nonce ||
        restored.revision !== source.revision
      )
        throw new Error('Saved source changed.');
      this.publishReceipt(action, restored);
      const reference = await this.pinForAction(action, source.recovery.credential.kind);
      this.assertCurrent(action);
      await this.deps.vault.readReferenced(reference);
      this.assertCurrent(action);
      const id = Math.max(Date.now(), source.journal.id + 1);
      const createdAt = Math.max(Date.now(), source.journal.createdAt + 1);
      this.recoveryUncertain = true;
      let receipt = await this.deps.storage.prepareRecoverySendFromHeld(
        restored,
        id,
        createdAt,
        reference
      );
      this.publishReceipt(action, receipt);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      this.recoveryUncertain = true;
      receipt = await this.deps.storage.markRecoverySubmission(receipt);
      this.publishReceipt(action, receipt);
      this.recoveryUncertain = false;
      this.assertCurrent(action);
      const upload = await this.deps.storage.readRecoveryUpload(receipt);
      this.assertCurrent(action);
      if (upload.length !== receipt.inputLength || recoveryDigest(upload) !== receipt.inputDigest)
        throw new Error('Saved upload changed.');
      const headers = await this.referencedHeaders(action, receipt);
      this.assertCurrent(action);
      const reply = await this.requestRecovery(action, {
        path: RECOVERY_PATH,
        method: 'POST',
        terminalProof: true,
        query: `style=${encodeURIComponent(receipt.journal.style)}`,
        headers: {
          ...headers,
          'Content-Type': 'image/png',
          [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE,
          [RECOVERY_NONCE_HEADER]: receipt.nonce,
          [RECOVERY_CREATED_HEADER]: String(receipt.journal.createdAt),
          [RECOVERY_INPUT_DIGEST_HEADER]: receipt.inputDigest,
        },
        body: upload,
        recovery: {
          kind: 'admit',
          id: receipt.recovery.id,
          createdAt: receipt.journal.createdAt,
          expiry: receipt.recovery.expiry,
        },
      });
      this.assertCurrent(action);
      await this.acceptReply(action, reply);
    });
  private collectRecoveryAuthorized = () =>
    this.runRecovery(async (action) => {
      let receipt = action.receipt;
      if (!receipt) return;
      if (receipt.kind === 'recovery-request') {
        receipt = await this.rereadRequest(action);
        this.assertCurrent(action);
        if (receipt.recovery.state === 'retained') return this.acknowledgeAuthorized(action);
        if (receipt.recovery.state === 'acknowledged' || receipt.recovery.state === 'terminal')
          return;
        if (receipt.recovery.state === 'prepared') {
          this.update({
            message:
              'This request was saved before sending. It stays held; it will not be sent again automatically.',
          });
          return;
        }
      } else if (receipt.recovery.intent !== 'committed') return;
      const headers = await this.referencedHeaders(action, receipt);
      this.assertCurrent(action);
      const read = {
        kind: 'collect' as const,
        id: receipt.recovery.id,
        createdAt: receipt.journal.createdAt,
        expiry: receipt.recovery.expiry,
      };
      const common = {
        path: RECOVERY_PATH,
        method: 'GET' as const,
        headers: {
          ...headers,
          [RECOVERY_NONCE_HEADER]: receipt.nonce,
          [RECOVERY_CREATED_HEADER]: String(receipt.journal.createdAt),
        },
        recovery: read,
      } satisfies import('./transport').RecoveryReadRequest;
      const reply = await this.requestRecovery(
        action,
        receipt.kind === 'recovery-request'
          ? {
              ...common,
              headers: { ...common.headers, [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE },
              deliveryProof: true,
              terminalProof: true,
            }
          : common
      );
      this.assertCurrent(action);
      await this.acceptReply(action, reply);
    });
  private reconcileRecoveryAuthorized = () =>
    this.runRecovery(async (action) => {
      const receipt = await this.rereadRequest(action);
      this.assertCurrent(action);
      if (!['submission-uncertain', 'admitted'].includes(receipt.recovery.state)) return;
      const headers = await this.referencedHeaders(action, receipt);
      this.assertCurrent(action);
      const reply = await this.requestRecovery(action, {
        path: RECOVERY_PATH,
        method: 'POST',
        terminalProof: true,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE,
        },
        body: JSON.stringify({
          operation: 'reconcile',
          id: receipt.recovery.id,
          createdAt: receipt.journal.createdAt,
        }),
        recovery: {
          kind: 'reconcile',
          id: receipt.recovery.id,
          createdAt: receipt.journal.createdAt,
          expiry: receipt.recovery.expiry,
        },
      });
      this.assertCurrent(action);
      await this.acceptReply(action, reply);
    });
  private requestParentAction = (work: () => Promise<void>) => {
    if (!this.deps.parent || this.active || !this.state.open) return;
    this.protect(() => {
      void work();
    });
  };
  prepareRecovery = async () => {
    if (!this.deps.parent) return this.prepareRecoveryAuthorized();
    this.requestParentAction(this.prepareRecoveryAuthorized);
  };
  sendRecovery = async () => this.requestParentAction(this.sendRecoveryAuthorized);
  collectRecovery = async () => this.requestParentAction(this.collectRecoveryAuthorized);
  reconcileRecovery = async () => this.requestParentAction(this.reconcileRecoveryAuthorized);
  acknowledgeRecovery = async () =>
    this.requestParentAction(() => this.runRecovery(this.acknowledgeAuthorized));
  readRecoverySource = async () => {
    const receipt = this.state.recovery;
    if (!receipt || receipt.kind !== 'recovery-request') return null;
    const source = await this.deps.storage.readRecoveryAttempt(receipt.recovery.sourceHeld.id);
    if (
      !source ||
      source.kind !== 'recovery-held' ||
      source.nonce !== receipt.recovery.sourceHeld.nonce ||
      source.revision !== receipt.recovery.sourceHeld.revision
    )
      throw new Error('Saved source could not be confirmed.');
    if (this.state.recovery === receipt && !this.disposed)
      this.update({
        message:
          'Your original request is still saved on this device, separate from the later request.',
      });
    return source;
  };
}
