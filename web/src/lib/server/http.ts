import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '../errorLog';
import { loggableFailure } from './logRedaction';

// The response and error helpers the /api endpoints used to take from @sveltejs/kit, byte for
// byte: installed native builds read these answers, and tools/api-smoke/tests/wire-diff.test.mjs
// holds them to the ones SvelteKit gave.

const MIN_ERROR_STATUS = 400;
const MAX_ERROR_STATUS = 599;

const encoder = new TextEncoder();

/** What `error()` throws. Not an Error, as SvelteKit's was not: it is an answer, not a fault. */
class HttpError {
  readonly status: number;
  readonly body: { message: string };

  constructor(status: number, message: string) {
    this.status = status;
    this.body = { message };
  }

  toString(): string {
    return JSON.stringify(this.body);
  }
}

/** Ends the handler with an HTTP error answer: apiHandler sends it as `{ ok:false, error }`. */
export function error(status: number, message: string): never {
  if (Number.isNaN(status) || status < MIN_ERROR_STATUS || status > MAX_ERROR_STATUS) {
    throw new Error(
      `HTTP error status codes must be between ${MIN_ERROR_STATUS} and ${MAX_ERROR_STATUS} — ${status} is invalid`
    );
  }
  throw new HttpError(status, message);
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

function withContentLength(init: ResponseInit | undefined, bytes: Uint8Array): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-length')) headers.set('content-length', String(bytes.byteLength));
  return headers;
}

/** A JSON response, with the `Content-Length` and `Content-Type` SvelteKit's `json()` set. */
export function json(data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data);
  const headers = withContentLength(init, encoder.encode(body));
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(body, { ...init, headers });
}

/** A plain-text response with a `Content-Length` and, as SvelteKit's `text()`, no `Content-Type`. */
export function text(body: string, init?: ResponseInit): Response {
  const bytes = encoder.encode(body);
  return new Response(bytes, { ...init, headers: withContentLength(init, bytes) });
}

export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

type BodyRejection = { ok: false; reason: 'too-large' | 'malformed' };

const BODY_TOO_LARGE_MESSAGE = 'Request body is too large';

// A stream that errors is a malformed body, unless the platform's own body cap
// raised it: that is the same too-large answer the caller's cap would give.
async function readBoundedBody(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; bytes: Buffer } | BodyRejection> {
  try {
    const body = await readBodyWithinLimit(request, maxBytes);
    return body.ok ? body : { ok: false, reason: 'too-large' };
  } catch (cause) {
    return { ok: false, reason: asRecord(cause)?.status === 413 ? 'too-large' : 'malformed' };
  }
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) {
    return {
      ok: false,
      response:
        body.reason === 'too-large'
          ? fail(413, BODY_TOO_LARGE_MESSAGE)
          : fail(400, 'Expected a JSON body'),
    };
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return { ok: false, response: fail(400, 'Expected a JSON body') };
  }
}

/**
 * The bounded `request.formData()`, which would otherwise buffer whatever the
 * client sends: a form action has no body cap of its own on Netlify. Callers
 * map each rejection themselves, since a form action answers with `fail()` and
 * an endpoint with a Response; the actions share `unreadableFormBody`.
 */
export async function readFormBody(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; form: FormData } | BodyRejection> {
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) return body;

  try {
    // Re-parses the bytes already bounded; `request.formData()` would read the
    // stream a second time. Copied into a plain Uint8Array and wrapped as a
    // Blob: the ambient BodyInit union takes no typed array, and Buffer's
    // ArrayBufferLike is not a BlobPart. The copy is at most `maxBytes`.
    const form = await new Response(new Blob([new Uint8Array(body.bytes)]), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/** A form action's answer to a body `readFormBody` refused, worded as `readJsonBody`'s. */
export function unreadableFormBody(reason: BodyRejection['reason']) {
  return reason === 'too-large'
    ? ({ status: 413, message: BODY_TOO_LARGE_MESSAGE } as const)
    : ({ status: 400, message: 'Expected a form body' } as const);
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

/** `stringField` for a form: a file part or a missing field reads as empty. */
export function formStringField(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
}

/**
 * The one throttling sentence a visitor ever sees. Exported so a rate-limited
 * form action — which returns `fail()` rather than a Response — words it
 * identically to every JSON endpoint.
 */
function throttledMessage(retryAfter: number): string {
  return `Too many attempts. Please wait ${retryAfter}s.`;
}

export function fail(status: number, message: string, headers?: HeadersInit) {
  return json({ ok: false, error: message }, { status, headers });
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
 * `error()` keeps its status and message; anything else becomes
 * `fail(500, GENERIC_ERROR_MESSAGE)`, logged in the `[server error]` format
 * SvelteKit's handleError used, since that line is the only trace of an
 * unexpected /api failure. csp-report is
 * the one unwrapped endpoint: its responses are deliberately bodyless
 * (browsers ignore them). eslint.config.js's API_HANDLER_WRAPPED rejects any
 * other /api method handler exported without this wrapper.
 */
export function apiHandler<Event extends { url: { pathname: string } }>(
  handler: (event: Event) => Response | Promise<Response>
): (event: Event) => Promise<Response> {
  return async (event) => {
    try {
      return await handler(event);
    } catch (cause) {
      if (isHttpError(cause)) return fail(cause.status, cause.body.message);
      console.error(ERROR_LOG_PREFIX.server, event.url.pathname, 500, loggableFailure(cause));
      return fail(500, GENERIC_ERROR_MESSAGE);
    }
  };
}
