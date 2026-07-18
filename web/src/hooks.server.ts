// The native apps load from a WebView origin (https://localhost on Android,
// capacitor://localhost on iOS) but call the hosted /api/* endpoints. Those are
// cross-origin requests, so the endpoints need permissive CORS. Every route is
// already gated server-side (access token for generate-image, bearer session
// for /api/admin/*), so allowing any origin here is safe — nothing under /api
// can be abused without a valid credential, and none of it relies on cookies
// (the wildcard origin is incompatible with credentialed requests anyway).
// Only /api/* is opened up; the rest of the site stays same-origin.
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const isApi = event.url.pathname.startsWith('/api/');

  // Answer the CORS preflight before hitting any route logic.
  if (isApi && event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const response = await resolve(event);

  if (isApi) {
    const headers = corsHeaders();
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }

  return response;
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    // Authorization: admin bearer sessions. X-Access-Token / X-Api-Key: the
    // generate-image credentials (secrets kept out of the query string).
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token, X-Api-Key',
    // Let native clients cache the preflight for a day instead of paying an
    // extra OPTIONS round trip on every cross-origin JSON request.
    'Access-Control-Max-Age': '86400',
  };
}
