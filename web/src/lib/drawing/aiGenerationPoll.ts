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
 * One signal that fires on either the caller giving up or the deadline passing,
 * composed by hand because `AbortSignal.any` is above the supported floor
 * (Safari 17.4; docs/COMPATIBILITY.md).
 *
 * It has to reach the poll requests, not only the sleeps between them. Checking
 * a clock before each await bounds nothing: the check happens, the fetch is
 * issued, and if that request never settles the loop never reaches the clock
 * again. `generateAiImage` has already cleared its own request timer by then —
 * the job ticket arrived — so nothing else is watching either, and the wait
 * lasts as long as the socket does.
 */
function untilAbortedOrExpired(caller: AbortSignal, ms: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(caller.reason);
  const timer = setTimeout(() => controller.abort(EXPIRED), ms);

  if (caller.aborted) onAbort();
  else caller.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      caller.removeEventListener('abort', onAbort);
    },
  };
}

/** Distinguishes our own deadline from the caller closing the modal. */
const EXPIRED = new DOMException('Generation deadline passed', 'TimeoutError');

/**
 * Poll until the job settles, the caller aborts, or we give up waiting.
 * `fetchResult` is injected so the loop can be tested without a network; it is
 * handed the deadline-aware signal rather than the caller's, so a request that
 * never answers is still bounded.
 */
export async function awaitGeneration(
  jobId: string,
  pollAfterMs: number,
  signal: AbortSignal,
  deps: {
    fetchResult: (jobId: string, signal: AbortSignal) => Promise<Response>;
  }
): Promise<SettledGeneration> {
  const bounded = untilAbortedOrExpired(signal, GENERATION_POLL_TIMEOUT_MS);

  try {
    let wait = pollAfterMs;
    while (true) {
      await sleep(wait, bounded.signal);

      let settled: AiImageResponse;
      try {
        settled = await readAiImageResponse(await deps.fetchResult(jobId, bounded.signal));
      } catch (cause) {
        // An abort is either the caller closing the modal or our own deadline,
        // and neither may be swallowed into a retry. Anything else is one bad
        // poll on a job that is probably still running, so keep waiting rather
        // than discarding a paid picture.
        if (isAbort(cause)) throw cause;
        settled = { kind: 'pending' };
      }

      // A throttled poll is the app asking too often, not the picture failing.
      // Ending the wait here abandons a finished, paid generation and sends the
      // child back to the button to buy another one.
      if (settled.kind === 'throttled') {
        wait = Math.max(GENERATION_POLL_INTERVAL_MS, Number(settled.retryAfter) * 1000 || 0);
        continue;
      }
      if (settled.kind !== 'pending' && settled.kind !== 'started') return settled;
      wait = GENERATION_POLL_INTERVAL_MS;
    }
  } catch (cause) {
    // Our deadline is an outcome the child is shown; the caller's abort is the
    // child having already walked away, and stays an exception.
    if (isAbort(cause) && !signal.aborted) return timedOut();
    throw cause;
  } finally {
    bounded.dispose();
  }
}

const isAbort = (cause: unknown) =>
  cause instanceof DOMException && (cause.name === 'AbortError' || cause.name === 'TimeoutError');

export function generationResultUrl(jobId: string): string {
  return `${apiUrl('/api/generation-result')}?job=${encodeURIComponent(jobId)}`;
}
