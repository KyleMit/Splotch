import { json } from '@sveltejs/kit';
import { isAllowedToken } from '$lib/server/tokens';
import { peekRateLimit, rateLimit } from '$lib/server/rateLimit';
import { verifyAccessCodeBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { apiHandler, asRecord, readJsonBody, throttled } from '$lib/server/http';
import type { RequestHandler } from './$types';

export type VerifyAccessCodeResponse =
  { ok: true; accessCode: string } | { ok: false; error: string };

/**
 * Verify a secret access code against the managed allowlist. This is the
 * "special access" path that lets a parent use AI on our own key instead of
 * bringing their own. Body: { code }. On a match we echo the code back as the
 * canonical access code for the client to persist. Returns { ok: true, accessCode }
 * on a match, or { ok: false, error } otherwise.
 */
export const POST: RequestHandler = apiHandler(async ({ request, getClientAddress }) => {
  // This endpoint is an unauthenticated oracle for guessing allowlisted tokens,
  // so it shares generate-image's per-IP guess budget and throttles only its
  // failure path (ADR-0014): peek before checking the code — a limited IP gets a
  // blind 429 with no oracle answer — then charge the bucket only on a failed
  // guess, so valid families behind one NAT never spend it.
  const key = verifyAccessCodeBucket(getClientAddress());
  const guess = peekRateLimit(key, rateLimitPolicy.verifyAccessCode);
  if (guess.limited) return throttled(guess.retryAfter);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) {
    return json(
      { ok: false, error: 'No access code provided' } satisfies VerifyAccessCodeResponse,
      { status: 400 }
    );
  }

  if (!(await isAllowedToken(code))) {
    rateLimit(key, rateLimitPolicy.verifyAccessCode);
    return json({
      ok: false,
      error: 'That access code was not recognized.',
    } satisfies VerifyAccessCodeResponse);
  }
  return json({ ok: true, accessCode: code } satisfies VerifyAccessCodeResponse);
});
