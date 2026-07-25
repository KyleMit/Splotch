import { json } from '@sveltejs/kit';
import { attemptAdminLogin } from '$lib/server/admin';
import { readJsonBody, throttled } from '$lib/server/http';
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
  const body = await readJsonBody(request);
  const key = typeof body?.key === 'string' ? body.key : '';

  const result = attemptAdminLogin(getClientAddress(), key);
  if (!result.ok) {
    if (result.status === 429) return throttled(result.retryAfter);
    return json({ ok: false, error: 'Incorrect access key.' }, { status: 403 });
  }
  return json({ ok: true, session: result.session });
};
