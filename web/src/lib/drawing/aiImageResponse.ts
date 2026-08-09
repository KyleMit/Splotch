import { FREE_GRANT_EXHAUSTED_CODE } from '$lib/freeGenerations';

export type AiImageResponse =
  | { kind: 'image'; blob: Blob }
  | { kind: 'safety' }
  | { kind: 'throttled'; retryAfter: string | null; detail: string }
  | { kind: 'free-exhausted'; detail: string }
  | { kind: 'error'; status: number; detail: string };

const SAFETY_REFUSAL_STATUS = 422;
const THROTTLED_STATUS = 429;

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
  if (response.ok) return { kind: 'image', blob: await response.blob() };

  const { detail, code } = await readError(response);
  if (code === FREE_GRANT_EXHAUSTED_CODE) return { kind: 'free-exhausted', detail };
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
