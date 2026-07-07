import { json } from '@sveltejs/kit';
import { isAllowedToken } from '$lib/server/tokens';
import { rateLimit } from '$lib/server/rateLimit';
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
  // Throttle per IP: this endpoint is an unauthenticated oracle for guessing
  // allowlisted tokens, so cap brute-force bursts before checking the code.
  const { limited, retryAfter } = rateLimit(`verify-access-code:${getClientAddress()}`);
  if (limited) return throttled(retryAfter);

  const body = await readJsonBody(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return json({ ok: false, error: 'No access code provided' });

  const ok = await isAllowedToken(code);
  return ok
    ? json({ ok: true, accessCode: code })
    : json({ ok: false, error: 'That access code was not recognized.' });
};
