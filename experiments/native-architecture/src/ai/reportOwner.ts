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
  imageReportToken,
  REPORT_TOKEN_HEADER,
  type AiReportTarget,
  type AiReportPreview,
  type AiReportContext,
  type AiReportState,
} from './reportContract';
import { sendAiReport, reportWait } from './reportTransport';
import {
  prepareRecoveryReport,
  recoveryReportCurrent,
  recoveryReportCredential,
  recoveryReportEvidence,
  recoveryRefusalReport,
  recoveryPictureReport,
  type RecoveryReportPermission,
  type RecoveryReportSource,
  type RecoveryReportProof,
} from './recoveryReport';
import type { AiRecoveryRequestReceipt, AiRecoveryTerminalConfirmation } from './journal';
import { NETWORK_ERROR_MESSAGE } from '../../../../web/src/lib/latestRequest';
import { reportFailureMessage } from '../../../../web/src/lib/reportReply';

const AI_REPORT_PREPARE_TIMEOUT_MS = 2000;
function sameReportTarget(left: AiReportTarget, right: AiReportTarget) {
  return left.kind === 'picture'
    ? right.kind === 'picture' && left.uri === right.uri
    : right.kind === 'false-positive-refusal' && left.id === right.id;
}
type ReportDependencies = {
  vault: AiReferencedVault;
  parent?: ParentOperationPort;
  transport: AiTransport;
  admit: AiImageAdmission;
  current: (target: AiReportTarget) => boolean;
  publish: (state: AiReportState) => void;
};
class AiReportOwner {
  private deps: ReportDependencies;
  private contexts = new Map<number, AiReportContext>();
  private recoveryContexts = new Map<number, RecoveryReportSource>();
  private epoch = 0;
  private selected: AiReportContext | null = null;
  private target: AiReportTarget | null = null;
  private proof: ParentProof | null = null;
  private consentEpoch = -1;
  private confirmationReady = false;
  private controller: AbortController | null = null;
  private retryAt = 0;
  constructor(deps: ReportDependencies) {
    this.deps = deps;
  }
  private current = () =>
    !!this.selected &&
    !!this.target &&
    this.contexts.get(this.selected.id) === this.selected &&
    this.deps.current(this.target) &&
    this.contextCurrent(this.selected.id) &&
    !!this.proof?.valid() &&
    !!this.deps.parent?.consent().enabled &&
    this.deps.parent.consent().epoch === this.consentEpoch;
  private contextCurrent = (id: number) => {
    const source = this.recoveryContexts.get(id);
    return !source || recoveryReportCurrent(source);
  };
  cancel = () => {
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
    this.selected = null;
    this.target = null;
    this.proof = null;
    this.confirmationReady = false;
    this.deps.parent?.cancel('imageReport');
    this.deps.publish({ phase: 'idle' });
  };
  dispose = () => {
    this.cancel();
    this.contexts.clear();
    this.recoveryContexts.clear();
  };
  private preview = (context: AiReportContext): AiReportPreview => {
    const evidence = context.evidence;
    if (!evidence || !this.target) throw new Error('AI reporting context is unavailable.');
    const original = {
      drawing: `data:image/png;base64,${bytesBase64(context.drawing)}`,
      style: context.style,
    };
    if (evidence.kind === 'picture' && this.target.kind === 'picture')
      return {
        ...original,
        target: this.target,
        output: `data:${evidence.mime};base64,${bytesBase64(evidence.bytes)}`,
      };
    if (evidence.kind === 'false-positive-refusal' && this.target.kind === 'false-positive-refusal')
      return { ...original, target: this.target };
    throw new Error('AI reporting evidence does not match this report.');
  };
  prepare = async (
    id: number,
    drawing: Uint8Array,
    style: AiStyle | null,
    credential: AiCredential
  ) => {
    const ticket = this.epoch;
    if (!drawing.length || drawing.length > MAX_AI_REPORT_BYTES) return;
    const original = drawing.slice();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_REPORT_PREPARE_TIMEOUT_MS);
    try {
      await reportWait(this.deps.admit(original, 'image/png', 'original'), controller.signal);
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
      this.recoveryContexts.clear();
      this.contexts.set(id, {
        id,
        drawing: original,
        style,
        credential: reference,
        installationId: credential.kind === 'free' ? credential.installationId : null,
        evidence: null,
        used: false,
      });
    } catch {
      /* Optional report preparation cannot prevent generation. */
    } finally {
      clearTimeout(timer);
    }
  };
  prepareRecovery = async (
    receipt: AiRecoveryRequestReceipt,
    drawing: Uint8Array,
    permission: RecoveryReportPermission
  ) => {
    const ticket = this.epoch;
    if (this.contexts.has(receipt.journal.id)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_REPORT_PREPARE_TIMEOUT_MS);
    try {
      const prepared = await prepareRecoveryReport(
        receipt,
        drawing,
        permission,
        this.deps.vault,
        this.deps.admit,
        controller.signal
      );
      if (
        !prepared ||
        ticket !== this.epoch ||
        controller.signal.aborted ||
        !permission.permitted() ||
        !recoveryReportCurrent(prepared.source)
      )
        return;
      this.contexts.clear();
      this.recoveryContexts.clear();
      this.contexts.set(prepared.context.id, prepared.context);
      this.recoveryContexts.set(prepared.context.id, prepared.source);
    } catch {
      /* Optional report context cannot authorize or prevent generation. */
    } finally {
      clearTimeout(timer);
    }
  };
  adoptRecoveryRefusal = (
    receipt: AiRecoveryRequestReceipt,
    confirmation: AiRecoveryTerminalConfirmation,
    proof: RecoveryReportProof
  ) => {
    const source = this.recoveryContexts.get(receipt.journal.id);
    if (!source || !recoveryRefusalReport(source, receipt, confirmation, proof)) return false;
    if (!this.refuse(receipt.journal.id, proof.token)) return false;
    source.expiresAt = confirmation.body.expiresAt;
    source.evidence = recoveryReportEvidence(receipt);
    return true;
  };
  adoptRecoveryPicture = (
    receipt: AiRecoveryRequestReceipt,
    bytes: Uint8Array,
    mime: AiMime,
    proof: RecoveryReportProof,
    uri: string
  ) => {
    const source = this.recoveryContexts.get(receipt.journal.id);
    if (!source || !recoveryPictureReport(source, receipt, bytes, mime, proof, uri)) return;
    this.complete(receipt.journal.id, bytes, mime, proof.token, uri);
    source.expiresAt =
      receipt.recovery.expiry.kind === 'known' ? receipt.recovery.expiry.expiresAt : null;
    source.evidence = recoveryReportEvidence(receipt);
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
    const evidence = context.evidence;
    const suppliedToken = imageReportToken(token);
    if (evidence) {
      if (
        evidence.kind !== 'picture' ||
        evidence.mime !== mime ||
        (suppliedToken !== null && evidence.token !== suppliedToken) ||
        evidence.bytes.length !== bytes.length ||
        !bytes.every((value, index) => value === evidence.bytes[index])
      )
        return;
      evidence.uris.add(resultUri);
    } else
      context.evidence = {
        kind: 'picture',
        bytes: bytes.slice(),
        mime,
        token: suppliedToken,
        uris: new Set([resultUri]),
      };
  };
  refuse = (id: number, rawToken: string | null) => {
    const context = this.contexts.get(id);
    const token = imageReportToken(rawToken);
    if (!context || !token) return false;
    if (context.evidence)
      return context.evidence.kind === 'false-positive-refusal' && context.evidence.token === token;
    context.evidence = { kind: 'false-positive-refusal', token };
    return true;
  };
  request = (uri: string) => this.review({ kind: 'picture', uri });
  requestRefusal = (id: number) => this.review({ kind: 'false-positive-refusal', id });
  review = (requestedTarget: AiReportTarget) => {
    if (this.controller) return;
    const target = Object.freeze({ ...requestedTarget });
    if (Date.now() < this.retryAt) {
      this.deps.publish({
        phase: 'error',
        target,
        retryAt: this.retryAt,
        message: 'Please wait before reviewing this report again.',
      });
      return;
    }
    if (
      this.target &&
      sameReportTarget(this.target, target) &&
      this.selected &&
      !this.selected.used &&
      this.current()
    ) {
      this.confirmationReady = true;
      this.deps.publish({ phase: 'confirm', preview: this.preview(this.selected) });
      return;
    }
    this.cancel();
    this.target = target;
    const context =
      target.kind === 'picture'
        ? [...this.contexts.values()].find(
            (value) => value.evidence?.kind === 'picture' && value.evidence.uris.has(target.uri)
          )
        : this.contexts.get(target.id);
    const evidence = context?.evidence;
    if (
      !context ||
      !evidence ||
      evidence.kind !== target.kind ||
      context.used ||
      !this.deps.parent ||
      !this.deps.current(target) ||
      !this.contextCurrent(context.id) ||
      (context.credential.kind === 'free' && !evidence.token)
    ) {
      this.deps.publish({
        phase: 'unavailable',
        target,
        retryAt: 0,
        message:
          'Reporting requires the original drawing, credential reference and report proof from this app session. Older pictures and refusals without that context cannot be reported here.',
      });
      return;
    }
    this.selected = context;
    const ticket = this.epoch;
    this.deps.publish({ phase: 'gating', target });
    const requested = this.deps.parent.request('imageReport', (nextProof) => {
      if (this.epoch !== ticket || !this.deps.current(target) || !nextProof.valid()) return;
      this.proof = nextProof;
      this.consentEpoch = this.deps.parent?.consent().epoch ?? -1;
      if (this.current()) {
        this.confirmationReady = true;
        this.deps.publish({ phase: 'confirm', preview: this.preview(context) });
      }
    });
    if (!requested && this.epoch === ticket) {
      this.selected = null;
      this.deps.publish({
        phase: 'unavailable',
        target,
        retryAt: 0,
        message: 'Parent authorization is unavailable. Close this report and try again.',
      });
    }
  };
  send = async () => {
    const context = this.selected;
    const target = this.target;
    if (
      !context?.evidence ||
      !target ||
      !this.confirmationReady ||
      context.used ||
      this.controller ||
      !this.current() ||
      Date.now() < this.retryAt
    )
      return;
    this.confirmationReady = false;
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
        (credential.kind === 'free' && credential.installationId !== context.installationId) ||
        (this.recoveryContexts.has(context.id) &&
          this.recoveryContexts.get(context.id)?.credentialDigest !==
            recoveryReportCredential(credential))
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
          ...(context.evidence.token ? { [REPORT_TOKEN_HEADER]: context.evidence.token } : {}),
        },
        pending.signal,
        reportFailureMessage(context.evidence.kind)
      );
      if (ticket !== this.epoch || !this.current()) return;
      if (reply.kind === 'success')
        this.deps.publish({ phase: 'success', target, reportId: reply.reportId });
      else {
        context.used = false;
        this.retryAt = reply.retryAt;
        this.deps.publish({
          phase: 'error',
          target,
          message: reply.message,
          retryAt: this.retryAt,
        });
      }
    } catch (error) {
      if (ticket === this.epoch && this.current()) {
        context.used = false;
        this.deps.publish({
          phase: 'error',
          target,
          retryAt: 0,
          message: sent
            ? NETWORK_ERROR_MESSAGE
            : error instanceof Error
              ? error.message
              : 'AI reporting is unavailable. Nothing was sent.',
        });
      }
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
