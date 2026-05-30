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

  return {};
}
