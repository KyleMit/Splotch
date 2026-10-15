import { MAX_JSON_BYTES, MAX_RETRY_AFTER_MS } from './contract';
import { readAiBytes, type AiTransport } from './transport';
import { narrowReportReply, REPORT_TIMEOUT_MESSAGE } from '../../../../web/src/lib/reportReply';
import { NETWORK_ERROR_MESSAGE } from '../../../../web/src/lib/latestRequest';
export type AiReportReply =
  | { kind: 'success'; reportId: string | null }
  | { kind: 'failure'; message: string; retryAt: number };
const DEFAULT_REPORT_RETRY_MS = 60_000;
export async function reportWait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('AI report request stopped.');
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('AI report request stopped.'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
export async function sendAiReport(
  transport: AiTransport,
  body: Uint8Array,
  headers: Record<string, string>,
  signal: AbortSignal,
  failureMessage: string
): Promise<AiReportReply> {
  try {
    const response = await reportWait(
      transport({ path: '/api/report-image', method: 'POST', headers, body }, signal),
      signal
    );
    const bytes = await reportWait(readAiBytes(response, MAX_JSON_BYTES, signal), signal);
    if (signal.aborted) return { kind: 'failure', message: REPORT_TIMEOUT_MESSAGE, retryAt: 0 };
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return { kind: 'failure', message: failureMessage, retryAt: 0 };
    }
    const reply = narrowReportReply(raw);
    if (response.status >= 200 && response.status < 300 && reply?.ok)
      return { kind: 'success', reportId: 'reportId' in reply ? reply.reportId : null };
    if (reply && !reply.ok) {
      const retry = response.headers.get('Retry-After');
      const delay =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry
            ? Date.parse(retry) - Date.now()
            : NaN;
      return {
        kind: 'failure',
        message: reply.error,
        retryAt:
          response.status === 429
            ? Date.now() +
              (Number.isFinite(delay)
                ? Math.max(0, Math.min(MAX_RETRY_AFTER_MS, delay))
                : DEFAULT_REPORT_RETRY_MS)
            : 0,
      };
    }
  } catch {
    return {
      kind: 'failure',
      message: signal.aborted ? REPORT_TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE,
      retryAt: 0,
    };
  }
  return { kind: 'failure', message: failureMessage, retryAt: 0 };
}
