import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Gate the admin page on the server. The access key arrives as a query param
// (?access-key=xxx) and must match ADMIN_ACCESS_TOKEN from the environment.
// Validation lives here so the secret never reaches the client.
export function load({ url }) {
  const key = url.searchParams.get('access-key');
  const expected = env.ADMIN_ACCESS_TOKEN;

  if (!expected || !key || key !== expected) {
    throw error(403, 'Forbidden');
  }

  // Enumerate the allowed AI tokens here on the server (same parsing as the
  // image API) so the raw list never ships to the client. The page just
  // renders the prebuilt invite links.
  const rawTokens = env.ALLOWED_TOKENS_LIST || '';
  const tokens = rawTokens
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const invites = tokens.map((token) => ({
    token,
    url: `${url.origin}/?ai_access_token=${encodeURIComponent(token)}`
  }));

  return { invites };
}
