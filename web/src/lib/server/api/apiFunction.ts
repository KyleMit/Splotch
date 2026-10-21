import { isHttpError, json, text } from '@sveltejs/kit';
import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '../../errorLog';
import { API_CORS_HEADERS, applyApiCacheDefault } from '../apiCors';
import { isCrossSiteFormSubmission } from '../csrf';
import { loggableFailure } from '../logRedaction';
import { dev } from '../runtimeMode';
import { API_RESPONSE_HEADERS } from '../securityHeaders';
import type { ApiEvent, ApiHandler } from './apiEvent';

// An /api endpoint as a plain Netlify Function. Each endpoint used to be a
// SvelteKit route answered by adapter-netlify's catch-all function, and installed
// native builds keep calling it, so this answers every request as that function
// did: SvelteKit's CSRF guard and trailing-slash redirect, hooks.server.ts's CORS
// preflight and headers, its no-store default, the API security headers, the 405
// for a method the endpoint lacks, and handleError's log line. The order is
// SvelteKit's; tools/api-smoke/tests/wire-diff.test.mjs holds every answer to the
// one SvelteKit gave.

/** The method handlers an endpoint module exports, as a SvelteKit +server.ts did. */
export type ApiEndpoint = Partial<Record<'GET' | 'POST' | 'DELETE', ApiHandler>>;

/** What Netlify passes a function beside the request: the subset this reads. */
export interface NetlifyContext {
  ip: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

// SvelteKit's ENDPOINT_METHODS order, which its 405 `Allow` header lists methods in.
const ALLOW_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

function allowedMethods(endpoint: ApiEndpoint): string {
  const allowed: string[] = ALLOW_ORDER.filter((method) => method in endpoint);
  if ('GET' in endpoint) allowed.push('HEAD');
  return allowed.join(', ');
}

function handlerFor(endpoint: ApiEndpoint, method: string): ApiHandler | undefined {
  if (method === 'HEAD') return endpoint.GET;
  return method === 'GET' || method === 'POST' || method === 'DELETE'
    ? endpoint[method]
    : undefined;
}

// SvelteKit refuses before routing, so the refusal carries none of the /api headers.
function crossSiteRefusal(request: Request): Response {
  const message = `Cross-site ${request.method} form submissions are forbidden`;
  return request.headers.get('accept') === 'application/json'
    ? json({ message }, { status: 403 })
    : text(message, { status: 403 });
}

// An endpoint route never takes a trailing slash; SvelteKit redirects to the bare
// path, before its hooks run.
function trailingSlashRedirect(url: URL): Response | null {
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return null;
  const location = url.pathname.slice(0, -1) + (url.search === '?' ? '' : url.search);
  return new Response(undefined, {
    status: 308,
    headers: { 'x-sveltekit-normalize': '1', location },
  });
}

// SvelteKit's answer to a throw an endpoint did not catch: handleError's log line
// for an unexpected one, then `{ message }`. Every endpoint but csp-report catches
// its own through apiHandler, and csp-report's only throw is a request body that
// fails mid-stream. Where SvelteKit would render its HTML error page for a
// text/html Accept, this answers the same JSON.
function uncaughtFailure(cause: unknown, pathname: string): Response {
  if (isHttpError(cause)) {
    return json(cause.body, { status: cause.status });
  }
  console.error(ERROR_LOG_PREFIX.server, pathname, 500, loggableFailure(cause));
  return json({ message: GENERIC_ERROR_MESSAGE }, { status: 500 });
}

async function resolve(endpoint: ApiEndpoint, event: ApiEvent): Promise<Response> {
  const { method } = event.request;
  const handler = handlerFor(endpoint, method);
  if (!handler) {
    return text(`${method} method not allowed`, {
      status: 405,
      headers: { allow: allowedMethods(endpoint) },
    });
  }
  try {
    return await handler(event);
  } catch (cause) {
    return uncaughtFailure(cause, event.url.pathname);
  }
}

function stampApiHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(API_CORS_HEADERS)) response.headers.set(name, value);
  applyApiCacheDefault(response);
  for (const [name, value] of Object.entries(API_RESPONSE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

/** The Netlify Function that serves `endpoint` at its /api path. */
export function apiFunction(
  endpoint: ApiEndpoint
): (request: Request, context: NetlifyContext) => Promise<Response> {
  return async (request, context) => {
    const url = new URL(request.url);
    // SvelteKit skips its guard under vite dev, and so does the dev host.
    if (!dev && isCrossSiteFormSubmission(request, url)) return crossSiteRefusal(request);

    const redirect = trailingSlashRedirect(url);
    if (redirect) return redirect;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: API_CORS_HEADERS });
    }

    const response = await resolve(endpoint, {
      request,
      url,
      getClientAddress: () => context.ip,
      platform: { context },
    });
    return stampApiHeaders(response);
  };
}
