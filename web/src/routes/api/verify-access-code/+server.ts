import { json } from '@sveltejs/kit';
import { checkAccessToken } from '$lib/server/tokens';
import { peekRateLimit, rateLimit } from '$lib/server/rateLimit';
import { verifyAccessCodeBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { apiHandler, readJsonBody, stringField, throttled } from '$lib/server/http';
import {
  KEY_CHECK_UNAVAILABLE_CODE,
  type KeyCheckUnavailable,
  type VerifyAccessCodeRequestBody,
} from '$lib/ai/keyFormat';
import type { RequestHandler } from './$types';

export type VerifyAccessCodeResponse =
  { ok: true; accessCode: string } | { ok: false; error: string } | KeyCheckUnavailable;

// Access codes are short strings; the remainder is JSON framing headroom.
const MAX_VERIFY_ACCESS_CODE_BODY_BYTES = 8 * 1024;

// The code is typed into the field labelled as a key, and this is the answer
// /api/verify-key gives when its own check gets no answer.
const CHECK_UNAVAILABLE_MESSAGE = "We couldn't check that key just now. Please try again.";

/**
 * Verify a secret access code against the managed allowlist. This is the
 * "special access" path that lets a parent use AI on our own key instead of
 * bringing their own. Body: `VerifyAccessCodeRequestBody` ($lib/ai/keyFormat).
 * On a match we echo the code back as the canonical access code for the client
 * to persist. Returns { ok: true, accessCode } on a match, a 503 with
 * KEY_CHECK_UNAVAILABLE_CODE when the allowlist could not be read, or
 * { ok: false, error } otherwise.
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

  const parsed = await readJsonBody(request, MAX_VERIFY_ACCESS_CODE_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const code = stringField(parsed.body, 'code' satisfies keyof VerifyAccessCodeRequestBody).trim();
  if (!code) {
    return json(
      { ok: false, error: 'No access code provided' } satisfies VerifyAccessCodeResponse,
      { status: 400 }
    );
  }

  const access = await checkAccessToken(code);
  if (access.verdict === 'allowed') {
    return json({ ok: true, accessCode: code } satisfies VerifyAccessCodeResponse);
  }
  if (access.spendsGuess) rateLimit(key, rateLimitPolicy.verifyAccessCode);
  // An allowlist we could not read says nothing about the code, so it must not
  // come back as a wrong one (the same distinction /api/verify-key draws).
  if (access.verdict === 'unavailable') {
    return json(
      {
        ok: false,
        code: KEY_CHECK_UNAVAILABLE_CODE,
        error: CHECK_UNAVAILABLE_MESSAGE,
      } satisfies VerifyAccessCodeResponse,
      { status: 503 }
    );
  }
  return json({
    ok: false,
    error: 'That access code was not recognized.',
  } satisfies VerifyAccessCodeResponse);
});
