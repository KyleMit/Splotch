import { isHttpError, json } from '@sveltejs/kit';
import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '$lib/errorLog';

export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  let body: Awaited<ReturnType<typeof readBodyWithinLimit>>;
  try {
    body = await readBodyWithinLimit(request, maxBytes);
  } catch (cause) {
    const tooLarge = asRecord(cause)?.status === 413;
    return {
      ok: false,
      response: fail(
        tooLarge ? 413 : 400,
        tooLarge ? 'Request body is too large' : 'Expected a JSON body'
      ),
    };
  }
  if (!body.ok) {
    return { ok: false, response: fail(413, 'Request body is too large') };
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return { ok: false, response: fail(400, 'Expected a JSON body') };
  }
}

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false };
  }

  const stream = request.body;
  if (!stream) return { ok: true, bytes: Buffer.alloc(0) };

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        // SvelteKit's Node adapter maps cancellation to socket destruction, which prevents the
        // caller's 413 from reaching the client. Releasing the lock stops pulls without retaining
        // the unread bytes; the API smoke test guards the chunked-request response.
        return { ok: false };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: true, bytes: Buffer.concat(chunks, totalBytes) };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringField(body: unknown, name: string): string {
  const v = asRecord(body)?.[name];
  return typeof v === 'string' ? v : '';
}

/**
 * The one throttling sentence a visitor ever sees. Exported so a rate-limited
 * form action — which returns `fail()` rather than a Response — words it
 * identically to every JSON endpoint.
 */
export function throttledMessage(retryAfter: number): string {
  return `Too many attempts. Please wait ${retryAfter}s.`;
}

export function fail(status: number, error: string, headers?: HeadersInit) {
  return json({ ok: false, error }, { status, headers });
}

/**
 * The one true 429. Every rate-limited endpoint returns this shape (JSON
 * `{ ok:false, error }` plus a `Retry-After` header) so clients can surface
 * the same `error` field they already read from other failure responses.
 */
export function throttled(retryAfter: number) {
  return fail(429, throttledMessage(retryAfter), { 'Retry-After': String(retryAfter) });
}

/**
 * Wraps an /api/* handler so every thrown failure leaves the wire as the same
 * canonical `{ ok:false, error }` body every returned failure uses. A thrown
 * SvelteKit `error()` keeps its status and message; an unexpected non-HttpError
 * becomes `fail(500, GENERIC_ERROR_MESSAGE)` — SvelteKit's `{ message }` shape
 * can't reach a client either way. Catching here bypasses hooks.server.ts's
 * handleError, whose console record is the only trace of an unexpected /api
 * failure, so the same-format log line is emitted here instead. csp-report is
 * the one unwrapped endpoint: its responses are deliberately bodyless
 * (browsers ignore them).
 */
export function apiHandler<Event extends { url: { pathname: string } }>(
  handler: (event: Event) => Response | Promise<Response>
): (event: Event) => Promise<Response> {
  return async (event) => {
    try {
      return await handler(event);
    } catch (cause) {
      if (isHttpError(cause)) return fail(cause.status, cause.body.message);
      console.error(ERROR_LOG_PREFIX.server, event.url.pathname, 500, cause);
      return fail(500, GENERIC_ERROR_MESSAGE);
    }
  };
}
