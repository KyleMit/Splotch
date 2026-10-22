import { NETWORK_ERROR_MESSAGE } from '../lib/latestRequest';
import type { ReportRequestBody } from './report';

export const FEEDBACK_PATH = '/api/report';
export const FEEDBACK_URL = `https://splotch.art${FEEDBACK_PATH}`;
export const MAX_FEEDBACK_REPLY_BYTES = 8192;
export const FEEDBACK_UNKNOWN_DELIVERY_NOTICE =
  'Splotch may already have received it. Sending again could send it twice.';

type FeedbackResponse = {
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
  | { status: 'connection' | 'malformed' | 'error' | 'cancelled'; message: string };

function parseReply(raw: unknown): { ok: true } | { ok: false; error: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if ('ok' in raw && raw.ok === true) return { ok: true };
  if ('error' in raw && typeof raw.error === 'string') return { ok: false, error: raw.error };
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
  const successful = response.status >= 200 && response.status < 300;
  if (successful && reply?.ok) return { status: 'success', message: 'Thanks for your feedback.' };
  if (!reply) return { status: 'malformed', message: 'Could not read the server response.' };
  return {
    status: 'error',
    message: reply.ok ? 'Could not send your report. Please try again.' : reply.error,
  };
}

export async function sendFeedback(
  transport: FeedbackTransport,
  body: Readonly<ReportRequestBody>,
  controller: AbortController
): Promise<FeedbackOutcome> {
  let finishCancellation: (outcome: FeedbackOutcome) => void = () => {};
  const cancellation = new Promise<FeedbackOutcome>((resolve) => {
    finishCancellation = resolve;
  });
  const cancel = () =>
    finishCancellation({
      status: 'cancelled',
      message: `Sending stopped. ${FEEDBACK_UNKNOWN_DELIVERY_NOTICE}`,
    });
  controller.signal.addEventListener('abort', cancel, { once: true });
  if (controller.signal.aborted) cancel();
  try {
    const request = (async (): Promise<FeedbackOutcome> => {
      try {
        const response = await transport(body, controller.signal);
        return outcome(response, await readReply(response, controller.signal));
      } catch {
        return { status: 'connection', message: NETWORK_ERROR_MESSAGE };
      }
    })();
    return await Promise.race([request, cancellation]);
  } finally {
    controller.signal.removeEventListener('abort', cancel);
  }
}
