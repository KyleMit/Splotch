import { error, fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { timingSafeEqual } from 'node:crypto';
import { getTokens, addToken, removeToken } from '$lib/server/tokens.js';
import { rateLimit } from '$lib/server/rateLimit.js';

// Must be server-rendered: it has form actions and validates the admin secret
// against an HTTP-only session cookie, neither of which is compatible with the
// site-wide prerender.
export const prerender = false;
export const ssr = true;

// The admin secret lives in an HTTP-only cookie set by the `login` action. It
// never travels in the URL, so it can't leak into browser history, server/CDN
// logs, or Referer headers. The cookie is scoped to /admin and lives ~10 years
// — effectively permanent — and is renewed on every authenticated load so it
// slides forward and never lapses while in use. The logout button is the
// explicit way to clear it.
const SESSION_COOKIE = 'admin_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10;

function setSession(cookies) {
  cookies.set(SESSION_COOKIE, env.ADMIN_ACCESS_TOKEN, {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE
  });
}

// Constant-time secret comparison. The length check happens first and is not
// itself a secret leak (an attacker already controls their own input length);
// timingSafeEqual then guards against byte-by-byte timing attacks on the value.
function secretMatches(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Single source of truth for "is this an authenticated admin request?" — used
// by the loader and every mutating action so the check isn't duplicated.
function isAdmin(cookies) {
  return secretMatches(cookies.get(SESSION_COOKIE), env.ADMIN_ACCESS_TOKEN);
}

function requireAdmin(cookies) {
  if (!isAdmin(cookies)) throw error(403, 'Forbidden');
}

function buildInvites(tokens, origin) {
  return tokens.map((token) => ({
    token,
    url: `${origin}/?ai_access_token=${encodeURIComponent(token)}`
  }));
}

export async function load({ cookies, url }) {
  // `hasSession` just reports whether an admin_session cookie is present (valid
  // or not). The client uses it only to decide whether to keep the public
  // /admin link visible in the About tab — it's not a security signal, so a
  // stale/invalid cookie still counts as "this user found their way in".
  const hasSession = Boolean(cookies.get(SESSION_COOKIE));

  // Unauthenticated visitors get the login form instead of a 403, so the page
  // is usable without ever putting the secret in a link.
  if (!isAdmin(cookies)) {
    return { authed: false, hasSession };
  }
  // Renew the session on each authenticated load so its expiry keeps sliding
  // forward — an actively-used admin never has to log in again.
  setSession(cookies);
  const tokens = await getTokens();
  return {
    authed: true,
    hasSession,
    invites: buildInvites(tokens, url.origin)
  };
}

export const actions = {
  login: async ({ request, cookies, getClientAddress }) => {
    // Throttle per IP: this is an unauthenticated oracle for guessing the admin
    // secret, so cap brute-force bursts before checking the key — the same
    // limiter the AI credential-verification endpoints use.
    const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
    if (limited) {
      return fail(429, { loginError: `Too many attempts. Please wait ${retryAfter}s.` });
    }

    const form = await request.formData();
    const key = String(form.get('access-key') ?? '');
    if (!secretMatches(key, env.ADMIN_ACCESS_TOKEN)) {
      return fail(403, { loginError: 'Incorrect access key.' });
    }
    setSession(cookies);
    throw redirect(303, '/admin');
  },
  logout: async ({ cookies }) => {
    cookies.delete(SESSION_COOKIE, { path: '/admin' });
    throw redirect(303, '/admin');
  },
  add: async ({ request, cookies }) => {
    requireAdmin(cookies);
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    const result = await addToken(token);
    if (!result.ok) return fail(400, { error: result.error });
    return { success: true, message: `Added “${token}”` };
  },
  remove: async ({ request, cookies }) => {
    requireAdmin(cookies);
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    await removeToken(token);
    return { success: true, message: `Removed “${token}”` };
  }
};
