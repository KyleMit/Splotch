import { apiUrl } from '$lib/api';
import { GENERATION_POLL_INTERVAL_MS, GENERATION_POLL_TIMEOUT_MS } from '$lib/ai/limits';
import { readAiImageResponse, type AiImageResponse } from './aiImageResponse';

// Collecting a generation the server handed to its background worker (ADR-0115).
//
// The wait is no longer bounded by a platform ceiling but by how long a child
// should be left looking at a spinner, so the loop's own timeout is the real
// deadline and it reports a timeout as retryable — the same drawing on the same
// endpoint may well work.

/** Terminal outcomes only: the two waiting states never leave this module. */
export type SettledGeneration = Exclude<AiImageResponse, { kind: 'started' } | { kind: 'pending' }>;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });

const timedOut = (): SettledGeneration => ({
  // A 5xx is what the client already routes to its kid-friendly "let's try
  // again", which is the right offer here: the picture didn't arrive, and the
  // same drawing is worth another go.
  kind: 'error',
  status: 504,
  detail: 'The creation did not arrive in time',
});

/**
 * Poll until the job settles, the caller aborts, or we give up waiting.
 * `fetchResult` is injected so the loop can be tested without a network.
 */
export async function awaitGeneration(
  jobId: string,
  pollAfterMs: number,
  signal: AbortSignal,
  deps: {
    fetchResult: (jobId: string) => Promise<Response>;
    now?: () => number;
  }
): Promise<SettledGeneration> {
  const now = deps.now ?? (() => Date.now());
  const giveUpAt = now() + GENERATION_POLL_TIMEOUT_MS;

  let wait = pollAfterMs;
  while (true) {
    await sleep(wait, signal);
    if (now() >= giveUpAt) return timedOut();

    let settled: AiImageResponse;
    try {
      settled = await readAiImageResponse(await deps.fetchResult(jobId));
    } catch (cause) {
      // An abort is the caller closing the modal, and must not be swallowed
      // into a retry. Anything else is one bad poll on a job that is probably
      // still running, so keep waiting rather than discarding a paid picture.
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      settled = { kind: 'pending' };
    }

    if (settled.kind !== 'pending' && settled.kind !== 'started') return settled;
    wait = GENERATION_POLL_INTERVAL_MS;
  }
}

export function generationResultUrl(jobId: string): string {
  return `${apiUrl('/api/generation-result')}?job=${encodeURIComponent(jobId)}`;
}
