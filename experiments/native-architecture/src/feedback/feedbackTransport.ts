import type { ReportRequestBody } from './report';

export const FEEDBACK_URL = 'https://splotch.art/api/report';
export const FEEDBACK_TIMEOUT_MS = 20_000;
export const MAX_FEEDBACK_REPLY_BYTES = 8192;
export const MAX_RETRY_AFTER_SECONDS = 3600;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

export type FeedbackResponse = {
  status: number;
  headers: Pick<Headers, 'get'>;
  body: ReadableStream<Uint8Array> | null;
};
export type FeedbackTransport = (
  body: Readonly<ReportRequestBody>,
  signal: AbortSignal
) => Promise<FeedbackResponse>;
export type FeedbackOutcome =
  | { status: 'success'; message: string }
  | { status: 'offline' | 'timeout' | 'malformed' | 'error' | 'cancelled'; message: string }
  | { status: 'throttled'; message: string; retryAfterSeconds: number };

function parseReply(raw: unknown): { ok: true } | { ok: false; error: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw).sort();
  if ('ok' in raw && raw.ok === true && keys.join(',') === 'ok') return { ok: true };
  if (
    'ok' in raw &&
    raw.ok === false &&
    'error' in raw &&
    typeof raw.error === 'string' &&
    raw.error.trim() &&
    keys.join(',') === 'error,ok'
  )
    return { ok: false, error: raw.error };
  return null;
}

async function readReply(response: FeedbackResponse, signal: AbortSignal): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) {
        cancel();
        return null;
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_FEEDBACK_REPLY_BYTES) {
        cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function outcome(response: FeedbackResponse, raw: unknown): FeedbackOutcome {
  const reply = parseReply(raw);
  if (!reply || (response.status === 200) !== reply.ok)
    return {
      status: 'malformed',
      message:
        'Splotch did not return a valid confirmation. Your report may have arrived. Check before sending again.',
    };
  if (reply.ok)
    return { status: 'success', message: 'Thank you. Your feedback was sent privately.' };
  if (response.status === 429) {
    const header = response.headers.get('Retry-After');
    const retryAfterSeconds =
      header && /^\d+$/.test(header)
        ? Math.min(Number(header), MAX_RETRY_AFTER_SECONDS)
        : DEFAULT_RETRY_AFTER_SECONDS;
    return {
      status: 'throttled',
      retryAfterSeconds,
      message: `Too many reports. Wait ${retryAfterSeconds} seconds before trying again.`,
    };
  }
  return { status: 'error', message: 'Could not send your feedback. Please try again later.' };
}

export async function sendFeedback(
  transport: FeedbackTransport,
  body: Readonly<ReportRequestBody>,
  controller: AbortController,
  isOffline: () => boolean
): Promise<FeedbackOutcome> {
  if (isOffline())
    return {
      status: 'offline',
      message: 'You are offline. Your draft is ready when you reconnect.',
    };
  let timedOut = false;
  let finishDeadline: (outcome: FeedbackOutcome) => void = () => {};
  const deadline = new Promise<FeedbackOutcome>((resolve) => {
    finishDeadline = resolve;
  });
  const cancel = () =>
    finishDeadline({
      status: 'cancelled',
      message: 'Sending stopped. Your report may have arrived. Check before sending again.',
    });
  controller.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    finishDeadline({
      status: 'timeout',
      message: 'Sending timed out. Your report may have arrived. Check before sending again.',
    });
    controller.abort();
  }, FEEDBACK_TIMEOUT_MS);
  try {
    const request = (async (): Promise<FeedbackOutcome> => {
      try {
        const response = await transport(body, controller.signal);
        const raw = await readReply(response, controller.signal);
        if (controller.signal.aborted)
          return {
            status: timedOut ? 'timeout' : 'cancelled',
            message: 'Sending stopped. Your report may have arrived. Check before sending again.',
          };
        return outcome(response, raw);
      } catch {
        return isOffline()
          ? {
              status: 'offline',
              message: 'You are offline. Your draft is ready when you reconnect.',
            }
          : {
              status: 'offline',
              message:
                'Could not connect. You may be offline. Your report may have arrived. Check before sending again.',
            };
      }
    })();
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', cancel);
  }
}
