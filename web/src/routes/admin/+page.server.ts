import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import { sessionToken, beginAdminLogin, verifySessionToken, buildInvites } from '$lib/server/admin';
import { throttledMessage } from '$lib/server/http';
import { getTokensStatus, addToken, removeToken } from '$lib/server/tokens';
import type { MutationResult } from '$lib/server/tokens';
import { getUsage } from '$lib/server/usage';
import { ASSUME_PERSISTENT } from '$lib/adminFormat';
import type { Actions, PageServerLoad } from './$types';

// Must be server-rendered: it has form actions and validates the admin secret
// against an HTTP-only session cookie, neither of which is compatible with the
// site-wide prerender. The auth core (secret check, derived session token,
// invite building) lives in $lib/server/admin so the /api/admin endpoints the
// native apps use share the exact same logic — this page just binds it to a
// cookie instead of a bearer header.
export const prerender = false;
export const ssr = true;

// A *derived* session token lives in an HTTP-only cookie set by the `login`
// action — never the raw secret itself. It never travels in the URL, so it
// can't leak into browser history, server/CDN logs, or Referer headers. The
// cookie is scoped to /admin and lives ~10 years — effectively permanent — and
// is renewed on every authenticated load so it slides forward and never lapses
// while in use. The logout button is the explicit way to clear it.
const SESSION_COOKIE = 'admin_session';
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 365 * 10;

function setSession(cookies: Cookies) {
  cookies.set(SESSION_COOKIE, sessionToken(), {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_S,
  });
}

// Single source of truth for "is this an authenticated admin request?" — used
// by the loader and every mutating action so the check isn't duplicated. The
// cookie holds the derived session token, so we compare against the recomputed
// token (constant-time) rather than the raw secret.
function isAdmin(cookies: Cookies) {
  return verifySessionToken(cookies.get(SESSION_COOKIE));
}

function requireAdmin(cookies: Cookies) {
  if (!isAdmin(cookies)) throw error(403, 'Forbidden');
}

export const load: PageServerLoad = async ({ cookies, url }) => {
  // `hasSession` just reports whether an admin_session cookie is present (valid
  // or not). The client uses it only to decide whether to keep the public
  // /admin link visible in the About tab — it's not a security signal, so a
  // stale/invalid cookie still counts as "this user found their way in".
  const hasSession = Boolean(cookies.get(SESSION_COOKIE));

  // Unauthenticated visitors get the login form instead of a 403, so the page
  // is usable without ever putting the secret in a link.
  if (!isAdmin(cookies)) {
    // `invites` is always present (empty here) so the page's union type stays
    // simple — the invites section only renders in the authed branch anyway.
    return {
      authed: false,
      hasSession,
      persistent: ASSUME_PERSISTENT,
      invites: [] as { token: string; url: string }[],
    };
  }
  // Renew the session on each authenticated load so its expiry keeps sliding
  // forward — an actively-used admin never has to log in again.
  setSession(cookies);
  const { tokens, persistent } = await getTokensStatus();
  // Pair each invite with its generation tally (web admin only — the native
  // /api/admin/tokens snapshot doesn't carry usage, so AdminConsole renders
  // the stats only when `usage` is present). `usage[token] ?? null` keeps the
  // field always-defined here so the component can tell "never used" (null)
  // apart from "usage unavailable" (undefined, the native case).
  const usage = await getUsage(tokens);
  const invites = buildInvites(tokens, url.origin).map((invite) => ({
    ...invite,
    usage: usage[invite.token] ?? null,
  }));
  return { authed: true, hasSession, persistent, invites };
};

// The `add`/`remove` actions differ only in which core mutation they call and
// how they word success, so they share one body. The status mapping mirrors
// /api/admin/tokens' mutationError: a caller-fault validation failure is 400, a
// transient CAS conflict is 409 so both front doors answer the same underlying
// error the same way.
async function tokenMutation(
  cookies: Cookies,
  request: Request,
  op: (token: string) => Promise<MutationResult>,
  verb: 'Added' | 'Removed'
) {
  requireAdmin(cookies);
  const form = await request.formData();
  const token = String(form.get('token') ?? '').trim();
  const result = await op(token);
  if (!result.ok) return fail(result.reason === 'conflict' ? 409 : 400, { error: result.error });
  return { success: true, message: `${verb} “${token}”` };
}

export const actions: Actions = {
  login: async ({ request, cookies, getClientAddress }) => {
    const attempt = beginAdminLogin(getClientAddress());
    if (!attempt.ok) {
      return fail(429, { loginError: throttledMessage(attempt.retryAfter) });
    }

    const form = await request.formData();
    const key = String(form.get('access-key') ?? '');
    if (!attempt.verify(key).ok) {
      return fail(403, { loginError: 'Incorrect access key.' });
    }
    setSession(cookies);
    throw redirect(303, '/admin');
  },
  logout: async ({ cookies }) => {
    cookies.delete(SESSION_COOKIE, { path: '/admin' });
    throw redirect(303, '/admin');
  },
  add: ({ request, cookies }) => tokenMutation(cookies, request, addToken, 'Added'),
  remove: ({ request, cookies }) => tokenMutation(cookies, request, removeToken, 'Removed'),
};
