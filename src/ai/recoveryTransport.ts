import {
  type RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
  RECOVERY_TERMINAL_CODE,
  RECOVERY_EXPIRES_HEADER,
  originalRecoveryExpiry,
  parseRecoveryTerminalReply,
  RECOVERY_MAX_JSON_BYTES,
  RECOVERY_MAX_IMAGE_BYTES,
  parseRecoveryJson,
  recoveryImageMetadata,
  parseRecoveryAckReply,
  parseRecoveryMutation,
  type RecoveryRead,
  type RecoveryOperation,
  type RecoveryAdmission,
  type RecoveryMutation,
} from './recoveryContract';
import { MAX_JSON_BYTES, MAX_RESULT_BYTES, isInstallationId } from './contract';
import { resultImageGrid } from './imageAdmission';
import { recoveryDigest } from './recoveryDigest';
import { readAiBytes } from './responseBytes';
import type { AiReply, AiResponse } from './transport';
import { imageReportToken, REPORT_TOKEN_HEADER } from './reportContract';
type RecoveryReadCommon = {
  path: typeof RECOVERY_PATH;
  method: 'GET';
  headers: Record<string, string>;

  body?: never;
  query?: never;
};
export type RecoveryReadRequest = RecoveryReadCommon &
  (
    | { recovery: RecoveryRead; deliveryProof?: never; terminalProof?: never }
    | {
        recovery: Extract<RecoveryRead, { kind: 'collect' }>;
        deliveryProof: true;
        terminalProof: true;
      }
  );
export type RecoveryAdmissionRequest = {
  path: typeof RECOVERY_PATH;
  method: 'POST';
  headers: Record<string, string>;
  recovery: RecoveryAdmission;
  terminalProof: true;
  query: string;
  body: Uint8Array;
  deliveryProof?: never;
};
type RecoveryMutationCommon = {
  path: typeof RECOVERY_PATH;
  method: 'POST';
  headers: Record<string, string>;

  query?: never;
  body: string;
  deliveryProof?: never;
};
export type RecoveryMutationRequest = RecoveryMutationCommon &
  (
    | { recovery: Extract<RecoveryMutation, { kind: 'reconcile' }>; terminalProof: true }
    | { recovery: Extract<RecoveryMutation, { kind: 'ack' }>; terminalProof?: never }
  );
