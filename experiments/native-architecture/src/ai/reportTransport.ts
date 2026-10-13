import { MAX_JSON_BYTES, MAX_RETRY_AFTER_MS } from './contract';
import { readAiBytes, type AiTransport } from './transport';
export type AiReportReply =
  | { kind: 'success'; reportId: string }
  | { kind: 'failure'; message: string; retryAt: number }
  | { kind: 'unknown'; message: string };
const UNKNOWN_REPORT =
  'The report outcome is unknown. Splotch may already have received it. It will not be sent again automatically.';
const DEFAULT_REPORT_RETRY_MS = 60_000;
const REPORT_ID = /^\d{1,16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  signal: AbortSignal
): Promise<AiReportReply> {
  try {
    const response = await reportWait(
      transport({ path: '/api/report-image', method: 'POST', headers, body }, signal),
      signal
    );
    const bytes = await reportWait(readAiBytes(response, MAX_JSON_BYTES, signal), signal);
    if (signal.aborted) return { kind: 'unknown', message: UNKNOWN_REPORT };
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Invalid report reply');
    const keys = Object.keys(raw).sort().join(',');
    if (
      response.status === 200 &&
      keys === 'ok,reportId' &&
      'ok' in raw &&
      raw.ok === true &&
      'reportId' in raw &&
      typeof raw.reportId === 'string' &&
      REPORT_ID.test(raw.reportId)
    )
      return { kind: 'success', reportId: raw.reportId };
    if (
      response.status >= 400 &&
      response.status < 500 &&
      keys === 'error,ok' &&
      'ok' in raw &&
      raw.ok === false &&
      'error' in raw &&
      typeof raw.error === 'string' &&
      raw.error.trim()
    ) {
      const retry = response.headers.get('Retry-After');
      const delay =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry
            ? Date.parse(retry) - Date.now()
            : NaN;
      return {
        kind: 'failure',
        message: raw.error,
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
    /* A sent request without a strict acknowledgement has an unknown outcome. */
  }
  return { kind: 'unknown', message: UNKNOWN_REPORT };
}
