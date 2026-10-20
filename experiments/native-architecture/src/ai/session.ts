import { createFeedbackGate } from '../feedback/feedbackGate';
import {
  AI_STYLES,
  isInstallationId,
  type AiStyle,
  type AiMime,
  type CredentialKind,
} from './contract';
import { credentialHeaders, maskSecret, validCredential, type AiCredential } from './credentials';
import { AI_THROTTLED_MESSAGE, requestAi } from './transport';
import { credentialRefusal, type AiCredentialOutcome } from './credentialResult';
import type { AiJournal } from './journal';
import { createAiReportOwner } from './reportOwner';
import type { AiProblemReport } from './problemReport';
import type { AiReportTarget } from './reportContract';
import type { AiState, PreparedAiDrawing, AiSessionDependencies } from './sessionContract';
import { AI_FLOW_IDLE, aiJournalWaiting } from './uiState';
import { requestPersistentStorage } from '../platform/persistentStorage';
export type { AiState, PreparedAiDrawing } from './sessionContract';
export class AiSession {
  protected deps: AiSessionDependencies;
  constructor(deps: AiSessionDependencies) {
    this.deps = deps;
    this.reports = createAiReportOwner({
      vault: deps.vault,
      parent: deps.parent,
      transport: deps.transport,
      admit: deps.admit,
      publish: (report) => this.update({ report }),
      current: (target) =>
        !this.disposed &&
        this.state.open &&
        this.state.authorized &&
        !this.state.gate.open &&
        (target.kind === 'picture'
          ? [this.state.heldResult, this.state.journal?.result, ...this.state.pictures].some(
              (result) => result?.uri === target.uri
            )
          : this.state.refusal?.id === target.id &&
            ((this.state.journal?.id === target.id && this.state.journal.result === null) ||
              (!this.recoveryUncertain &&
                this.state.recovery?.kind === 'recovery-request' &&
                this.state.recovery.journal.id === target.id &&
                this.state.recovery.journal.result === null &&
                this.state.recovery.recovery.state === 'terminal' &&
                this.state.recovery.recovery.outcome === 'refusal'))),
    });
  }
  protected reports: ReturnType<typeof createAiReportOwner>;
  protected problems: AiProblemReport | null = null;
  protected listeners = new Set<() => void>();
  protected disposed = false;
  protected recoveryUncertain = false;
  protected timer: ReturnType<typeof setTimeout> | null = null;
  protected journals = new Map<number, AiJournal>();
  protected credential: AiCredential | null = null;
  protected active = false;
  protected pollStarted = 0;
  protected authorization = 0;
  private consentEpoch = -1;
  protected consented = () => {
    const consent = this.deps.parent?.consent();
    return !this.disposed && (!consent || (consent.enabled && consent.epoch === this.consentEpoch));
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
    ...AI_FLOW_IDLE,
    open: false,
    minimized: false,
    authorized: false,
    gate: this.gate.getState(),
    style: AI_STYLES[0],
    busy: false,
    remaining: null,
    credential: 'unavailable',
    saved: null,
    checking: false,
    credentialResult: null,
    journal: null,
    recovery: null,
    heldResult: null,
    pictures: [],
    message: '',
    retryAt: 0,
    report: { phase: 'idle' },
    refusal: null,
    submitted: null,
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
  // The AI-on span in which an authoritative answer (a grant, a creation's count, a used-up refusal)
  // said no free creations are left. Turning AI off or on starts a new span, after which the grant
  // is read again, as shipping's is.
  protected usedUpSpan: number | null = null;
  protected aiSpan = () => this.deps.parent?.consent().aiSpan ?? null;
  // Records a free count an authoritative answer gave, in the span its request started in.
  protected noteRemaining = (remaining: number, span: number | null) => {
    this.usedUpSpan = remaining === 0 ? span : null;
  };
  protected persist = (journal: AiJournal) => {
    const work = this.writing
      .catch(() => {})
      .then(async () => {
        try {
          if (this.journals.get(journal.id)?.phase === 'result' && journal.phase !== 'result')
            return;
          const receipt = await this.deps.storage.write(journal);
          this.journals.set(journal.id, receipt.journal);
          this.update({ journal: receipt.journal });
        } finally {
          if (!this.state.open) await this.release(journal.id);
        }
      });
    this.writing = work;
    return work;
  };
  // Shipping keeps no AI picture once its card is closed, so storage holds a run only while it is
  // in progress or on screen. Storage judges whether the run has finished from its own record, which
  // a retained picture whose journal write failed has reached ahead of this session's journal. A
  // release that fails leaves the record for the next run to replace, and rereads storage so that
  // run is not refused as unconfirmed.
  private release = async (id: number) => {
    try {
      await this.deps.storage.release(id);
    } catch {
      await this.deps.storage.read().catch(() => null);
    }
  };
  private releaseClosed = () => {
    const id = this.state.journal?.id;
    if (id !== undefined) this.writing = this.writing.catch(() => {}).then(() => this.release(id));
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
    // The allowance inspect() or a send already read this session stands: a tap reads the saved
    // credential, never the grant a second time.
    const known =
      this.state.credential === 'free' && this.state.availability === 'ready'
        ? this.state.remaining
        : null;
    this.credential = null;
    this.update({
      credential: 'unavailable',
      ...(known === null ? { remaining: null, availability: 'loading' } : {}),
    });
    const { byok, managed } = await this.readSaved(permitted);
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
      ...(this.credential.kind === 'free' ? {} : { availability: 'ready' }),
    });
    if (this.credential.kind === 'free' && known !== null)
      this.update({ remaining: known, availability: 'ready' });
    else if (this.credential.kind === 'free') {
      const span = this.aiSpan();
      const reply = await this.grantRequest(this.credential.installationId);
      if (!permitted()) return;
      if (reply.kind === 'grant') {
        this.noteRemaining(reply.remaining, span);
        this.update({ remaining: reply.remaining, availability: 'ready' });
      } else
        this.update({
          availability: 'unavailable',
          message:
            reply.kind === 'failure' || reply.kind === 'unknown'
              ? reply.message
              : 'Free allowance unavailable.',
          retryAt: reply.kind === 'failure' ? (reply.retryAt ?? 0) : 0,
        });
    }
  };
  // Both saved credentials, validated, and what Settings shows of the one in use: a key wins over
  // an access code, as the request headers choose.
  private readSaved = async (permitted: () => boolean) => {
    const byok = await this.deps.vault.read('byok');
    if (!permitted()) throw new Error('AI authorization changed.');
    const managed = await this.deps.vault.read('managed');
    if (!permitted()) throw new Error('AI authorization changed.');
    if (
      (byok !== null && !validCredential(byok)) ||
      (managed !== null && !validCredential(managed))
    )
      throw new Error('Saved AI credentials could not be read safely.');
    this.update({ saved: byok ? maskSecret(byok) : managed });
    return { byok, managed };
  };
  private grantRequest = (installationId: string) =>
    requestAi(
      this.deps.transport,
      {
        path: '/api/free-generation-grant',
        method: 'GET',
        headers: credentialHeaders({ kind: 'free', installationId }),
      },
      () => {}
    );
  // Settings › AI Art's read of which credential is saved and, while AI is on with none, of the free
  // allowance. Neither sends a drawing, so neither waits for the generation check; both wait out a
  // generation or credential change in flight, whose vault lease a read would end.
  inspect = async () => {
    if (this.disposed || this.active || this.unresolved()) return;
    this.active = true;
    this.update({
      busy: true,
      checking: true,
      ...(this.state.availability === 'ready' ? {} : { availability: 'loading' }),
    });
    try {
      await this.readStatus(() => !this.disposed);
    } catch {
      this.update({
        credential: 'unavailable',
        saved: null,
        remaining: null,
        availability: 'unavailable',
      });
    } finally {
      this.active = false;
      this.update({ busy: false, checking: false });
    }
  };
  private readStatus = async (current: () => boolean) => {
    const { byok, managed } = await this.readSaved(current);
    if (byok || managed) {
      this.update({
        credential: byok ? 'byok' : 'managed',
        remaining: null,
        availability: 'ready',
      });
      return;
    }
    // The server's used-up answer stands while AI stays on, as shipping keeps a grant it knows: a
    // later Settings read asks the grant endpoint nothing, so AI Art and the drawer keep saying the
    // free creations are used up (#3024).
    const usedUp =
      this.state.credential === 'free' &&
      this.state.availability === 'ready' &&
      this.state.remaining === 0 &&
      this.usedUpSpan !== null &&
      this.usedUpSpan === this.aiSpan();
    this.update({ credential: 'free' });
    if (!this.deps.parent?.consent().enabled || usedUp) return;
    this.update({ remaining: null });
    const span = this.aiSpan();
    const id = await this.deps.vault.installationId();
    if (!current() || !isInstallationId(id)) return;
    const reply = await this.grantRequest(id);
    if (!current()) return;
    if (reply.kind === 'grant') {
      this.noteRemaining(reply.remaining, span);
      this.update({ remaining: reply.remaining, availability: 'ready' });
    } else this.update({ availability: 'unavailable' });
  };
  // Saving or forgetting a credential is the parent's own act in Settings › AI Art, as in shipping,
  // so it waits for no grown-up check: only for AI to be on. Turning AI off, a Parent Center change
  // or leaving the app ends it. Without a parent port the sheet's own check still stands.
  private credentialChange = () => {
    const parent = this.deps.parent;
    if (!parent) {
      const proof = this.authorization;
      return this.state.authorized
        ? () => this.state.authorized && proof === this.authorization && !this.disposed
        : null;
    }
    const { enabled, epoch } = parent.consent();
    if (!enabled) return null;
    return () => !this.disposed && parent.consent().enabled && parent.consent().epoch === epoch;
  };
  private resultCount = 0;
  private report = (result: AiCredentialOutcome) => {
    this.resultCount += 1;
    this.update({ credentialResult: { id: this.resultCount, ...result } });
  };
  protected load = async () => {
    if (!this.consented() || this.active || this.state.retryAt > Date.now()) return;
    this.active = true;
    this.update({
      busy: true,
      message: '',
    });
    try {
      await this.refreshCredential();
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
  // The drawing the current run sent, which Try again sends again as shipping's retry does, rather
  // than the canvas as it is by then. A picture that arrives, or a closed card, ends the run.
  protected runDrawing: PreparedAiDrawing | null = null;
  protected heldBytes: {
    id: number;
    bytes: Uint8Array;
    mime: AiMime;
  } | null = null;
  setup = async (kind: CredentialKind, value: string) => {
    const current = this.credentialChange();
    if (!current || this.active || this.unresolved()) return;
    if (this.state.retryAt > Date.now()) {
      this.report({ kind, outcome: 'throttled', detail: AI_THROTTLED_MESSAGE });
      return;
    }
    if (!validCredential(value)) {
      this.report({ kind, outcome: 'invalid', detail: null });
      return;
    }
    this.active = true;
    this.update({ busy: true });
    try {
      const reply = await requestAi(
        this.deps.transport,
        {
          path: kind === 'byok' ? '/api/verify-key' : '/api/verify-access-code',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kind === 'byok' ? { apiKey: value } : { code: value }),
        },
        () => {}
      );
      if (!current()) return;
      if (reply.kind !== 'verified') {
        this.update({ retryAt: reply.kind === 'failure' ? (reply.retryAt ?? 0) : 0 });
        this.report(credentialRefusal(kind, reply));
        return;
      }
      const verified = kind === 'managed' ? reply.accessCode : value;
      if (!validCredential(verified)) throw new Error('Invalid credential');
      this.credential = null;
      await this.deps.vault.write(kind, verified);
      if (!current()) return;
      // Only after a parent's explicit save that still owns the session, as shipping asks: an
      // abandoned save and an invite link's capture are not the parent's opt-in (ADR-0127/0128).
      void requestPersistentStorage();
      await this.readStatus(current);
      this.report({ kind, outcome: 'accepted' });
    } catch {
      this.credential = null;
      this.update({ credential: 'unavailable', saved: null });
      this.report({ kind, outcome: 'saveFailed' });
    } finally {
      this.active = false;
      this.update({ busy: false });
    }
  };
  removeCredential = async (kind: CredentialKind) => {
    const current = this.credentialChange();
    if (!current || this.active || this.unresolved()) return;
    this.active = true;
    this.credential = null;
    this.update({ busy: true, credential: 'unavailable' });
    try {
      await this.deps.vault.remove(kind);
      if (!current()) return;
      await this.readStatus(current);
      this.report({ kind, outcome: 'forgotten' });
    } catch {
      this.update({ saved: null });
      this.report({ kind, outcome: 'forgetFailed' });
    } finally {
      this.active = false;
      this.update({ busy: false });
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
    this.reports.cancel();
    this.problems?.reset();
    this.authorization += 1;
    this.deps.parent?.cancel('ai');
    this.gate.dismiss();
    this.runDrawing = null;
    this.update({
      open: false,
      minimized: false,
      authorized: false,
      view: 'prompt',
      attempt: null,
      failures: 0,
      failure: null,
    });
    this.releaseClosed();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  };
  minimize = () => {
    if (!this.state.open || !aiJournalWaiting(this.state)) return;
    this.reports.cancel();
    this.update({ minimized: true });
  };
  restore = () => {
    if (this.state.open && this.state.minimized) this.update({ minimized: false });
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
    this.deps.parent?.cancel('ai');
    this.disposed = true;
    this.gate.dismiss();
    this.listeners.clear();
    if (this.timer) clearTimeout(this.timer);
  };
  reportPicture = (uri: string) => this.reports.request(uri);
  reportRefusal = (id: number) => this.reports.requestRefusal(id);
  reviewAiReport = (target: AiReportTarget) => this.reports.review(target);
  sendPictureReport = () => this.reports.send();
  cancelPictureReport = () => this.reports.cancel();
}
