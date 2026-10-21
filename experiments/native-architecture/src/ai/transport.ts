import { RECOVERY_PATH, type RecoveryReply } from './recoveryContract';
import {
  parseRecoveryResponse,
  type RecoveryReadRequest,
  type RecoveryAdmissionRequest,
  type RecoveryMutationRequest,
} from './recoveryTransport';
export type { RecoveryReadRequest, RecoveryMutationRequest } from './recoveryTransport';
import { readAiBytes } from './responseBytes';
export { readAiBytes } from './responseBytes';
import {
  AI_ORIGIN,
  MAX_JSON_BYTES,
  MAX_RESULT_BYTES,
  REQUEST_TIMEOUT_MS,
  MAX_RETRY_AFTER_MS,
  POLL_INTERVAL_MS,
  FREE_LIMIT,
  isAiMime,
  isInstallationId,
  type AiMime,
} from './contract';
import { resultImageGrid } from './imageAdmission';
import {
  FREE_DAILY_LIMIT_EXHAUSTED_CODE,
  FREE_GRANT_EXHAUSTED_CODE,
  GENERATION_ACCEPTED_STATUS,
  GENERATION_UNAVAILABLE_CODE,
  SAFETY_REFUSAL_STATUS,
  THROTTLED_STATUS,
} from '../../../../web/src/lib/ai/generationResult';
import { AI_UNFINISHED_MESSAGE } from '../../../../web/src/lib/ai/generationFailures';
import { imageReportToken, REPORT_TOKEN_HEADER } from './reportContract';
import type { RecoveryReportProof } from './recoveryReport';
import type { AiRecoveryAckConfirmation, AiRecoveryTerminalConfirmation } from './journal';
type LegacyAiRequest = {
  path:
    | '/api/generate-image'
    | '/api/generation-result'
    | '/api/free-generation-grant'
    | '/api/verify-access-code'
    | '/api/verify-key'
    | '/api/report-image';
  query?: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: Uint8Array | string;
};
export type AiRequest =
  LegacyAiRequest | RecoveryReadRequest | RecoveryAdmissionRequest | RecoveryMutationRequest;
export type AiResponse = {
  status: number;
  headers: Pick<Headers, 'get'>;
  body: ReadableStream<Uint8Array> | null;
};
export type AiTransport = (request: AiRequest, signal: AbortSignal) => Promise<AiResponse>;
export type AiReply =
  | { kind: 'recovery'; reply: RecoveryReply }
  | Readonly<{
      kind: 'recovery-delivery';
      reply: Extract<RecoveryReply, { kind: 'unadmitted-image' }>;
      receipt: string;
      report?: RecoveryReportProof;
    }>
  | Readonly<{ kind: 'recovery-ack'; confirmation: AiRecoveryAckConfirmation }>
  | Readonly<{
      kind: 'recovery-terminal';
      confirmation: AiRecoveryTerminalConfirmation;
      report?: RecoveryReportProof;
    }>
  | {
      kind: 'image';
      bytes: Uint8Array;
      mime: AiMime;
      remaining: number | null;
      reportToken: string | null;
    }
  | { kind: 'ticket'; jobId: string; pollAfterMs: number }
  | { kind: 'pending'; delayMs: number }
  | { kind: 'grant'; remaining: number }
  | { kind: 'verified'; accessCode?: string }
  | {
      kind: 'failure';
      reason: 'safety';
      message: string;
      reportToken: string | null;
      retryAt?: never;
      status?: number;
    }
  | {
      kind: 'failure';
      reason: 'exhausted' | 'unavailable' | 'throttled' | 'rejected' | 'server' | 'invalid';
      message: string;
      retryAt?: number;
      status?: number;
      detail?: string;
    }
  | { kind: 'unknown'; cause: 'timeout' | 'network'; message: string };
