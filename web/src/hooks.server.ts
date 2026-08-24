import { building } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  ASYNC_GENERATION_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '$lib/errorLog';
import { devHarnessEnabled } from '$lib/devHarness';
import {
  allowSameOriginFraming,
  FRAMEABLE_ROUTE,
  securityHeadersFor,
} from '$lib/server/securityHeaders';

// The native apps load from a WebView origin (https://localhost on Android,
// capacitor://localhost on iOS) but call the hosted /api/* endpoints. Those are
// cross-origin requests, so the endpoints need permissive CORS. Credentialed
// routes authenticate each request; the unauthenticated free-generation path
// is bounded by its durable daily provider-start ceiling and per-IP rate limit.
// None of the APIs relies on cookies (the wildcard origin is incompatible with
// credentialed requests anyway).
// Only /api/* is opened up; the rest of the site stays same-origin.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  // Authorization: admin bearer sessions. X-Access-Token / X-Api-Key: the
  // generate-image credentials (secrets kept out of the query string).
  'Access-Control-Allow-Headers': `Content-Type, Authorization, ${ACCESS_TOKEN_HEADER}, ${API_KEY_HEADER}, ${ASYNC_GENERATION_HEADER}, ${INSTALLATION_ID_HEADER}, ${REPORT_TOKEN_HEADER}`,
  'Access-Control-Expose-Headers': `${FREE_GENERATIONS_REMAINING_HEADER}, ${REPORT_TOKEN_HEADER}`,
  // Let native clients cache the preflight for a day instead of paying an
  // extra OPTIONS round trip on every cross-origin JSON request.
  'Access-Control-Max-Age': '86400',
};

function applyHeaders(response: Response, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    // SvelteKit's SSR response already carries the full nonce-bearing policy.
    // SECURITY_HEADERS has only the meta-unsupported fallback for static pages;
    // replacing the generated policy here would remove script enforcement.
    if (key === 'Content-Security-Policy' && response.headers.has(key)) continue;
    response.headers.set(key, value);
  }
}

const handleCors: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/')) return resolve(event);

  // Answer the CORS preflight before hitting any route logic.
  if (event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = await resolve(event);

  // Cross-origin /api/* calls from the native WebView origins (ADR-0007).
  applyHeaders(response, CORS_HEADERS);

  return response;
};

// Stamps the site's security headers onto function-served SSR responses.
// Netlify custom headers (netlify.toml `for = "/*"`) reach only CDN/static
// responses, so `/admin` (prerender = false) — the credentialed console —
// otherwise ships with no CSP, no X-Frame-Options, nothing. The set lives once
// in $lib/server/securityHeaders and is guarded against the netlify.toml copy
// by securityHeaders.test.ts (ADR-0073).
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Runtime-only (`!building`): at build time this hook also runs to
  // prerender the static pages, but those are served from the CDN with the
  // netlify.toml headers — the function only serves SSR routes like `/admin`,
  // and those are the responses that need this set.
  if (!building && !event.url.pathname.startsWith('/api/')) {
    applyHeaders(response, securityHeadersFor(event.url.pathname));
  }

  if (devHarnessEnabled() && event.url.pathname === FRAMEABLE_ROUTE) {
    allowSameOriginFraming(response);
  }

  return response;
};

export const handle: Handle = sequence(handleCors, handleSecurityHeaders);

// Server twin of hooks.client.ts's handleError. No third-party telemetry by
// design, so the Netlify function log is the only record of an unexpected
// SSR failure — SvelteKit only calls this for unexpected errors, so expected
// error(4xx) responses never land here. Wrapped /api/* handlers don't either:
// apiHandler (lib/server/http.ts) catches at the route boundary and emits the
// same-format log line itself.
export const handleError: HandleServerError = ({ error, event, status }) => {
  console.error(ERROR_LOG_PREFIX.server, event.url.pathname, status, error);
  // `message` isn't read by +error.svelte/ErrorScreen (their copy is fixed independently), but
  // it does surface on SvelteKit's default fallback error page (no custom error.html here).
  return { message: GENERIC_ERROR_MESSAGE };
};
