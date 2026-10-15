import { POLL_INTERVAL_MS, JOB_TTL_MS, POLL_TIMEOUT_MS } from './contract';
import {
  AI_POLL_TIMEOUT_MESSAGE,
  AI_POLL_TIMEOUT_STATUS,
  AI_REQUEST_FAILED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
} from '../../../../web/src/lib/ai/generationFailures';
import { credentialHeaders } from './credentials';
import { requestAi, type AiReply } from './transport';
import type { AiJournal, AiResult } from './journal';
import type { AiFailureDetails } from './sessionContract';
import { AiRecoverySession } from './recoverySession';
import { bytesBase64 } from './base64';
export class NativeAiController extends AiRecoverySession {
  // Where a run goes when only a grown-up's setup can fix it; the flow sends it to Settings.
  protected needsSetup = () => {};
  // Whether this run carries a style. With style choice off, shipping sends none and the server
  // uses its base prompt; the journal still records the last style for its own format.
  protected styled = true;
  private collectImage = async (
    journal: AiJournal,
    reply: Extract<
      AiReply,
      {
        kind: 'image';
      }
    >
  ) => {
    const id = journal.id;
    let result: AiResult;
    try {
      result = (await this.deps.storage.retain(id, reply.bytes, reply.mime)).picture;
    } catch {
      result = {
        uri: `data:${reply.mime};base64,${bytesBase64(reply.bytes)}`,
        mime: reply.mime,
      };
      this.reports.complete(id, reply.bytes, reply.mime, reply.reportToken, result.uri);
      this.update({
        heldResult: result,
        message: 'Your AI picture is held in memory. Keep this app open and retry saving it.',
      });
      this.heldBytes = {
        id,
        bytes: reply.bytes,
        mime: reply.mime,
      };
      return;
    }
    this.reports.complete(id, reply.bytes, reply.mime, reply.reportToken, result.uri);
    this.update({
      heldResult: result,
      pictures: [...this.state.pictures.filter((picture) => picture.uri !== result.uri), result],
    });
    try {
      await this.persist({
        ...journal,
        phase: 'result',
        result,
      });
      this.update({
        message: 'Your AI picture and original drawing are saved on this device.',
      });
    } catch {
      this.update({
        message:
          'The picture file is saved, but recovery could not be recorded. Keep this app open and retry saving it.',
      });
      this.heldBytes = {
        id,
        bytes: reply.bytes,
        mime: reply.mime,
      };
    }
  };
  protected schedule = (delay: number) => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.consented() && this.state.open && this.state.journal?.jobId && this.unresolved())
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.poll();
      }, delay);
  };
  private settle = async (id: number, reply: AiReply, poll: boolean) => {
    const journal =
      this.journals.get(id) ?? (this.state.journal?.id === id ? this.state.journal : null);
    if (!journal || (journal.phase === 'result' && reply.kind !== 'image')) return;
    if (reply.kind === 'image') {
      if (reply.remaining !== null) this.update({ remaining: reply.remaining });
      try {
        await this.deps.admit(reply.bytes, reply.mime);
      } catch {
        if (this.state.journal?.id === id)
          await this.persist({ ...journal, phase: 'failed', result: null });
        this.update({
          failures: this.state.failures + 1,
          failure: {
            status: null,
            endpoint: poll ? '/api/generation-result' : '/api/generate-image',
            message: 'The picture that came back could not be opened.',
          },
          message:
            'This AI picture could not be safely opened. Your original drawing is saved. A generation will not be retried automatically.',
        });
        return;
      }
    }
    // Shipping delivers only into the run that owns the card; a superseded run's reply is dropped.
    if (this.state.journal?.id !== id) return;
    if (reply.kind === 'image') {
      this.runDrawing = null;
      this.update({ refusal: null, failures: 0 });
      await this.collectImage(journal, reply);
    } else if (reply.kind === 'ticket') {
      try {
        await this.persist({
          ...journal,
          phase: 'pending',
          jobId: reply.jobId,
        });
      } catch {
        this.update({
          journal: {
            ...journal,
            phase: 'pending',
            jobId: reply.jobId,
          },
          message: 'Keep this app open. The waiting ticket could not be saved yet.',
        });
      }
      this.pollStarted = Date.now();
      this.schedule(reply.pollAfterMs);
    } else if (reply.kind === 'pending' || (reply.kind === 'unknown' && poll)) {
      // One poll that went unanswered is a job probably still running: keep waiting, as shipping's
      // poll does, until its deadline.
      this.update({
        message: reply.kind === 'unknown' ? reply.message : 'Your picture is still on its way.',
      });
      this.schedule(reply.kind === 'pending' ? reply.delayMs : POLL_INTERVAL_MS);
    } else if (reply.kind === 'failure') {
      await this.settleFailure(journal, reply, poll);
    } else if (reply.kind === 'unknown') {
      await this.failRun(journal, {
        status: null,
        endpoint: '/api/generate-image',
        message: reply.cause === 'timeout' ? AI_TIMEOUT_MESSAGE : AI_REQUEST_FAILED_MESSAGE,
      });
      this.update({ message: reply.message });
    }
  };
  // A run that failed in a way the same drawing may fix: the error card offers Try again until
  // shipping's repeated-failure limit.
  private failRun = async (journal: AiJournal, failure: AiFailureDetails) => {
    this.update({ failures: this.state.failures + 1, failure });
    await this.persist({ ...journal, phase: 'failed' });
  };
  private settleFailure = async (
    journal: AiJournal,
    reply: Extract<AiReply, { kind: 'failure' }>,
    poll: boolean
  ) => {
    if (reply.reason === 'safety') {
      this.reports.refuse(journal.id, reply.reportToken);
      this.update({ refusal: { id: journal.id }, message: reply.message, failures: 0 });
      await this.persist({ ...journal, phase: 'failed' });
    } else
      await this.failRun(journal, {
        status: reply.status ?? null,
        endpoint: poll ? '/api/generation-result' : '/api/generate-image',
        message: reply.detail ?? reply.message,
      });
    this.update({
      message: reply.message,
      ...(reply.reason === 'exhausted'
        ? { remaining: 0 }
        : reply.reason === 'unavailable' && this.credential?.kind === 'free'
          ? { remaining: null, availability: 'unavailable' }
          : {}),
    });
    // A free allowance that is used up or unavailable is not a failure a retry can fix:
    // shipping closes the card and opens the AI settings, where a grown-up can add a key.
    if (
      reply.reason === 'exhausted' ||
      (reply.reason === 'unavailable' && this.credential?.kind === 'free')
    )
      this.needsSetup();
  };
  private currentGenerationPermission = (proof: number) =>
    this.state.authorized && this.consented() && proof === this.authorization && !this.disposed;
  // Resolves whether the run started: a refused start has nothing for the result card to show.
  protected generateAuthorized = async (again = false): Promise<boolean> => {
    if (
      !this.state.authorized ||
      !this.consented() ||
      this.active ||
      this.unresolved() ||
      this.state.retryAt > Date.now() ||
      !this.credential ||
      (this.credential.kind === 'free' &&
        (this.state.remaining === null || this.state.remaining === 0))
    )
      return false;
    const proof = this.authorization;
    const credential = this.credential;
    this.active = true;
    this.update({
      busy: true,
      message: 'Saving your original drawing…',
      heldResult: null,
      refusal: null,
      failure: null,
    });
    let uploadStarted = false;
    try {
      const prepared = (again && this.runDrawing) || (await this.deps.prepare());
      this.runDrawing = prepared;
      if (!this.currentGenerationPermission(proof)) return true;
      const id = Math.max(Date.now(), (this.state.journal?.id ?? 0) + 1);
      const journal: AiJournal = {
        version: 1,
        id,
        createdAt: Date.now(),
        style: this.state.style,
        originalId: prepared.originalId,
        phase: 'sent',
        jobId: null,
        result: null,
      };
      const receipt = await this.persistPrepared(journal, prepared);
      this.update({
        submitted: { id, uri: `data:image/png;base64,${bytesBase64(prepared.bytes)}` },
        ...(this.state.attempt?.kind === 'starting' ? { attempt: { kind: 'journal', id } } : {}),
      });
      if (!this.currentGenerationPermission(proof)) {
        await this.persist({ ...receipt.journal, phase: 'failed' });
        return true;
      }
      const upload = await this.deps.storage.readPreparedUpload(receipt);
      if (!this.currentGenerationPermission(proof)) {
        await this.persist({
          ...receipt.journal,
          phase: 'failed',
        });
        return true;
      }
      this.update({
        message: 'Making your AI picture…',
      });
      if (!this.currentGenerationPermission(proof)) {
        await this.persist({ ...receipt.journal, phase: 'failed' });
        return true;
      }
      const style = this.styled ? receipt.journal.style : null;
      await this.reports.prepare(id, upload, style, credential);
      if (!this.currentGenerationPermission(proof)) return true;
      uploadStarted = true;
      const reply = await requestAi(
        this.deps.transport,
        {
          path: '/api/generate-image',
          ...(style ? { query: `style=${encodeURIComponent(style)}` } : {}),
          method: 'POST',
          headers: {
            ...credentialHeaders(credential),
            'Content-Type': 'image/png',
            'X-Async-Generation': '1',
          },
          body: upload,
        },
        () => {}
      );
      await this.settle(id, reply, false);
    } catch {
      this.update({
        failures: this.state.failures + 1,
        failure: {
          status: null,
          endpoint: '/api/generate-image',
          message: uploadStarted
            ? 'The request did not finish.'
            : 'The drawing could not be saved before sending.',
        },
        ...(this.state.attempt?.kind === 'starting' ? { attempt: { kind: 'stopped' } } : {}),
        message: uploadStarted
          ? 'That did not finish. Your original drawing is still here. A sent generation will not be retried automatically.'
          : 'AI storage did not confirm the save. Nothing was sent. Your drawing is still here.',
      });
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
    return true;
  };
  // Settings reads the saved credential for display only. A send without a credential this
  // session has loaded loads it, with any held journal or recovery, under the send's own check.
  protected loadThenGenerate = async (again = false) => {
    if (!this.state.authorized) return false;
    if (!this.credential) await this.load();
    return this.generateAuthorized(again);
  };
  generate = async () => {
    if (!this.deps.parent) return this.loadThenGenerate();
    if (this.active || this.unresolved()) return;
    this.protect(() => {
      void this.loadThenGenerate();
    });
  };
  private poll = async () => {
    const journal = this.state.journal;
    if (
      !this.consented() ||
      this.active ||
      !journal?.jobId ||
      !this.credential ||
      !this.unresolved()
    )
      return;
    if (Date.now() - journal.createdAt >= JOB_TTL_MS) {
      await this.releaseHeld(journal);
      return;
    }
    if (Date.now() - this.pollStarted >= POLL_TIMEOUT_MS) {
      await this.failRun(journal, {
        status: AI_POLL_TIMEOUT_STATUS,
        endpoint: '/api/generation-result',
        message: AI_POLL_TIMEOUT_MESSAGE,
      });
      return;
    }
    this.active = true;
    this.update({
      busy: true,
    });
    try {
      const reply = await requestAi(
        this.deps.transport,
        {
          path: '/api/generation-result',
          query: `job=${journal.jobId}`,
          method: 'GET',
          headers: credentialHeaders(this.credential),
        },
        (late) => this.settle(journal.id, late, true)
      );
      await this.settle(journal.id, reply, true);
    } catch {
      this.update({
        message: 'Recovery could not be saved. Keep this app open and check again.',
      });
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
  open = () => {
    if (this.state.minimized) {
      this.restore();
      return;
    }
    if (this.deps.parent) {
      if (!this.deps.parent.consent().enabled) return;
      this.authorization += 1;
      this.update({
        open: true,
        authorized: true,
        message: 'Choose Check AI allowance before sending. Nothing is sent by opening this panel.',
      });
      return;
    }
    this.authorization += 1;
    this.update({
      open: true,
      authorized: false,
    });
    const release = () => {
      this.update({
        authorized: true,
      });
      void this.load().then(() => {
        this.pollStarted = Date.now();
        this.schedule(0);
      });
    };
    if (this.deps.parent) this.protect(release);
    else this.gate.request(release);
  };
  releaseExpired = () => {
    const journal = this.state.journal;
    if (!journal || this.active) return;
    if (Date.now() - journal.createdAt < JOB_TTL_MS) {
      this.update({
        message:
          'This attempt stays held until 20 minutes after it was sent. You can keep drawing while it waits.',
      });
      return;
    }
    const release = () => {
      void this.releaseHeld(journal);
    };
    if (this.deps.parent) this.protect(release);
    else this.gate.request(release);
  };
  protected releaseHeld = async (journal: AiJournal) => {
    this.active = true;
    this.update({ busy: true });
    try {
      await this.persist({ ...journal, phase: 'failed' });
      this.update({
        message:
          'The expired attempt remains in local recovery history. You can explicitly send a new picture.',
      });
    } catch {
      this.update({ message: 'Recovery history could not be saved. The attempt stays held.' });
    } finally {
      this.active = false;
      this.update({ busy: false });
    }
  };
  resume = () => {
    if (!this.state.authorized) return;
    this.protect(() => {
      this.pollStarted = Date.now();
      void this.poll();
    });
  };
  retryRetention = async () => {
    if (!this.heldBytes || this.active) return;
    const held = this.heldBytes;
    this.active = true;
    try {
      await this.deps.storage.read();
      await this.settle(
        held.id,
        {
          kind: 'image',
          ...held,
          remaining: null,
          reportToken: null,
        },
        false
      );
      if (this.state.journal?.phase === 'result') this.heldBytes = null;
    } catch {
      this.update({
        message: 'Saving could not be confirmed. Reopen AI picture and try saving again.',
      });
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
}
