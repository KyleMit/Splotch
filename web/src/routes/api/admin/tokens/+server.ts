import { error, json } from '@sveltejs/kit';
import { verifySessionToken, buildInvites } from '$lib/server/admin';
import { getTokensStatus, addToken, removeToken } from '$lib/server/tokens';
import type { RequestHandler } from './$types';

// JSON twin of the /admin console's token management, for clients that can't
// run the server-rendered page — i.e. the native apps, whose static bundle has
// no server. The web console does NOT go through here; it calls the same
// $lib/server functions directly in its form actions, so the already-running
// server never loops back through its own HTTP layer.
//
// This is a GET endpoint, so opt out of the site-wide prerender explicitly —
// responses depend on the Authorization header and live Blobs data.
export const prerender = false;

/**
 * Every method requires `Authorization: Bearer <session>`, where <session> is
 * the derived token from POST /api/admin/login (identical to the value the
 * cookie flow stores — same secret, same invalidation story). Verified in
 * constant time; failures get a uniform 401 so the response can't be used as
 * an oracle for anything beyond "not a valid session".
 */
function requireSession(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!verifySessionToken(token)) {
    throw error(401, 'Unauthorized');
  }
}

// All three methods return the same { ok, tokens, invites, persistent } snapshot
// so a mutation never costs the client a second round trip to re-fetch the list —
// it just replaces its local state with the response. `persistent` reports whether
// the list is durably backed by Netlify Blobs (true) or the in-memory env-seeded
// fallback (false) — the same signal the web /admin banner uses (ADR-0025), and
// what the deploy smoke test (scripts/blobs-smoke.mjs) asserts to prove the
// deployed function actually has the Blobs context. After a mutation we keep the
// caller's `tokens` (authoritative, read-after-write safe under eventual
// consistency); `persistent` comes from the fresh status read.
async function snapshot(origin: string, tokens?: string[]) {
  const { tokens: current, persistent } = await getTokensStatus();
  const list = tokens ?? current;
  return json({ ok: true, tokens: list, invites: buildInvites(list, origin), persistent });
}

/** List access tokens and their prebuilt invite URLs. */
export const GET: RequestHandler = async ({ request, url }) => {
  requireSession(request);
  return snapshot(url.origin);
}

/** Add an access token. Body: { token }. */
export const POST: RequestHandler = async ({ request, url }) => {
  requireSession(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }

  const result = await addToken(typeof body?.token === 'string' ? body.token : '');
  if (!result.ok) return json({ ok: false, error: result.error }, { status: 400 });
  return snapshot(url.origin, result.tokens);
}

/** Remove an access token. Body: { token }. */
export const DELETE: RequestHandler = async ({ request, url }) => {
  requireSession(request);

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Expected a JSON body');
  }

  const result = await removeToken(typeof body?.token === 'string' ? body.token : '');
  return snapshot(url.origin, result.tokens);
}