function recoveryRead(operation: RecoveryOperation): Extract<RecoveryRead, { kind: 'collect' }> {
  return {
    kind: 'collect',
    id: operation.id,
    createdAt: operation.createdAt,
    expiry: operation.expiry,
  };
}
function checkLength(response: AiResponse, length: number): void {
  const raw = response.headers.get('Content-Length');
  if (raw !== null && (!/^(0|[1-9][0-9]*)$/.test(raw) || Number(raw) !== length))
    throw new Error('Recovery response length changed.');
}
function isMutationRequest(
  request: RecoveryReadRequest | RecoveryAdmissionRequest | RecoveryMutationRequest
): request is RecoveryMutationRequest {
  return request.method === 'POST' && request.recovery.kind !== 'admit';
}
function checkMutation(request: RecoveryMutationRequest): void {
  const body = parseRecoveryMutation(JSON.parse(request.body));
  const operation = request.recovery;
  if (
    body.operation !== operation.kind ||
    body.id !== operation.id ||
    body.createdAt !== operation.createdAt ||
    (operation.kind === 'ack' &&
      (body.operation !== 'ack' ||
        body.digest !== operation.digest ||
        body.receipt !== operation.receipt))
  )
    throw new Error('Recovery mutation changed.');
}
function pictureReportProof(
  response: AiResponse,
  read: Extract<RecoveryRead, { kind: 'collect' }>,
  expiresAt: number
) {
  const rawToken = response.headers.get(REPORT_TOKEN_HEADER);
  const token = imageReportToken(rawToken);
  return rawToken === null || token !== null
    ? { report: Object.freeze({ id: read.id, createdAt: read.createdAt, expiresAt, token }) }
    : {};
}
export async function parseRecoveryResponse(
  response: AiResponse,
  request: RecoveryReadRequest | RecoveryAdmissionRequest | RecoveryMutationRequest,
  signal: AbortSignal,
  now: number
): Promise<AiReply> {
  const checkedTerminal = request.terminalProof === true;
  const terminalHeader = request.headers[RECOVERY_TERMINAL_HEADER];
  if (checkedTerminal ? terminalHeader !== RECOVERY_TERMINAL_VALUE : terminalHeader !== undefined)
    throw new Error('Recovery terminal request changed.');
  const legacyRead = request.method === 'GET' && !request.deliveryProof;
  const read = request.method === 'GET' ? request.recovery : recoveryRead(request.recovery);
  if (isMutationRequest(request)) checkMutation(request);
  const imageResponse =
    response.status === 200 &&
    read.kind === 'collect' &&
    (request.method === 'GET' || request.recovery.kind !== 'ack');
  if (imageResponse) {
    const metadata = recoveryImageMetadata(response.headers, read);
    const bytes = await readAiBytes(
      response,
      legacyRead ? MAX_RESULT_BYTES : RECOVERY_MAX_IMAGE_BYTES,
      signal
    );
    await resultImageGrid(bytes, metadata.mime, () => !signal.aborted);
    const reply = Object.freeze({
      kind: 'unadmitted-image' as const,
      ...metadata,
      bytes: new Uint8Array(bytes),
    });
    if (legacyRead) return { kind: 'recovery', reply };
    const receipt = response.headers.get(RECOVERY_RECEIPT_HEADER);
    if (
      !isInstallationId(receipt) ||
      response.headers.get('Content-Type') !== metadata.mime ||
      !Number.isSafeInteger(now) ||
      now >= metadata.expiresAt ||
      recoveryDigest(bytes) !== metadata.digest
    )
      throw new Error('Recovery delivery could not be confirmed.');
    checkLength(response, bytes.length);
    return Object.freeze({
      kind: 'recovery-delivery',
      reply,
      receipt,
      ...pictureReportProof(response, read, metadata.expiresAt),
    });
  }
  if (
    !legacyRead &&
    response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json'
  )
    throw new Error('Recovery JSON type could not be confirmed.');
  const bytes = await readAiBytes(
    response,
    legacyRead ? MAX_JSON_BYTES : RECOVERY_MAX_JSON_BYTES,
    signal
  );
  if (!legacyRead) checkLength(response, bytes.length);
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    checkedTerminal &&
    read.kind === 'collect' &&
    value &&
    typeof value === 'object' &&
    'code' in value &&
    value.code === RECOVERY_TERMINAL_CODE
  ) {
    if (response.headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL)
      throw new Error('Recovery terminal version changed.');
    const confirmation = parseRecoveryTerminalReply(response.status, value, read);
    if (
      originalRecoveryExpiry(response.headers.get(RECOVERY_EXPIRES_HEADER), read) !==
      confirmation.body.expiresAt
    )
      throw new Error('Recovery terminal expiry changed.');
    const token = imageReportToken(response.headers.get(REPORT_TOKEN_HEADER));
    return Object.freeze({
      kind: 'recovery-terminal',
      confirmation,
      ...(confirmation.body.outcome === 'refusal' && token !== null
        ? {
            report: Object.freeze({
              id: read.id,
              createdAt: read.createdAt,
              expiresAt: confirmation.body.expiresAt,
              token,
            }),
          }
        : {}),
    });
  }
  if (request.method === 'POST' && request.recovery.kind === 'ack' && response.status === 200) {
    const operation = request.recovery;
    const body = parseRecoveryAckReply(value, {
      id: operation.id,
      expiresAt: operation.expiry.expiresAt,
      digest: operation.digest,
      receipt: operation.receipt,
    });
    return Object.freeze({
      kind: 'recovery-ack',
      confirmation: Object.freeze({ status: 200, body }),
    });
  }
  if (
    !legacyRead &&
    response.status === 202 &&
    response.headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL
  )
    throw new Error('Recovery response version changed.');
  return {
    kind: 'recovery',
    reply: parseRecoveryJson(response.status, value, response.headers, read),
  };
}