// The web export calls this path on its own origin, whose host serves the /api function beside the
// page documents; the native apps call it on AI_ORIGIN through aiUrl.
export function aiPath(request: AiRequest) {
  if (request.path === RECOVERY_PATH)
    throw new Error(
      'Recovery activation requires qualified native storage, secure references, privacy and service contract.'
    );
  return `${request.path}${request.query ? `?${request.query}` : ''}`;
}
export function aiUrl(request: AiRequest) {
  return `${AI_ORIGIN}${aiPath(request)}`;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function retryDelay(response: AiResponse, now: number) {
  const raw = response.headers.get('Retry-After');
  const delay = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - now : NaN;
  return Number.isFinite(delay)
    ? Math.max(POLL_INTERVAL_MS, Math.min(delay, MAX_RETRY_AFTER_MS))
    : 60_000;
}
function remainingHeader(response: AiResponse) {
  const value = response.headers.get('X-Free-Generations-Remaining');
  return value !== null && /^\d+$/.test(value) && Number(value) <= FREE_LIMIT
    ? Number(value)
    : null;
}
export async function parseAiResponse(
  response: AiResponse,
  request: AiRequest,
  signal: AbortSignal,
  now: number
): Promise<AiReply> {
  if (request.path === RECOVERY_PATH) return parseRecoveryResponse(response, request, signal, now);
  const poll = request.path === '/api/generation-result';
  if (response.status === 200 && (poll || request.path === '/api/generate-image')) {
    const mime = response.headers.get('Content-Type')?.split(';')[0].trim();
    if (!isAiMime(mime)) throw new Error('Invalid image type');
    const bytes = await readAiBytes(response, MAX_RESULT_BYTES, signal);
    await resultImageGrid(bytes, mime, () => !signal.aborted);
    return {
      kind: 'image',
      bytes,
      mime,
      remaining: remainingHeader(response),
      reportToken: imageReportToken(response.headers.get(REPORT_TOKEN_HEADER)),
    };
  }
  const bytes = await readAiBytes(response, MAX_JSON_BYTES, signal);
  const text = new TextDecoder().decode(bytes);
  if (poll || request.path === '/api/generate-image')
    return generationReply(response, jsonObject(text), text, poll, now);
  const raw = jsonObject(text);
  if (!raw) throw new Error('Invalid reply');
  if (
    response.status === 200 &&
    request.path === '/api/free-generation-grant' &&
    raw.ok === true &&
    Number.isInteger(raw.remaining) &&
    typeof raw.remaining === 'number' &&
    raw.remaining >= 0 &&
    raw.remaining <= FREE_LIMIT &&
    raw.limit === FREE_LIMIT &&
    Object.keys(raw).sort().join(',') === 'limit,ok,remaining'
  )
    return { kind: 'grant', remaining: raw.remaining };
  if (
    response.status === 200 &&
    request.path === '/api/verify-key' &&
    raw.ok === true &&
    Object.keys(raw).join(',') === 'ok'
  )
    return { kind: 'verified' };
  if (
    response.status === 200 &&
    request.path === '/api/verify-access-code' &&
    raw.ok === true &&
    typeof raw.accessCode === 'string' &&
    raw.accessCode.trim() &&
    Object.keys(raw).sort().join(',') === 'accessCode,ok'
  )
    return { kind: 'verified', accessCode: raw.accessCode };
  const reply = parseAiFailure(raw, response, now, VERIFY_PATHS.includes(request.path));
  // The HTTP status, and for anything but a refusal the server's own words, ride along for the
  // problem report a grown-up can send about a failure; the child sees only the app's message. A
  // refusal's provider reason is never kept.
  if (reply.kind !== 'failure') return reply;
  return reply.reason === 'safety'
    ? { ...reply, status: response.status }
    : { ...reply, status: response.status, detail: String(raw.error) };
}
function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(text);
    return object(raw) ? raw : null;
  } catch {
    return null;
  }
}
function validTicket(raw: Record<string, unknown> | null) {
  return (
    !!raw &&
    raw.ok === true &&
    isInstallationId(raw.jobId) &&
    typeof raw.pollAfterMs === 'number' &&
    Number.isFinite(raw.pollAfterMs) &&
    raw.pollAfterMs >= 0 &&
    raw.pollAfterMs <= MAX_RETRY_AFTER_MS &&
    Object.keys(raw).sort().join(',') === 'jobId,ok,pollAfterMs'
  );
}
const UNFINISHED_PICTURE = 'That picture did not finish. Your original drawing is saved.';
// A generation reply read as shipping's readAiImageResponse reads it: by status and code, with the
// body's own words, or the raw body when it is not the JSON envelope (a bare platform 502), kept
// for the problem report. Every failure a retry may fix comes back as one the child can retry.
function generationReply(
  response: AiResponse,
  raw: Record<string, unknown> | null,
  text: string,
  poll: boolean,
  now: number
): AiReply {
  const status = response.status;
  if (status === GENERATION_ACCEPTED_STATUS) {
    if (poll) return { kind: 'pending', delayMs: POLL_INTERVAL_MS };
    if (raw && validTicket(raw))
      return {
        kind: 'ticket',
        jobId: String(raw.jobId),
        pollAfterMs: Math.max(POLL_INTERVAL_MS, Number(raw.pollAfterMs)),
      };
    return {
      kind: 'failure',
      reason: 'server',
      message: UNFINISHED_PICTURE,
      detail: AI_UNFINISHED_MESSAGE,
    };
  }
  const detail = raw && typeof raw.error === 'string' ? raw.error : text;
  const code = raw && typeof raw.code === 'string' ? raw.code : null;
  if (poll && code === GENERATION_UNAVAILABLE_CODE)
    return { kind: 'pending', delayMs: POLL_INTERVAL_MS };
  if (code === FREE_GRANT_EXHAUSTED_CODE)
    return {
      kind: 'failure',
      reason: 'exhausted',
      status,
      detail,
      message: 'Your free pictures are used up. A grown-up can add an access code or OpenAI key.',
    };
  if (code === FREE_DAILY_LIMIT_EXHAUSTED_CODE)
    return {
      kind: 'failure',
      reason: 'unavailable',
      status,
      detail,
      message: 'AI pictures are unavailable right now. Please try later.',
    };
  if (status === SAFETY_REFUSAL_STATUS)
    return {
      kind: 'failure',
      reason: 'safety',
      status,
      reportToken: imageReportToken(response.headers.get(REPORT_TOKEN_HEADER)),
      message: "Let's try drawing something else! Your original is still here.",
    };
  if (status === THROTTLED_STATUS)
    return poll
      ? { kind: 'pending', delayMs: retryDelay(response, now) }
      : { kind: 'failure', reason: 'throttled', status, detail, message: AI_THROTTLED_MESSAGE };
  return { kind: 'failure', reason: 'server', status, detail, message: UNFINISHED_PICTURE };
}
const VERIFY_PATHS: readonly AiRequest['path'][] = ['/api/verify-key', '/api/verify-access-code'];
export const AI_THROTTLED_MESSAGE = 'Too many attempts. Please wait before trying again.';
function parseAiFailure(
  raw: Record<string, unknown>,
  response: AiResponse,
  now: number,
  verify: boolean
): AiReply {
  if (
    raw.ok !== false ||
    typeof raw.error !== 'string' ||
    !raw.error.trim() ||
    raw.error.length > MAX_JSON_BYTES
  )
    throw new Error('Invalid failure');
  const allowed = ['ok', 'error', 'code', 'remaining'];
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    throw new Error('Invalid failure fields');
  const codes = [
    'GENERATION_UNAVAILABLE',
    'FREE_GRANT_EXHAUSTED',
    'FREE_DAILY_LIMIT_EXHAUSTED',
    'KEY_CHECK_UNAVAILABLE',
  ];
  if (
    ('code' in raw && (typeof raw.code !== 'string' || !codes.includes(raw.code))) ||
    ('remaining' in raw && (raw.code !== 'FREE_GRANT_EXHAUSTED' || raw.remaining !== 0))
  )
    throw new Error('Invalid failure contract');
  if (response.status === THROTTLED_STATUS)
    return {
      kind: 'failure',
      reason: 'unavailable',
      retryAt: now + retryDelay(response, now),
      message: AI_THROTTLED_MESSAGE,
    };
  if (response.status === 422)
    return {
      kind: 'failure',
      reason: 'safety',
      reportToken: imageReportToken(response.headers.get(REPORT_TOKEN_HEADER)),
      message: "Let's try drawing something else! Your original is still here.",
    };
  // A credential check's refusal is worded by the server, as shipping's Settings shows it: a key
  // OpenAI turned down, an unrecognized code, or a check that got no answer.
  if (verify && response.status === 503 && raw.code === 'KEY_CHECK_UNAVAILABLE')
    return { kind: 'failure', reason: 'unavailable', message: raw.error };
  if (verify && (response.status === 200 || response.status === 400))
    return { kind: 'failure', reason: 'rejected', message: raw.error };
  if (response.status === 403 && raw.code === 'FREE_GRANT_EXHAUSTED' && raw.remaining === 0)
    return {
      kind: 'failure',
      reason: 'exhausted',
      message: 'Your free pictures are used up. A grown-up can add an access code or OpenAI key.',
    };
  if (response.status === 503)
    return {
      kind: 'failure',
      reason: 'unavailable',
      message: 'AI pictures are unavailable right now. Please try later.',
    };
  if (response.status === 200 || response.status === 403)
    return {
      kind: 'failure',
      reason: 'rejected',
      message: 'That credential was not recognized. Your saved credential was not changed.',
    };
  return { kind: 'failure', reason: 'server', message: UNFINISHED_PICTURE };
}
export async function requestAi(
  transport: AiTransport,
  request: AiRequest,
  onLate: (reply: AiReply) => void | Promise<void>
): Promise<AiReply> {
  if (request.path === RECOVERY_PATH)
    return { kind: 'recovery', reply: Object.freeze({ kind: 'held', reason: 'unavailable' }) };
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<AiReply>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      resolve({
        kind: 'unknown',
        cause: 'timeout',
        message:
          'The connection timed out. A sent picture may still finish. No generation will be retried automatically.',
      });
    }, REQUEST_TIMEOUT_MS);
  });
  const result = (async (): Promise<AiReply> => {
    try {
      const response = await transport(request, controller.signal);
      const readerController = new AbortController();
      const readerTimer = setTimeout(() => readerController.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await parseAiResponse(response, request, readerController.signal, Date.now());
      } finally {
        clearTimeout(readerTimer);
      }
    } catch {
      return {
        kind: 'unknown',
        cause: 'network',
        message:
          'The reply could not be collected. A sent picture may still finish. Your original is saved; no generation will be retried automatically.',
      };
    }
  })();
  void result
    .then((reply) => {
      if (expired) return onLate(reply);
    })
    .catch(() => {});
  try {
    return await Promise.race([result, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
