import { error, json } from '@sveltejs/kit';
import { isAllowedToken } from '$lib/server/tokens.js';
import { rateLimit } from '$lib/server/rateLimit.js';

/**
 * Verify a secret access code against the managed allowlist. This is the
 * "special access" path that lets a parent use AI on our Gemini key instead of
 * bringing their own. Body: { code }. On a match we echo the code back as the
 * canonical access code for the client to persist. Returns { ok, accessCode? }.
 */
export async function POST({ request, getClientAddress }) {
  // Throttle per IP: this endpoint is an unauthenticated oracle for guessing
  // allowlisted tokens, so cap brute-force bursts before checking the code.
  const { limited, retryAfter } = rateLimit(`verify-access-code:${getClientAddress()}`);
  if (limited) {
    return json(
      { ok: false, error: 'Too many attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return json({ ok: false });

  const ok = await isAllowedToken(code);
  return ok ? json({ ok: true, accessCode: code }) : json({ ok: false });
}
