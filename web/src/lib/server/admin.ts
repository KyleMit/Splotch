import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rateLimit } from './rateLimit';
import { AI_ACCESS_TOKEN_PARAM } from '$lib/inviteLink';

// Shared admin-auth core used by both front doors into token management:
// the server-rendered /admin console (cookie session, form actions) and the
// JSON API under /api/admin (bearer session, used by the native apps, which
// ship as a static bundle with no server). Both validate the same secret and
// derive the same session token, so a session minted by either is honored by
// both — the only difference is the transport (HTTP-only cookie vs.
// Authorization header).

export const SESSION_LABEL = 'admin-session-v1';
const HMAC_ALG = 'sha256';

// The session credential is HMAC-SHA256(key = ADMIN_ACCESS_TOKEN,
// "admin-session-v1") rather than the secret verbatim. It's a deterministic,
// one-way function of the secret: the server can recompute and verify it on
// every request without any server-side session store, but an attacker who
// exfiltrates a session can't invert the HMAC to recover ADMIN_ACCESS_TOKEN.
// Bump the label to invalidate every outstanding session at once. If the
// secret is unset there is nothing to authenticate against, so the token is
// empty (and never matches).
export function sessionToken() {
  const secret = env.ADMIN_ACCESS_TOKEN;
  if (!secret) return '';
  return createHmac(HMAC_ALG, secret).update(SESSION_LABEL).digest('hex');
}

// Constant-time secret comparison. The length check happens first and is not
// itself a secret leak (an attacker already controls their own input length);
// timingSafeEqual then guards against byte-by-byte timing attacks on the value.
export function constantTimeEqual(provided: string | undefined, expected: string | undefined) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Whether `key` is the raw admin secret (the login check). */
export function verifyAdminSecret(key: string | undefined) {
  return constantTimeEqual(key, env.ADMIN_ACCESS_TOKEN);
}

// Both front doors throttle into this one bucket so an attacker can't double
// their guessing budget by alternating between the form action and the JSON
// endpoint.
const ADMIN_LOGIN_BUCKET = (ip: string) => `admin-login:${ip}`;

export type AdminLoginVerdict = { ok: true; session: string } | { ok: false; status: 403 };

export type AdminLoginAttempt =
  | { ok: false; status: 429; retryAfter: number }
  | { ok: true; verify: (key: string) => AdminLoginVerdict };

/**
 * The shared login sequence, split in two so the throttle can short-circuit an
 * unauthenticated request before its transport parses any payload: take the
 * bucket hit first, then `verify(key)` once the credential has been read.
 * Each transport maps the outcome onto its own response (cookie + redirect for
 * the /admin form action, JSON for /api/admin/login). One call spends one hit,
 * whether or not `verify` is reached.
 */
export function beginAdminLogin(ip: string): AdminLoginAttempt {
  const { limited, retryAfter } = rateLimit(ADMIN_LOGIN_BUCKET(ip));
  if (limited) return { ok: false, status: 429, retryAfter };
  return {
    ok: true,
    verify: (key: string) =>
      verifyAdminSecret(key) ? { ok: true, session: sessionToken() } : { ok: false, status: 403 },
  };
}

/** Whether `token` is a currently valid derived session token. */
export function verifySessionToken(token: string | undefined) {
  return constantTimeEqual(token, sessionToken());
}

const BEARER_PREFIX = 'Bearer ';

/** Extract the bearer token from an `Authorization: Bearer <token>` header, or '' if absent/malformed. */
export function bearerToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith(BEARER_PREFIX) ? auth.slice(BEARER_PREFIX.length).trim() : '';
}

/** Pair each access token with the invite URL an admin hands out. */
export function buildInvites(tokens: string[], origin: string) {
  return tokens.map((token) => ({
    token,
    url: `${origin}/?${AI_ACCESS_TOKEN_PARAM}=${encodeURIComponent(token)}`,
  }));
}
