import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Shared admin-auth core used by both front doors into token management:
// the server-rendered /admin console (cookie session, form actions) and the
// JSON API under /api/admin (bearer session, used by the native apps, which
// ship as a static bundle with no server). Both validate the same secret and
// derive the same session token, so a session minted by either is honored by
// both — the only difference is the transport (HTTP-only cookie vs.
// Authorization header).

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
  return createHmac('sha256', secret).update('admin-session-v1').digest('hex');
}

// Constant-time secret comparison. The length check happens first and is not
// itself a secret leak (an attacker already controls their own input length);
// timingSafeEqual then guards against byte-by-byte timing attacks on the value.
export function secretMatches(provided: string | undefined, expected: string | undefined) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Whether `key` is the raw admin secret (the login check). */
export function verifyAdminSecret(key: string | undefined) {
  return secretMatches(key, env.ADMIN_ACCESS_TOKEN);
}

/** Whether `token` is a currently valid derived session token. */
export function verifySessionToken(token: string | undefined) {
  return secretMatches(token, sessionToken());
}

/** Pair each access token with the invite URL an admin hands out. */
export function buildInvites(tokens: string[], origin: string) {
  return tokens.map((token) => ({
    token,
    url: `${origin}/?ai_access_token=${encodeURIComponent(token)}`
  }));
}
