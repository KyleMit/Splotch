import { error, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getTokens, addToken, removeToken } from '$lib/server/tokens.js';

// Must be server-rendered: it has form actions and validates the access-key
// query param, neither of which is compatible with the site-wide prerender.
export const prerender = false;
export const ssr = true;

// Every entry point here — the initial render and both mutating actions —
// must prove possession of the admin secret. The key travels in the
// `access-key` query param and is compared to ADMIN_ACCESS_TOKEN server-side.
function requireAdmin(url) {
  const key = url.searchParams.get('access-key');
  const expected = env.ADMIN_ACCESS_TOKEN;
  if (!expected || !key || key !== expected) {
    throw error(403, 'Forbidden');
  }
}

function buildInvites(tokens, origin) {
  return tokens.map((token) => ({
    token,
    url: `${origin}/?ai_access_token=${encodeURIComponent(token)}`
  }));
}

export async function load({ url }) {
  requireAdmin(url);
  const tokens = await getTokens();
  return {
    accessKey: url.searchParams.get('access-key'),
    invites: buildInvites(tokens, url.origin)
  };
}

export const actions = {
  add: async ({ request, url }) => {
    requireAdmin(url);
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    const result = await addToken(token);
    if (!result.ok) return fail(400, { error: result.error });
    return { success: true, message: `Added “${token}”` };
  },
  remove: async ({ request, url }) => {
    requireAdmin(url);
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    await removeToken(token);
    return { success: true, message: `Removed “${token}”` };
  }
};
