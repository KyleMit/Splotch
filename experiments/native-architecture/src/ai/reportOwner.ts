import { bytesBase64 } from './base64';
import { credentialHeaders, type AiCredential, type AiReferencedVault } from './credentials';
import type { AiMime, AiStyle } from './contract';
import type { AiImageAdmission } from './imageAdmission';
import type { AiTransport } from './transport';
import type { ParentOperationPort, ParentProof } from '../parentCenter/parentPolicy';
import {
  AI_REPORT_TIMEOUT_MS,
  MAX_AI_REPORT_BYTES,
  reportMultipart,
  type AiReportContext,
  type AiReportState,
} from './reportContract';
import { sendAiReport, reportWait } from './reportTransport';

const AI_REPORT_PREPARE_TIMEOUT_MS = 2000;
type ReportDependencies = {
  vault: AiReferencedVault;
  parent?: ParentOperationPort;
  transport: AiTransport;
  admit: AiImageAdmission;
  current: (uri: string) => boolean;
  publish: (state: AiReportState) => void;
};
class AiReportOwner {
  private deps: ReportDependencies;
  private contexts = new Map<number, AiReportContext>();
  private epoch = 0;
  private selected: AiReportContext | null = null;
  private uri = '';
  private proof: ParentProof | null = null;
  private consentEpoch = -1;
  private controller: AbortController | null = null;
  private retryAt = 0;
  constructor(deps: ReportDependencies) {
    this.deps = deps;
  }
  private current = () =>
    !!this.selected &&
    this.deps.current(this.uri) &&
    !!this.proof?.valid() &&
    !!this.deps.parent?.consent().enabled &&
    this.deps.parent.consent().epoch === this.consentEpoch;
  cancel = () => {
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
    this.selected = null;
    this.proof = null;
    this.deps.parent?.cancel('imageReport');
    this.deps.publish({ phase: 'idle' });
  };
  dispose = () => {
    this.cancel();
    this.contexts.clear();
  };
  private preview = (context: AiReportContext) => {
    if (!context.result) throw new Error('AI reporting context is unavailable.');
    return {
      uri: this.uri,
      drawing: `data:image/png;base64,${bytesBase64(context.drawing)}`,
      output: `data:${context.result.mime};base64,${bytesBase64(context.result.bytes)}`,
      style: context.style,
    };
  };
  prepare = async (id: number, drawing: Uint8Array, style: AiStyle, credential: AiCredential) => {
    const ticket = this.epoch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_REPORT_PREPARE_TIMEOUT_MS);
    try {
      if (!drawing.length || drawing.length > MAX_AI_REPORT_BYTES) return;
      await reportWait(this.deps.admit(drawing, 'image/png'), controller.signal);
      const reference = await reportWait(this.deps.vault.pin(credential.kind), controller.signal);
      const confirmed = await reportWait(
        this.deps.vault.readReferenced(reference),
        controller.signal
      );
      if (
        ticket !== this.epoch ||
        controller.signal.aborted ||
        JSON.stringify(credentialHeaders(confirmed)) !==
          JSON.stringify(credentialHeaders(credential))
      )
        return;
      this.contexts.clear();
      this.contexts.set(id, {
        id,
        drawing: drawing.slice(),
        style,
        credential: reference,
        installationId: credential.kind === 'free' ? credential.installationId : null,
        result: null,
        used: false,
      });
    } catch {
      /* Optional report preparation cannot prevent generation. */
    } finally {
      clearTimeout(timer);
    }
  };
  complete = (
    id: number,
    bytes: Uint8Array,
    mime: AiMime,
    token: string | null,
    resultUri: string
  ) => {
    const context = this.contexts.get(id);
    if (!context || context.drawing.length + bytes.length > MAX_AI_REPORT_BYTES) return;
    if (context.result) {
      if (
        context.result.mime !== mime ||
        context.result.bytes.length !== bytes.length ||
        !bytes.every((value, index) => value === context.result?.bytes[index])
      )
        return;
      context.result.uris.add(resultUri);
    } else context.result = { bytes: bytes.slice(), mime, token, uris: new Set([resultUri]) };
  };
  request = (resultUri: string) => {
    if (this.controller) return;
    if (Date.now() < this.retryAt) {
      this.deps.publish({
        phase: 'error',
        uri: resultUri,
        retryAt: this.retryAt,
        message: 'Please wait before reviewing this report again.',
      });
      return;
    }
    this.cancel();
    this.uri = resultUri;
    const context = [...this.contexts.values()].find((value) => value.result?.uris.has(this.uri));
    if (
      !context ||
      context.used ||
      !this.deps.parent ||
      !this.deps.current(this.uri) ||
      (context.credential.kind === 'free' && !context.result?.token)
    ) {
      this.deps.publish({
        phase: 'unavailable',
        uri: this.uri,
        retryAt: 0,
        message:
          'Reporting requires the original drawing, credential reference and report proof from this app session. Older pictures and refusals cannot be reported here.',
      });
      return;
    }
    this.selected = context;
    const ticket = this.epoch;
    this.deps.publish({ phase: 'gating', uri: this.uri });
    const requested = this.deps.parent.request('imageReport', (nextProof) => {
      if (this.epoch !== ticket || !this.deps.current(this.uri) || !nextProof.valid()) return;
      this.proof = nextProof;
      this.consentEpoch = this.deps.parent?.consent().epoch ?? -1;
      if (this.current()) this.deps.publish({ phase: 'confirm', preview: this.preview(context) });
    });
    if (!requested && this.epoch === ticket) {
      this.selected = null;
      this.deps.publish({
        phase: 'unavailable',
        uri: this.uri,
        retryAt: 0,
        message: 'Parent authorization is unavailable. Close this report and try again.',
      });
    }
  };
  send = async () => {
    const context = this.selected;
    if (
      !context?.result ||
      context.used ||
      this.controller ||
      !this.current() ||
      Date.now() < this.retryAt
    )
      return;
    const ticket = this.epoch;
    const pending = new AbortController();
    this.controller = pending;
    const valid = () =>
      ticket === this.epoch &&
      this.controller === pending &&
      !pending.signal.aborted &&
      this.current();
    const timeout = setTimeout(() => pending.abort(), AI_REPORT_TIMEOUT_MS);
    let sent = false;
    this.deps.publish({ phase: 'sending', preview: this.preview(context) });
    try {
      const credential = await reportWait(
        this.deps.vault.readReferenced(context.credential),
        pending.signal
      );
      if (!valid()) return;
      if (
        credential.kind !== context.credential.kind ||
        (credential.kind === 'free' && credential.installationId !== context.installationId)
      )
        throw new Error('The original generation credential is unavailable. Nothing was sent.');
      const multipart = reportMultipart(context);
      if (!valid()) return;
      context.used = true;
      sent = true;
      const reply = await sendAiReport(
        this.deps.transport,
        multipart.body,
        {
          ...credentialHeaders(credential),
          'Content-Type': multipart.contentType,
          ...(context.result.token ? { 'X-Report-Token': context.result.token } : {}),
        },
        pending.signal
      );
      if (ticket !== this.epoch || !this.current()) return;
      if (reply.kind === 'success')
        this.deps.publish({ phase: 'success', uri: this.uri, reportId: reply.reportId });
      else {
        if (reply.kind === 'failure') {
          context.used = false;
          this.retryAt = reply.retryAt;
        }
        this.deps.publish({
          phase: reply.kind === 'failure' ? 'error' : 'unknown',
          uri: this.uri,
          message: reply.message,
          retryAt: this.retryAt,
        });
      }
    } catch (error) {
      if (ticket === this.epoch && this.current())
        this.deps.publish({
          phase: sent ? 'unknown' : 'error',
          uri: this.uri,
          retryAt: 0,
          message: sent
            ? 'The report outcome is unknown. It will not be sent again automatically.'
            : error instanceof Error
              ? error.message
              : 'AI reporting is unavailable. Nothing was sent.',
        });
    } finally {
      clearTimeout(timeout);
      if (this.controller === pending) this.controller = null;
      if (ticket === this.epoch && !this.current()) this.cancel();
    }
  };
}
export function createAiReportOwner(deps: ReportDependencies) {
  return new AiReportOwner(deps);
}
