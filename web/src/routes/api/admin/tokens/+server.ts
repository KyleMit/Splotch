import { error, json } from '@sveltejs/kit';
import { verifySessionToken, buildInvites, bearerToken } from '$lib/server/admin';
import type { Invite } from '$lib/server/admin';
import {
  getTokensStatus,
  addToken,
  removeToken,
  MUTATION_FAILURE_STATUS,
} from '$lib/server/tokens';
import type { MutationFailure } from '$lib/server/tokens';
import { apiHandler, readJsonBody, stringField } from '$lib/server/http';
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

export type TokenSnapshot = {
  ok: true;
  tokens: string[];
  invites: Invite[];
  persistent: boolean;
};

export type TokenMutationError = { ok: false; error: string };

/**
 * Every method requires `Authorization: Bearer <session>`, where <session> is
 * the derived token from POST /api/admin/login (identical to the value the
 * cookie flow stores — same secret, same invalidation story). Verified in
 * constant time; failures get a uniform 401 so the response can't be used as
 * an oracle for anything beyond "not a valid session".
 */
function requireSession(request: Request) {
  if (!verifySessionToken(bearerToken(request))) {
    throw error(401, 'Unauthorized');
  }
}

// All three methods return the same { ok, tokens, invites, persistent } snapshot
// so a mutation never costs the client a second round trip to re-fetch the list —
// it just replaces its local state with the response. `persistent` reports whether
// the list is durably backed by Netlify Blobs (true) or the in-memory env-seeded
// fallback (false) — the same signal the web /admin banner uses (ADR-0025), and
// what the deploy smoke test (tools/api-smoke/check-deployed-contract.mjs) asserts to prove the
// deployed function actually has the Blobs context. After a mutation we keep the
// caller's `tokens` (authoritative, read-after-write safe under eventual
// consistency); `persistent` comes from the fresh status read.
async function snapshot(origin: string, tokens?: string[]) {
  const { tokens: current, persistent } = await getTokensStatus();
  const list = tokens ?? current;
  const payload = {
    ok: true,
    tokens: list,
    invites: buildInvites(list, origin),
    persistent,
  } satisfies TokenSnapshot;
  return json(payload);
}

// The status per failure reason is MUTATION_FAILURE_STATUS in
// $lib/server/tokens, shared with the /admin form action so the two front doors
// can't drift. The `reason` itself stays server-side: clients read the status.
function mutationError(result: MutationFailure) {
  const payload = { ok: false, error: result.error } satisfies TokenMutationError;
  return json(payload, { status: MUTATION_FAILURE_STATUS[result.reason] });
}

/** List access tokens and their prebuilt invite URLs. */
export const GET: RequestHandler = apiHandler(async ({ request, url }) => {
  requireSession(request);
  return snapshot(url.origin);
});

/** Add an access token. Body: { token }. */
export const POST: RequestHandler = apiHandler(async ({ request, url }) => {
  requireSession(request);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = await addToken(stringField(parsed.body, 'token'));
  if (!result.ok) return mutationError(result);
  return snapshot(url.origin, result.tokens);
});

/** Remove an access token. Body: { token }. */
export const DELETE: RequestHandler = apiHandler(async ({ request, url }) => {
  requireSession(request);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = await removeToken(stringField(parsed.body, 'token'));
  if (!result.ok) return mutationError(result);
  return snapshot(url.origin, result.tokens);
});
