import { isHttpError, json } from '@sveltejs/kit';

export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: await request.json() };
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

  // Content-Length is only an early-rejection hint: raw byte length remains
  // authoritative when the header is absent or dishonest, including for multibyte text.
  const bytes = Buffer.from(await request.arrayBuffer());
  return bytes.byteLength > maxBytes ? { ok: false } : { ok: true, bytes };
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
 * Wraps an /api/* handler so a thrown SvelteKit `error()` leaves the wire as
 * the same canonical `{ ok:false, error }` body every returned failure uses —
 * throw-based control flow inside a route can't reintroduce SvelteKit's
 * `{ message }` shape. A non-HttpError still propagates to SvelteKit's
 * unexpected-error path (500 + handleError). csp-report is the one unwrapped
 * endpoint: its responses are deliberately bodyless (browsers ignore them).
 */
export function apiHandler<Event>(
  handler: (event: Event) => Response | Promise<Response>
): (event: Event) => Promise<Response> {
  return async (event) => {
    try {
      return await handler(event);
    } catch (cause) {
      if (isHttpError(cause)) return fail(cause.status, cause.body.message);
      throw cause;
    }
  };
}
