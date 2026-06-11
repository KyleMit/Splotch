import { error, json } from '@sveltejs/kit';
import { sessionToken, verifyAdminSecret } from '$lib/server/admin';
import { rateLimit } from '$lib/server/rateLimit';
import type { RequestHandler } from './$types';

/**
 * Exchange the raw admin secret for a derived session token. This is the API
 * twin of the /admin page's `login` form action, used by the native apps
 * (which have no server and therefore no cookie session). Body: { key }.
 * Returns { ok: true, session } on success — the client sends that session
 * back as `Authorization: Bearer <session>` on /api/admin/tokens requests.
 * The session is the same HMAC the cookie flow uses (see $lib/server/admin),
 * never the raw secret.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // Throttle per IP: this is an unauthenticated oracle for guessing the admin
  // secret, so cap brute-force bursts before checking the key — the same
  // limiter (and bucket) as the /admin page's login action, so attackers can't
  // double their budget by alternating between the two doors.
  const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
  if (limited) {
    return json(
      { ok: false, error: `Too many attempts. Please wait ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }

  const key = typeof body?.key === 'string' ? body.key : '';
  if (!verifyAdminSecret(key)) {
    return json({ ok: false, error: 'Incorrect access key.' }, { status: 403 });
  }
  return json({ ok: true, session: sessionToken() });
}
