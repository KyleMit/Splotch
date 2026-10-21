import { building } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { API_CORS_HEADERS, applyApiCacheDefault } from '$lib/server/apiCors';
import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '$lib/errorLog';
import { devHarnessEnabled } from '$lib/server/devHarness';
import { loggableFailure } from '$lib/server/logRedaction';
import {
  allowSameOriginFraming,
  API_RESPONSE_HEADERS,
  FRAMEABLE_ROUTE,
  securityHeadersFor,
} from '$lib/server/securityHeaders';

function applyHeaders(response: Response, headers: Readonly<Record<string, string>>) {
  for (const [key, value] of Object.entries(headers)) {
    // SvelteKit's SSR response already carries the full nonce-bearing policy.
    // SECURITY_HEADERS has only the meta-unsupported fallback for static pages;
    // replacing the generated policy here would remove script enforcement.
    if (key === 'Content-Security-Policy' && response.headers.has(key)) continue;
    response.headers.set(key, value);
  }
}

// The /api/* endpoints are Netlify Functions (netlify/functions/api-*.ts), whose
// apiFunction wrapper answers the same way. What still reaches SvelteKit under
// /api/ is a path no function claims, and its 404 keeps the same headers.
const handleCors: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/')) return resolve(event);

  // Answer the CORS preflight before hitting any route logic.
  if (event.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_CORS_HEADERS });
  }

  const response = await resolve(event);

  // Cross-origin /api/* calls from the native WebView origins (ADR-0007).
  applyHeaders(response, API_CORS_HEADERS);

  return response;
};

// The no-store default (apiCors.ts) runs after handleCors, so the OPTIONS
// preflight, which returns before resolve(), never reaches it.
const handleApiCaching: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (event.url.pathname.startsWith('/api/')) applyApiCacheDefault(response);
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
  // /api/* takes only the subset that means anything on a non-document
  // response (API_RESPONSE_HEADERS); a JSON or image body has nothing for a CSP
  // or a referrer policy to act on. The OPTIONS preflight returns before
  // `resolve()` and so reaches neither set, which is correct — a 204 with no
  // body has nothing to sniff.
  if (!building) {
    applyHeaders(
      response,
      event.url.pathname.startsWith('/api/')
        ? API_RESPONSE_HEADERS
        : securityHeadersFor(event.url.pathname)
    );
  }

  if (devHarnessEnabled() && event.url.pathname === FRAMEABLE_ROUTE) {
    allowSameOriginFraming(response);
  }

  return response;
};

export const handle: Handle = sequence(handleCors, handleApiCaching, handleSecurityHeaders);

// Server twin of hooks.client.ts's handleError. No third-party telemetry by
// design, so the Netlify function log is the only record of an unexpected
// SSR failure — SvelteKit only calls this for unexpected errors, so expected
// error(4xx) responses never land here. The /api/* functions don't either:
// apiHandler (lib/server/http.ts) and apiFunction (lib/server/api/apiFunction.ts)
// catch at the endpoint boundary and emit the same-format log line themselves.
export const handleError: HandleServerError = ({ error, event, status }) => {
  console.error(ERROR_LOG_PREFIX.server, event.url.pathname, status, loggableFailure(error));
  // `message` isn't read by +error.svelte/ErrorScreen (their copy is fixed independently), but
  // it does surface on SvelteKit's default fallback error page (no custom error.html here).
  return { message: GENERIC_ERROR_MESSAGE };
};
