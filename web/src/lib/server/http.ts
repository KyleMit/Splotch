import { error, json } from '@sveltejs/kit';

export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Parse a JSON request body, turning a malformed payload into a uniform
 * 400 instead of an unhandled 500.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
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

/**
 * The one true 429. Every rate-limited endpoint returns this shape (JSON
 * `{ ok:false, error }` plus a `Retry-After` header) so clients can surface
 * the same `error` field they already read from other failure responses.
 */
export function throttled(retryAfter: number) {
  return json(
    { ok: false, error: throttledMessage(retryAfter) },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
