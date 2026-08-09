import { json } from '@sveltejs/kit';
import { beginAdminLogin } from '$lib/server/admin';
import { apiHandler, readJsonBody, stringField, throttled } from '$lib/server/http';
import type { RequestHandler } from './$types';

export type LoginResponse = { ok: true; session: string } | { ok: false; error: string };

/**
 * Exchange the raw admin secret for a derived session token. This is the API
 * twin of the /admin page's `login` form action, used by the native apps
 * (which have no server and therefore no cookie session). Body: { key }.
 * Returns { ok: true, session } on success — the client sends that session
 * back as `Authorization: Bearer <session>` on /api/admin/tokens requests.
 * The session is the same HMAC the cookie flow uses (see $lib/server/admin),
 * never the raw secret.
 */
export const POST: RequestHandler = apiHandler(async ({ request, getClientAddress }) => {
  const attempt = beginAdminLogin(getClientAddress());
  if (!attempt.ok) return throttled(attempt.retryAfter);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const key = stringField(parsed.body, 'key');
  const result = attempt.verify(key);
  if (!result.ok) {
    return json({ ok: false, error: 'Incorrect access key.' } satisfies LoginResponse, {
      status: 403,
    });
  }
  return json({ ok: true, session: result.session } satisfies LoginResponse);
});
