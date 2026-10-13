import { POLL_INTERVAL_MS, JOB_TTL_MS, POLL_TIMEOUT_MS } from './contract';
import { credentialHeaders } from './credentials';
import { requestAi, type AiReply } from './transport';
import type { AiJournal, AiResult } from './journal';
import type { AiSession } from './session';
import { AiRecoverySession } from './recoverySession';
export type { AiState, PreparedAiDrawing } from './session';
import { bytesBase64 } from './base64';
class NativeAiController extends AiRecoverySession {
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
  private schedule = (delay: number) => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.disposed && this.state.open && this.state.journal?.jobId && this.unresolved())
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
          message:
            'This AI picture could not be safely opened. Your original drawing is saved. A generation will not be retried automatically.',
        });
        return;
      }
    }
    if (this.state.journal?.id !== id) {
      if (reply.kind === 'image') {
        let result: AiResult;
        try {
          result = (await this.deps.storage.retain(id, reply.bytes, reply.mime)).picture;
        } catch {
          this.heldBytes = {
            id,
            bytes: reply.bytes,
            mime: reply.mime,
          };
          this.update({
            heldResult: {
              uri: `data:${reply.mime};base64,${bytesBase64(reply.bytes)}`,
              mime: reply.mime,
            },
            message:
              'An earlier AI picture arrived but could not be saved. Keep this app open and retry saving it.',
          });
          return;
        }
        this.heldBytes = null;
        this.update({
          pictures: [
            ...this.state.pictures.filter((picture) => picture.uri !== result.uri),
            result,
          ],
          message: 'An earlier AI picture arrived and was saved separately.',
        });
      }
      return;
    }
    if (reply.kind === 'image') {
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
      if (reply.kind === 'unknown') this.ambiguous.add(id);
      this.update({
        message: reply.kind === 'unknown' ? reply.message : 'Your picture is still on its way.',
      });
      this.schedule(reply.kind === 'pending' ? reply.delayMs : POLL_INTERVAL_MS);
    } else if (reply.kind === 'failure') {
      if (reply.reason === 'expired' && this.ambiguous.has(id)) {
        this.update({
          message:
            'A previous reply is still uncertain. Keep this app open; the attempt stays held until its server retention window ends.',
        });
        return;
      }
      await this.persist({
        ...journal,
        phase: 'failed',
      });
      this.update({
        message: reply.message,
        retryAt: reply.retryAt ?? 0,
        ...(reply.reason === 'exhausted'
          ? { remaining: 0 }
          : reply.reason === 'unavailable' && this.credential?.kind === 'free'
            ? { remaining: null }
            : {}),
      });
    } else if (reply.kind === 'unknown') {
      this.ambiguous.add(id);
      await this.persist({
        ...journal,
        phase: 'unknown',
      });
      this.update({
        message: reply.message,
      });
    }
  };
  generate = async () => {
    if (
      !this.state.authorized ||
      this.active ||
      this.unresolved() ||
      this.state.retryAt > Date.now() ||
      !this.credential ||
      (this.credential.kind === 'free' &&
        (this.state.remaining === null || this.state.remaining === 0))
    )
      return;
    const proof = this.authorization;
    this.active = true;
    this.update({
      busy: true,
      message: 'Saving your original drawing…',
      heldResult: null,
    });
    let uploadStarted = false;
    try {
      const prepared = await this.deps.prepare();
      if (!this.state.authorized || proof !== this.authorization || this.disposed) return;
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
      const upload = await this.deps.storage.readPreparedUpload(receipt);
      if (!this.state.authorized || proof !== this.authorization || this.disposed) {
        await this.persist({
          ...journal,
          phase: 'failed',
        });
        return;
      }
      this.update({
        message: 'Making your AI picture…',
      });
      uploadStarted = true;
      const reply = await requestAi(
        this.deps.transport,
        {
          path: '/api/generate-image',
          query: `style=${encodeURIComponent(journal.style)}`,
          method: 'POST',
          headers: {
            ...credentialHeaders(this.credential),
            'Content-Type': 'image/png',
            'X-Async-Generation': '1',
          },
          body: upload,
        },
        (late) => this.settle(id, late, false)
      );
      await this.settle(id, reply, false);
    } catch {
      this.update({
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
  };
  private poll = async () => {
    const journal = this.state.journal;
    if (this.active || !journal?.jobId || !this.credential || !this.unresolved()) return;
    if (Date.now() - journal.createdAt >= JOB_TTL_MS) {
      this.update({
        message: 'The server retention window has ended. Your saved original is still here.',
      });
      return;
    }
    if (Date.now() - this.pollStarted >= POLL_TIMEOUT_MS) {
      this.update({
        message:
          'This picture is taking longer. Open this panel again to keep checking before its 20-minute expiry.',
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
    this.authorization += 1;
    this.update({
      open: true,
      authorized: false,
    });
    this.gate.request(() => {
      this.update({
        authorized: true,
      });
      void this.load().then(() => {
        this.pollStarted = Date.now();
        this.schedule(0);
      });
    });
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
    this.gate.request(() => {
      this.active = true;
      this.update({ busy: true });
      void this.persist({
        ...journal,
        phase: 'failed',
      })
        .then(() =>
          this.update({
            message:
              'The expired attempt remains in local recovery history. You can explicitly send a new picture.',
          })
        )
        .catch(() =>
          this.update({
            message: 'Recovery history could not be saved. The attempt stays held.',
          })
        )
        .finally(() => {
          this.active = false;
          this.update({ busy: false });
        });
    });
  };
  resume = () => {
    if (!this.state.authorized) return;
    this.pollStarted = Date.now();
    void this.poll();
  };
  retryRetention = async () => {
    if (!this.heldBytes || this.active) return;
    const held = this.heldBytes;
    this.active = true;
    try {
      await this.settle(
        held.id,
        {
          kind: 'image',
          ...held,
          remaining: null,
        },
        false
      );
      if (this.state.journal?.phase === 'result') this.heldBytes = null;
    } finally {
      this.active = false;
      this.update({
        busy: false,
      });
    }
  };
}
export function createNativeAi(deps: ConstructorParameters<typeof AiSession>[0]) {
  return new NativeAiController(deps);
}
export type NativeAiOwner = ReturnType<typeof createNativeAi>;
