// The native apps load from a WebView origin (https://localhost on Android,
// capacitor://localhost on iOS) but call the hosted /api/* endpoints. Those are
// cross-origin requests, so the endpoints need permissive CORS. Every route is
// already gated server-side (access token for generate-image, bearer session
// for /api/admin/*), so allowing any origin here is safe — nothing under /api
// can be abused without a valid credential, and none of it relies on cookies
// (the wildcard origin is incompatible with credentialed requests anyway).
// Only /api/* is opened up; the rest of the site stays same-origin.
//
// The hook also stamps the site's security headers onto function-served SSR
// responses. Netlify custom headers (netlify.toml `for = "/*"`) reach only
// CDN/static responses, so `/admin` (prerender = false) — the credentialed
// console — otherwise ships with no CSP, no X-Frame-Options, nothing. The set
// lives once in $lib/server/securityHeaders and is guarded against the
// netlify.toml copy by securityHeaders.test.ts (ADR-0073).
import { building } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { SECURITY_HEADERS } from '$lib/server/securityHeaders';

export const handle: Handle = async ({ event, resolve }) => {
  const isApi = event.url.pathname.startsWith('/api/');

  // Answer the CORS preflight before hitting any route logic.
  if (isApi && event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const response = await resolve(event);

  if (isApi) {
    // Cross-origin /api/* calls from the native WebView origins (ADR-0007).
    for (const [key, value] of Object.entries(corsHeaders())) {
      response.headers.set(key, value);
    }
  } else if (!building) {
    // Runtime-only (`!building`): at build time this hook also runs to
    // prerender the static pages, but those are served from the CDN with the
    // netlify.toml headers — the function only serves SSR routes like `/admin`,
    // and those are the responses that need this set.
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
  }

  return response;
};

// Server twin of hooks.client.ts's handleError. No third-party telemetry by
// design, so the Netlify function log is the only record of an unexpected
// SSR or /api/* failure — SvelteKit only calls this for unexpected errors,
// so expected error(4xx) responses never land here.
export const handleError: HandleServerError = ({ error, event, status }) => {
  console.error('[server error]', event.url.pathname, status, error);
  return { message: 'Something went wrong.' };
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
