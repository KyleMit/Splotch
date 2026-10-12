import { createFeedbackGate, type FeedbackGateState } from '../feedback/feedbackGate';
import {
  AI_STYLES,
  isInstallationId,
  type AiStyle,
  type AiMime,
  type CredentialKind,
} from './contract';
import {
  credentialHeaders,
  validCredential,
  type AiCredential,
  type AiVault,
  type AiReferencedVault,
} from './credentials';
import { requestAi, type AiTransport } from './transport';
import type { AiJournal, AiResult, AiStorage, AiRecoveryHeldReceipt } from './journal';
import type { AiImageAdmission } from './imageAdmission';
import type { ParentOperationPort, ParentProof } from '../parentCenter/parentPolicy';
import { createAiReportOwner } from './reportOwner';
import type { AiReportState } from './reportContract';
export type AiState = Readonly<{
  open: boolean;
  authorized: boolean;
  gate: FeedbackGateState;
  style: AiStyle;
  busy: boolean;
  remaining: number | null;
  credential: 'free' | CredentialKind | 'unavailable';
  journal: AiJournal | null;
  recovery: AiRecoveryHeldReceipt | null;
  heldResult: AiResult | null;
  pictures: readonly AiResult[];
  message: string;
  retryAt: number;
  report: AiReportState;
}>;
export type PreparedAiDrawing = {
  bytes: Uint8Array;
  originalId: string;
  originalModel: string;
};
export class AiSession {
  protected deps: {
    vault: AiVault & AiReferencedVault;
    storage: AiStorage;
    transport: AiTransport;
    prepare: () => Promise<PreparedAiDrawing>;
    admit: AiImageAdmission;
    parent?: ParentOperationPort;
  };
  constructor(deps: {
    vault: AiVault & AiReferencedVault;
    storage: AiStorage;
    transport: AiTransport;
    prepare: () => Promise<PreparedAiDrawing>;
    admit: AiImageAdmission;
    parent?: ParentOperationPort;
  }) {
    this.deps = deps;
    this.reports = createAiReportOwner({
      vault: deps.vault,
      parent: deps.parent,
      transport: deps.transport,
      admit: deps.admit,
      publish: (report) => this.update({ report }),
      current: (uri) =>
        !this.disposed &&
        this.state.open &&
        this.state.authorized &&
        !this.state.gate.open &&
        [this.state.heldResult, this.state.journal?.result, ...this.state.pictures].some(
          (result) => result?.uri === uri
        ),
    });
  }
  protected reports: ReturnType<typeof createAiReportOwner>;
  protected listeners = new Set<() => void>();
  protected disposed = false;
  protected recoveryUncertain = false;
  protected timer: ReturnType<typeof setTimeout> | null = null;
  protected journals = new Map<number, AiJournal>();
  protected ambiguous = new Set<number>();
  protected credential: AiCredential | null = null;
  protected active = false;
  protected pollStarted = 0;
  protected authorization = 0;
  private parentProof: ParentProof | null = null;
  private consentEpoch = -1;
  protected consented = () => {
    const consent = this.deps.parent?.consent();
    return (
      !this.disposed &&
      (!consent ||
        (consent.enabled && consent.epoch === this.consentEpoch && !!this.parentProof?.valid()))
    );
  };
  protected protect = (action: () => void) => {
    const parent = this.deps.parent;
    if (!parent) {
      action();
      return;
    }
    if (!parent.consent().enabled) return;
    parent.request('ai', (proof) => {
      if (!proof.valid() || !parent.consent().enabled || this.disposed) return;
      this.parentProof = proof;
      this.consentEpoch = parent.consent().epoch;
      this.authorization += 1;
      this.update({ authorized: true });
      action();
    });
  };
  protected gate = createFeedbackGate((next) =>
    this.update({
      gate: next,
    })
  );
  protected state: AiState = {
    open: false,
    authorized: false,
    gate: this.gate.getState(),
    style: AI_STYLES[0],
    busy: false,
    remaining: null,
    credential: 'unavailable',
    journal: null,
    recovery: null,
    heldResult: null,
    pictures: [],
    message: '',
    retryAt: 0,
    report: { phase: 'idle' },
  };
  protected update = (next: Partial<AiState>) => {
    this.state = {
      ...this.state,
      ...next,
    };
    if (!this.disposed) for (const listener of this.listeners) listener();
  };
  protected unresolved = () => {
    return (
      this.recoveryUncertain ||
      this.state.recovery !== null ||
      (!!this.state.journal && !['result', 'failed'].includes(this.state.journal.phase))
    );
  };
  private writing: Promise<unknown> = Promise.resolve();
  protected persist = (journal: AiJournal) => {
    const work = this.writing
      .catch(() => {})
      .then(async () => {
        if (this.journals.get(journal.id)?.phase === 'result' && journal.phase !== 'result') return;
        const receipt = await this.deps.storage.write(journal);
        this.journals.set(journal.id, receipt.journal);
        this.update({ journal: receipt.journal });
      });
    this.writing = work;
    return work;
  };
  protected persistPrepared = (journal: AiJournal, prepared: PreparedAiDrawing) => {
    const work = this.writing
      .catch(() => {})
      .then(async () => {
        const receipt = await this.deps.storage.prepare(
          journal,
          prepared.originalModel,
          prepared.bytes
        );
        this.journals.set(journal.id, receipt.journal);
        this.update({ journal: receipt.journal });
        return receipt;
      });
    this.writing = work;
    return work;
  };
  protected refreshCredential = async () => {
    const proof = this.authorization;
    const permitted = () =>
      this.state.authorized && proof === this.authorization && !this.disposed && this.consented();
    if (!permitted()) throw new Error('AI authorization changed.');
    this.credential = null;
    this.update({
      credential: 'unavailable',
      remaining: null,
    });
    const byok = await this.deps.vault.read('byok');
    if (!permitted()) throw new Error('AI authorization changed.');
    const managed = await this.deps.vault.read('managed');
    if (!permitted()) throw new Error('AI authorization changed.');
    if (
      (byok !== null && !validCredential(byok)) ||
      (managed !== null && !validCredential(managed))
    )
      throw new Error('Saved AI credentials could not be read safely.');
    if (byok)
      this.credential = {
        kind: 'byok',
        value: byok,
      };
    else if (managed)
      this.credential = {
        kind: 'managed',
        value: managed,
      };
    else {
      const id = await this.deps.vault.installationId();
      if (!permitted()) throw new Error('AI authorization changed.');
      if (!isInstallationId(id)) throw new Error('Installation grant unavailable.');
      this.credential = {
        kind: 'free',
        installationId: id,
      };
    }
    this.update({
      credential: this.credential.kind,
    });
    if (this.credential.kind === 'free') {
      const reply = await requestAi(
        this.deps.transport,
        {
          path: '/api/free-generation-grant',
          method: 'GET',
          headers: credentialHeaders(this.credential),
        },
        () => {}
      );
      if (!permitted()) return;
      if (reply.kind === 'grant')
        this.update({
          remaining: reply.remaining,
        });
      else
        this.update({
          message:
            reply.kind === 'failure' || reply.kind === 'unknown'
              ? reply.message
              : 'Free allowance unavailable.',
          retryAt: reply.kind === 'failure' ? (reply.retryAt ?? 0) : 0,
        });
    }
  };
  protected load = async () => {
    if (!this.consented() || this.active || this.state.retryAt > Date.now()) return;
    const proof = this.authorization;
    const permitted = () =>
      this.state.authorized && proof === this.authorization && !this.disposed && this.consented();
    this.active = true;
    this.update({
      busy: true,
      message: '',
    });
    try {
      {
        const stored = await this.deps.storage.read();
        if (!permitted()) return;
        this.recoveryUncertain = false;
        if (stored?.kind === 'recovery-held') {
          this.credential = null;
          this.update({
            recovery: stored.receipt,
            journal: null,
            credential: 'unavailable',
            remaining: null,
            message:
              'A recovery attempt is saved. Collection is unavailable until recovery is qualified. Your original stays held.',
          });
          return;
        }
        const journal =
          stored === null
            ? null
            : stored.kind === 'native'
              ? stored.receipt.journal
              : stored.journal;
        this.update({
          journal,
        });
        if (journal) this.journals.set(journal.id, journal);
      }
      await this.refreshCredential();
      if (!permitted()) return;
      const pictures = await this.deps.storage.pictures();
      if (!permitted()) return;
      this.update({ pictures });
      if (this.state.journal?.phase === 'sent')
        await this.persist({
          ...this.state.journal,
          phase: 'unknown',
        });
    } catch {
      this.update({
        credential: 'unavailable',
        message: 'AI storage or allowance is unavailable. Your drawing is still here.',
      });
      this.credential = null;
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
  protected heldBytes: {
    id: number;
    bytes: Uint8Array;
    mime: AiMime;
  } | null = null;
  private setupAuthorized = async (kind: CredentialKind, value: string) => {
    if (
      !this.state.authorized ||
      !this.consented() ||
      this.active ||
      this.unresolved() ||
      this.state.retryAt > Date.now()
    )
      return;
    if (!validCredential(value)) {
      this.update({
        message: 'Enter a credential without spaces, up to 2048 characters.',
      });
      return;
    }
    const proof = this.authorization;
    this.active = true;
    this.update({
      busy: true,
    });
    try {
      const reply = await requestAi(
        this.deps.transport,
        {
          path: kind === 'byok' ? '/api/verify-key' : '/api/verify-access-code',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            kind === 'byok'
              ? {
                  apiKey: value,
                }
              : {
                  code: value,
                }
          ),
        },
        () => {}
      );
      if (reply.kind !== 'verified') {
        this.update({
          message:
            reply.kind === 'failure' || reply.kind === 'unknown'
              ? reply.message
              : 'Credential check unavailable.',
          retryAt: reply.kind === 'failure' ? (reply.retryAt ?? 0) : 0,
        });
        return;
      }
      if (
        !this.state.authorized ||
        !this.consented() ||
        proof !== this.authorization ||
        this.disposed
      )
        return;
      const verified = kind === 'managed' ? reply.accessCode : value;
      if (!validCredential(verified)) throw new Error('Invalid credential');
      await this.deps.vault.write(kind, verified);
      if (!this.state.authorized || proof !== this.authorization || !this.consented()) return;
      await this.refreshCredential();
      if (!this.state.authorized || proof !== this.authorization || !this.consented()) return;
      this.update({
        message: 'AI credential saved securely on this device.',
      });
    } catch {
      this.credential = null;
      this.update({
        credential: 'unavailable',
        message:
          'Secure storage did not confirm the change. AI is unavailable until storage can be read safely.',
      });
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
  setup = async (kind: CredentialKind, value: string) => {
    if (!this.deps.parent) return this.setupAuthorized(kind, value);
    if (this.active || this.unresolved()) return;
    this.protect(() => {
      void this.setupAuthorized(kind, value);
    });
  };
  private removeAuthorized = async (kind: CredentialKind) => {
    if (!this.state.authorized || !this.consented() || this.active || this.unresolved()) return;
    const proof = this.authorization;
    this.active = true;
    this.credential = null;
    this.update({
      busy: true,
      credential: 'unavailable',
    });
    try {
      await this.deps.vault.remove(kind);
      if (!this.state.authorized || proof !== this.authorization || !this.consented()) return;
      await this.refreshCredential();
      if (!this.state.authorized || proof !== this.authorization || !this.consented()) return;
      this.update({
        message: 'Credential removed from secure storage.',
      });
    } catch {
      this.update({
        message:
          'Removal was not confirmed. AI stays unavailable until secure storage can be read safely.',
      });
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
  removeCredential = async (kind: CredentialKind) => {
    if (!this.deps.parent) return this.removeAuthorized(kind);
    if (this.active || this.unresolved()) return;
    this.protect(() => {
      void this.removeAuthorized(kind);
    });
  };
  getState = () => this.state;
  hasHeldResult = () => this.heldBytes !== null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  close = () => {
    this.reports.cancel();
    this.authorization += 1;
    this.parentProof = null;
    this.deps.parent?.cancel('ai');
    this.gate.dismiss();
    this.update({
      open: false,
      authorized: false,
    });
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  };
  gateInput = this.gate.input;
  gateAnswer = this.gate.answer;
  gateTick = this.gate.tick;
  chooseStyle = (style: AiStyle) => {
    if (!this.active && !this.unresolved())
      this.update({
        style,
      });
  };
  refresh = () => {
    if (!this.deps.parent) return this.load();
    if (!this.active)
      this.protect(() => {
        void this.load();
      });
  };
  dispose = () => {
    this.reports.dispose();
    this.authorization += 1;
    this.parentProof = null;
    this.deps.parent?.cancel('ai');
    this.disposed = true;
    this.gate.dismiss();
    this.listeners.clear();
    if (this.timer) clearTimeout(this.timer);
  };
  reportPicture = (uri: string) => this.reports.request(uri);
  sendPictureReport = () => this.reports.send();
  cancelPictureReport = () => this.reports.cancel();
}
