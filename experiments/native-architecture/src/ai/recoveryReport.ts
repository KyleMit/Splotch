import {
  credentialHeaders,
  type AiCredential,
  type AiCredentialLease,
  type AiReferencedVault,
} from './credentials';
import type { AiImageAdmission } from './imageAdmission';
import type { AiRecoveryRequestReceipt, AiRecoveryTerminalConfirmation } from './journal';
import { checkedRecoveryTerminal, verifyRecoveryRequestIdentity } from './recoveryRequest';
import { recoveryDigest } from './recoveryDigest';
import { imageReportToken, MAX_AI_REPORT_BYTES, type AiReportContext } from './reportContract';
import { reportWait } from './reportTransport';
import type { AiMime } from './contract';

export type RecoveryReportProof = Readonly<{
  id: string;
  createdAt: number;
  expiresAt: number;
  token: string | null;
}>;
export type RecoveryReportPermission = {
  lease: AiCredentialLease;
  permitted: () => boolean;
  current: () => AiRecoveryRequestReceipt | null;
};
export type RecoveryReportSource = {
  identity: string;
  credentialDigest: string;
  expiresAt: number | null;
  evidence: string | null;
  permission: RecoveryReportPermission;
};
function identity(receipt: AiRecoveryRequestReceipt): string {
  return JSON.stringify([
    receipt.kind,
    receipt.nonce,
    receipt.originalRevision,
    receipt.originalDigest,
    receipt.inputDigest,
    receipt.inputLength,
    receipt.journal.id,
    receipt.journal.createdAt,
    receipt.journal.originalId,
    receipt.journal.style,
    receipt.recovery.version,
    receipt.recovery.protocol,
    receipt.recovery.id,
    receipt.recovery.credential.kind,
    receipt.recovery.credential.reference,
    receipt.recovery.sourceHeld.id,
    receipt.recovery.sourceHeld.nonce,
    receipt.recovery.sourceHeld.revision,
  ]);
}
export function recoveryReportCredential(credential: AiCredential): string {
  return recoveryDigest(new TextEncoder().encode(JSON.stringify(credentialHeaders(credential))));
}
export function recoveryReportEvidence(receipt: AiRecoveryRequestReceipt): string | null {
  if (receipt.recovery.state === 'terminal')
    return JSON.stringify([
      'terminal',
      receipt.recovery.outcome,
      receipt.journal.phase,
      receipt.journal.result,
      receipt.resultDigest,
      receipt.resultLength,
    ]);
  if (receipt.recovery.state === 'retained' || receipt.recovery.state === 'acknowledged') {
    const delivery = receipt.recovery.delivery;
    return JSON.stringify([
      'picture',
      receipt.journal.phase,
      receipt.journal.result?.uri,
      receipt.journal.result?.mime,
      receipt.resultDigest,
      receipt.resultLength,
      delivery.expiresAt,
      delivery.digest,
      delivery.length,
      delivery.mime,
      delivery.receipt,
    ]);
  }
  return null;
}
export function recoveryReportCurrent(source: RecoveryReportSource): boolean {
  const receipt = source.permission.current();
  return (
    !!receipt &&
    source.permission.lease.valid() &&
    identity(receipt) === source.identity &&
    (source.evidence === null || recoveryReportEvidence(receipt) === source.evidence) &&
    (source.expiresAt === null ||
      (receipt.recovery.expiry.kind === 'known' &&
        receipt.recovery.expiry.expiresAt === source.expiresAt))
  );
}
export async function prepareRecoveryReport(
  receipt: AiRecoveryRequestReceipt,
  drawing: Uint8Array,
  permission: RecoveryReportPermission,
  vault: AiReferencedVault,
  admit: AiImageAdmission,
  signal: AbortSignal
): Promise<{ context: AiReportContext; source: RecoveryReportSource } | null> {
  const original = drawing.slice();
  const binding = identity(receipt);
  const valid = () =>
    !signal.aborted &&
    permission.permitted() &&
    permission.lease.valid() &&
    permission.current() === receipt &&
    identity(receipt) === binding &&
    original.length === receipt.inputLength &&
    recoveryDigest(original) === receipt.inputDigest;
  if (
    !valid() ||
    receipt.recovery.state !== 'submission-uncertain' ||
    !original.length ||
    original.length > MAX_AI_REPORT_BYTES ||
    original.length !== receipt.inputLength ||
    recoveryDigest(original) !== receipt.inputDigest
  )
    return null;
  await verifyRecoveryRequestIdentity(receipt);
  if (!valid()) return null;
  await reportWait(admit(original, 'image/png'), signal);
  if (!valid()) return null;
  const reference = Object.freeze({ ...receipt.recovery.credential });
  const credential = await reportWait(vault.readReferenced(reference), signal);
  if (!valid() || credential.kind !== reference.kind) return null;
  return {
    context: {
      id: receipt.journal.id,
      drawing: original,
      style: receipt.journal.style,
      credential: reference,
      installationId: credential.kind === 'free' ? credential.installationId : null,
      evidence: null,
      used: false,
    },
    source: {
      identity: binding,
      credentialDigest: recoveryReportCredential(credential),
      expiresAt: null,
      evidence: null,
      permission,
    },
  };
}
function matches(
  source: RecoveryReportSource,
  receipt: AiRecoveryRequestReceipt,
  proof: RecoveryReportProof
) {
  return (
    recoveryReportCurrent(source) &&
    source.permission.current() === receipt &&
    identity(receipt) === source.identity &&
    receipt.recovery.expiry.kind === 'known' &&
    receipt.recovery.expiry.expiresAt === proof.expiresAt &&
    proof.id === receipt.recovery.id &&
    proof.createdAt === receipt.journal.createdAt
  );
}
export function recoveryRefusalReport(
  source: RecoveryReportSource,
  receipt: AiRecoveryRequestReceipt,
  confirmation: AiRecoveryTerminalConfirmation,
  proof: RecoveryReportProof
): boolean {
  if (
    !imageReportToken(proof.token) ||
    receipt.recovery.state !== 'terminal' ||
    receipt.recovery.outcome !== 'refusal' ||
    receipt.journal.phase !== 'failed' ||
    receipt.journal.result !== null ||
    receipt.resultDigest !== null ||
    receipt.resultLength !== null
  )
    return false;
  const checked = checkedRecoveryTerminal(receipt, confirmation);
  return (
    checked.body.outcome === 'refusal' &&
    checked.body.expiresAt === proof.expiresAt &&
    matches(source, receipt, proof)
  );
}
export function recoveryPictureReport(
  source: RecoveryReportSource,
  receipt: AiRecoveryRequestReceipt,
  bytes: Uint8Array,
  mime: AiMime,
  proof: RecoveryReportProof,
  uri: string
): boolean {
  if (
    (proof.token !== null && imageReportToken(proof.token) === null) ||
    (receipt.recovery.credential.kind === 'free' && !imageReportToken(proof.token)) ||
    (receipt.recovery.state !== 'retained' && receipt.recovery.state !== 'acknowledged')
  )
    return false;
  const delivery = receipt.recovery.delivery;
  return (
    delivery.expiresAt === proof.expiresAt &&
    matches(source, receipt, proof) &&
    receipt.journal.phase === 'result' &&
    receipt.journal.result?.uri === uri &&
    receipt.journal.result.mime === mime &&
    delivery.mime === mime &&
    delivery.length === bytes.length &&
    receipt.resultLength === bytes.length &&
    receipt.resultDigest === delivery.digest &&
    recoveryDigest(bytes) === delivery.digest
  );
}
