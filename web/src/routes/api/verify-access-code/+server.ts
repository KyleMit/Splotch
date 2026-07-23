import { json } from '@sveltejs/kit';
import { isAllowedToken } from '$lib/server/tokens';
import { peekRateLimit, rateLimit } from '$lib/server/rateLimit';
import { readJsonBody, throttled } from '$lib/server/http';
import type { RequestHandler } from './$types';

/**
 * Verify a secret access code against the managed allowlist. This is the
 * "special access" path that lets a parent use AI on our Gemini key instead of
 * bringing their own. Body: { code }. On a match we echo the code back as the
 * canonical access code for the client to persist. Returns { ok: true, accessCode }
 * on a match, or { ok: false, error } otherwise.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // This endpoint is an unauthenticated oracle for guessing allowlisted tokens,
  // so it shares generate-image's per-IP guess budget and throttles only its
  // failure path (ADR-0014): peek before checking the code — a limited IP gets a
  // blind 429 with no oracle answer — then charge the bucket only on a failed
  // guess, so valid families behind one NAT never spend it.
  const key = `verify-access-code:${getClientAddress()}`;
  const guess = peekRateLimit(key);
  if (guess.limited) return throttled(guess.retryAfter);

  const body = await readJsonBody(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return json({ ok: false, error: 'No access code provided' });

  if (!(await isAllowedToken(code))) {
    rateLimit(key);
    return json({ ok: false, error: 'That access code was not recognized.' });
  }
  return json({ ok: true, accessCode: code });
};
