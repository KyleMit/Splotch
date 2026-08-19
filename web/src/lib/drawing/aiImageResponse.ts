import { FREE_DAILY_LIMIT_EXHAUSTED_CODE, FREE_GRANT_EXHAUSTED_CODE } from '$lib/freeGenerations';
import { GENERATION_UNAVAILABLE_CODE } from '$lib/ai/generationResult';

export type AiImageResponse =
  | { kind: 'image'; blob: Blob }
  /** Accepted, finishing in the background — collect it from /api/generation-result. */
  | { kind: 'started'; jobId: string; pollAfterMs: number }
  /** Not finished yet, or not readable just now. Only a poll sees this. */
  | { kind: 'pending' }
  | { kind: 'safety' }
  | { kind: 'throttled'; retryAfter: string | null; detail: string }
  | { kind: 'free-exhausted' }
  | { kind: 'free-unavailable' }
  | { kind: 'error'; status: number; detail: string };

// A safety refusal tells the child to try a different drawing, unlike a retryable upstream failure.
// The distinct status is part of the red-team safety contract in ADR-0023.
export const SAFETY_REFUSAL_STATUS = 422;
export const THROTTLED_STATUS = 429;
const ACCEPTED_STATUS = 202;

async function readStarted(
  response: Response
): Promise<Extract<AiImageResponse, { kind: 'started' }> | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const jobId = 'jobId' in body ? body.jobId : null;
    const pollAfterMs = 'pollAfterMs' in body ? body.pollAfterMs : null;
    if (typeof jobId !== 'string' || !jobId) return null;
    return {
      kind: 'started',
      jobId,
      pollAfterMs: typeof pollAfterMs === 'number' && pollAfterMs >= 0 ? pollAfterMs : 0,
    };
  } catch {
    return null;
  }
}

async function readError(response: Response): Promise<{ detail: string; code: string | null }> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { detail: '', code: null };
  }

  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && !Array.isArray(body) && 'error' in body) {
      const error = body.error;
      const code = 'code' in body && typeof body.code === 'string' ? body.code : null;
      if (typeof error === 'string') return { detail: error, code };
    }
  } catch {
    // The raw body below is the fallback for non-JSON error responses.
  }
  return { detail: text, code: null };
}

export async function readAiImageResponse(response: Response): Promise<AiImageResponse> {
  // 202 is inside `response.ok`, so it has to be taken first — otherwise a job
  // ticket is read as an image and the child is shown an empty picture. The
  // start endpoint answers it with a job to collect; a poll answers it with
  // nothing, meaning "not yet".
  if (response.status === ACCEPTED_STATUS) {
    const started = await readStarted(response);
    return started ?? { kind: 'pending' };
  }
  if (response.ok) return { kind: 'image', blob: await response.blob() };

  const { detail, code } = await readError(response);
  // The store could not be read; the job is very likely still there and
  // finished. Waiting is what the code exists to make safe — abandoning here
  // throws away a picture that has already been paid for.
  if (code === GENERATION_UNAVAILABLE_CODE) return { kind: 'pending' };
  if (code === FREE_GRANT_EXHAUSTED_CODE) return { kind: 'free-exhausted' };
  if (code === FREE_DAILY_LIMIT_EXHAUSTED_CODE) return { kind: 'free-unavailable' };
  if (response.status === SAFETY_REFUSAL_STATUS) return { kind: 'safety' };
  if (response.status === THROTTLED_STATUS) {
    return {
      kind: 'throttled',
      retryAfter: response.headers.get('Retry-After'),
      detail,
    };
  }
  return { kind: 'error', status: response.status, detail };
}
