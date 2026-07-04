import { error, json } from '@sveltejs/kit';

/**
 * Parse a JSON request body, turning a malformed payload into a uniform
 * 400 instead of an unhandled 500. The loose return type matches how
 * endpoints probe fields (`typeof body?.x === 'string'`) — a JSON primitive
 * or array simply yields no matching fields.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }
}

/**
 * The one true 429. Every rate-limited endpoint returns this shape (JSON
 * `{ ok:false, error }` plus a `Retry-After` header) so clients can surface
 * the same `error` field they already read from other failure responses.
 */
export function throttled(retryAfter: number) {
  return json(
    { ok: false, error: `Too many attempts. Please wait ${retryAfter}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
