import { json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { verifyKeyBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { apiHandler, asRecord, readJsonBody, throttled } from '$lib/server/http';
import { aiProvider } from '$lib/server/ai/provider';
import { KEY_CHECK_UNAVAILABLE_CODE, type KeyCheckUnavailable } from '$lib/ai/keyFormat';
import type { RequestHandler } from './$types';

export type VerifyKeyResponse = { ok: true } | { ok: false; error: string } | KeyCheckUnavailable;

/**
 * Confirm a parent-supplied OpenAI API key actually works by making a tiny
 * live call. Body: { apiKey }. Returns { ok: true } on success, or
 * { ok: false, error } when the key can't authenticate.
 */
export const POST: RequestHandler = apiHandler(async ({ request, getClientAddress }) => {
  // Same throttle as verify-access-code: a live model call per request makes
  // this worth guarding against rapid repeated probes from one client.
  const { limited, retryAfter } = rateLimit(
    verifyKeyBucket(getClientAddress()),
    rateLimitPolicy.verifyKey
  );
  if (limited) return throttled(retryAfter);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return json({ ok: false, error: 'No API key provided' } satisfies VerifyKeyResponse, {
      status: 400,
    });
  }

  const check = await aiProvider.verifyKey(apiKey);
  if (!check.ok) {
    console.warn(`[verify-key] ${check.kind}: ${check.reason}`);
    // Only OpenAI can say a key is bad. A check that never got an answer —
    // a cold start outrunning the deadline is the observed case — must not be
    // reported as one, or a parent is told a working credential is invalid and
    // goes off to make another one.
    if (check.kind === 'unreachable') {
      return json(
        {
          ok: false,
          code: KEY_CHECK_UNAVAILABLE_CODE,
          error: "We couldn't check that key just now. Please try again.",
        } satisfies KeyCheckUnavailable,
        { status: 503 }
      );
    }
    return json({
      ok: false,
      error: 'That key could not authenticate with OpenAI.',
    } satisfies VerifyKeyResponse);
  }

  return json({ ok: true } satisfies VerifyKeyResponse);
});
