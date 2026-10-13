import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
} from './recoveryContract';
import { credentialHeaders } from './credentials';
import { requestAi } from './transport';
import type { AiJournal } from './journal';
import { AiSession } from './session';
export class AiRecoverySession extends AiSession {
  private prepareRecoveryAuthorized = async () => {
    if (
      !this.consented() ||
      !this.state.authorized ||
      this.active ||
      this.unresolved() ||
      !this.credential
    )
      return;
    const proof = this.authorization;
    const permitted = () =>
      this.state.authorized && proof === this.authorization && !this.disposed && this.consented();
    const kind = this.credential.kind;
    this.active = true;
    this.update({ busy: true, message: 'Saving a held recovery request on this device…' });
    try {
      const reference = await this.deps.vault.pin(kind);
      if (!permitted()) return;
      const credential = await this.deps.vault.readReferenced(reference);
      if (!permitted()) return;
      if (credential.kind !== kind) throw new Error('Recovery credential generation changed.');
      const prepared = await this.deps.prepare();
      if (!permitted()) return;
      await this.deps.vault.readReferenced(reference);
      if (!permitted()) return;
      const journal: AiJournal = {
        version: 1,
        id: Math.max(Date.now(), (this.state.journal?.id ?? 0) + 1),
        createdAt: Date.now(),
        style: this.state.style,
        originalId: prepared.originalId,
        phase: 'unknown',
        jobId: null,
        result: null,
      };
      this.recoveryUncertain = true;
      let receipt = await this.deps.storage.prepareRecovery(
        journal,
        prepared.originalModel,
        prepared.bytes,
        reference
      );
      this.recoveryUncertain = false;
      this.update({ recovery: receipt, journal: null });
      if (!permitted()) return;
      await this.deps.vault.readReferenced(reference);
      if (!permitted()) return;
      receipt = await this.deps.storage.commitRecoveryIntent(receipt);
      this.update({ recovery: receipt, journal: null });
      if (!permitted()) return;
      this.update({
        message:
          'Your recovery request and original are saved here. Recovery sending is unavailable. Nothing was uploaded.',
      });
    } catch {
      this.credential = null;
      this.update({
        credential: 'unavailable',
        message:
          'Recovery storage or credential confirmation failed. Reopen recovery before trying anything else. Nothing was uploaded.',
      });
    } finally {
      this.active = false;
      this.update({ busy: false });
    }
  };
  private collectRecoveryAuthorized = async () => {
    const receipt = this.state.recovery;
    if (!this.consented() || !receipt || !this.state.authorized || this.active) return;
    if (receipt.recovery.intent !== 'committed') {
      this.update({
        message:
          'This saved recovery draft has no confirmed request intent. It stays held; nothing will be sent automatically.',
      });
      return;
    }
    const proof = this.authorization;
    const permitted = () =>
      this.state.authorized &&
      proof === this.authorization &&
      !this.disposed &&
      this.consented() &&
      this.state.recovery === receipt;
    this.active = true;
    this.update({ busy: true });
    try {
      const credential = await this.deps.vault.readReferenced(receipt.recovery.credential);
      if (!permitted()) return;
      const reply = await requestAi(
        this.deps.transport,
        {
          path: RECOVERY_PATH,
          method: 'GET',
          headers: {
            ...credentialHeaders(credential),
            [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
            [RECOVERY_NONCE_HEADER]: receipt.nonce,
            [RECOVERY_CREATED_HEADER]: String(receipt.journal.createdAt),
          },
          recovery: {
            kind: 'collect',
            id: receipt.recovery.id,
            createdAt: receipt.journal.createdAt,
            expiry: receipt.recovery.expiry,
          },
        },
        () => {
          if (permitted())
            this.update({
              message:
                'A recovery reply arrived late. Reopen collection to confirm it; the request stays held.',
            });
        }
      );
      if (!permitted()) return;
      if (reply.kind === 'recovery' && reply.reply.kind === 'status') {
        await this.deps.vault.readReferenced(receipt.recovery.credential);
        if (!permitted()) return;
        const next = await this.deps.storage.recordRecoveryStatus(receipt, reply.reply);
        this.update({ recovery: next });
        if (
          !this.state.authorized ||
          proof !== this.authorization ||
          this.disposed ||
          !this.consented()
        )
          return;
        this.update({
          message:
            'The server admission expiry is saved. This request stays held; automatic sending and ACK are unavailable.',
        });
      } else
        this.update({
          message: 'Recovery collection is unavailable. Your saved request and original stay held.',
        });
    } catch {
      this.update({ message: 'Recovery could not be confirmed. The saved request stays held.' });
    } finally {
      this.active = false;
      this.update({ busy: false });
    }
  };
  prepareRecovery = async () => {
    if (!this.deps.parent) return this.prepareRecoveryAuthorized();
    if (this.active || this.unresolved()) return;
    this.protect(() => {
      void this.prepareRecoveryAuthorized();
    });
  };
  collectRecovery = async () => {
    if (!this.deps.parent) return this.collectRecoveryAuthorized();
    if (this.active) return;
    this.protect(() => {
      void this.collectRecoveryAuthorized();
    });
  };
}
