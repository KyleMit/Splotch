import { createFeedbackGate, type FeedbackGateState } from '../feedback/feedbackGate';
import {
  AI_STYLES,
  isInstallationId,
  type AiStyle,
  type AiMime,
  type CredentialKind,
} from './contract';
import { credentialHeaders, validCredential, type AiCredential, type AiVault } from './credentials';
import { requestAi, type AiTransport } from './transport';
import type { AiJournal, AiResult, AiStorage } from './journal';
import type { AiImageAdmission } from './imageAdmission';
export type AiState = Readonly<{
  open: boolean;
  authorized: boolean;
  gate: FeedbackGateState;
  style: AiStyle;
  busy: boolean;
  remaining: number | null;
  credential: 'free' | CredentialKind | 'unavailable';
  journal: AiJournal | null;
  heldResult: AiResult | null;
  pictures: readonly AiResult[];
  message: string;
  retryAt: number;
}>;
export type PreparedAiDrawing = {
  bytes: Uint8Array;
  originalId: string;
  originalModel: string;
};
export class AiSession {
  protected deps: {
    vault: AiVault;
    storage: AiStorage;
    transport: AiTransport;
    prepare: () => Promise<PreparedAiDrawing>;
    admit: AiImageAdmission;
  };
  constructor(deps: {
    vault: AiVault;
    storage: AiStorage;
    transport: AiTransport;
    prepare: () => Promise<PreparedAiDrawing>;
    admit: AiImageAdmission;
  }) {
    this.deps = deps;
  }
  protected listeners = new Set<() => void>();
  protected disposed = false;
  protected timer: ReturnType<typeof setTimeout> | null = null;
  protected journals = new Map<number, AiJournal>();
  protected ambiguous = new Set<number>();
  protected credential: AiCredential | null = null;
  protected active = false;
  protected pollStarted = 0;
  protected authorization = 0;
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
    heldResult: null,
    pictures: [],
    message: '',
    retryAt: 0,
  };
  protected update = (next: Partial<AiState>) => {
    this.state = {
      ...this.state,
      ...next,
    };
    if (!this.disposed) for (const listener of this.listeners) listener();
  };
  protected unresolved = () => {
    return !!this.state.journal && !['result', 'failed'].includes(this.state.journal.phase);
  };
  private writing: Promise<void> = Promise.resolve();
  protected persist = (journal: AiJournal) => {
    const work = this.writing
      .catch(() => {})
      .then(async () => {
        if (this.journals.get(journal.id)?.phase === 'result' && journal.phase !== 'result') return;
        await this.deps.storage.write(journal);
        this.journals.set(journal.id, journal);
        this.update({ journal });
      });
    this.writing = work;
    return work;
  };
  protected persistPrepared = (journal: AiJournal, prepared: PreparedAiDrawing) => {
    const work = this.writing
      .catch(() => {})
      .then(async () => {
        await this.deps.storage.prepare(journal, prepared.originalModel, prepared.bytes);
        this.journals.set(journal.id, journal);
        this.update({ journal });
      });
    this.writing = work;
    return work;
  };
  protected refreshCredential = async () => {
    this.credential = null;
    this.update({
      credential: 'unavailable',
      remaining: null,
    });
    const byok = await this.deps.vault.read('byok');
    const managed = await this.deps.vault.read('managed');
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
    if (this.active || this.state.retryAt > Date.now()) return;
    this.active = true;
    this.update({
      busy: true,
      message: '',
    });
    try {
      {
        const journal = await this.deps.storage.read();
        this.update({
          journal,
        });
        if (journal) this.journals.set(journal.id, journal);
      }
      await this.refreshCredential();
      this.update({
        pictures: await this.deps.storage.pictures(),
      });
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
  setup = async (kind: CredentialKind, value: string) => {
    if (
      !this.state.authorized ||
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
      if (!this.state.authorized || proof !== this.authorization || this.disposed) return;
      const verified = kind === 'managed' ? reply.accessCode : value;
      if (!validCredential(verified)) throw new Error('Invalid credential');
      await this.deps.vault.write(kind, verified);
      await this.refreshCredential();
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
  removeCredential = async (kind: CredentialKind) => {
    if (!this.state.authorized || this.active || this.unresolved()) return;
    this.active = true;
    this.credential = null;
    this.update({
      busy: true,
      credential: 'unavailable',
    });
    try {
      await this.deps.vault.remove(kind);
      await this.refreshCredential();
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
  getState = () => this.state;
  hasHeldResult = () => this.heldBytes !== null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  close = () => {
    this.authorization += 1;
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
  refresh = this.load;
  dispose = () => {
    this.disposed = true;
    this.gate.dismiss();
    this.listeners.clear();
    if (this.timer) clearTimeout(this.timer);
  };
}
