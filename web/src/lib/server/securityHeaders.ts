// Single source of truth for the site's platform response headers. Netlify
// stamps the literal mirror onto CDN/static responses. For SSR, hooks.server.ts
// adds the non-CSP headers but preserves SvelteKit's complete nonce CSP instead
// of replacing it with this prerender-only complementary subset. The TOML
// cannot import this module, so securityHeaders.test.ts guards both copies.

import { RESPONSE_CSP_DIRECTIVES, serializeCspDirectives } from '../../../securityPolicy.ts';

const CONTENT_SECURITY_POLICY = serializeCspDirectives(RESPONSE_CSP_DIRECTIVES);

/**
 * Routes whose document must disclose its own origin to itself.
 *
 * A cross-document form POST from a page served `Referrer-Policy: no-referrer`
 * carries `Origin: null` — Chromium opaques the origin along with the referrer
 * — and SvelteKit's CSRF guard rejects that as cross-site with a bare 403
 * "Cross-site POST form submissions are forbidden". It only bites without
 * JavaScript, because `use:enhance` posts via fetch and sends no Origin at all.
 * `same-origin` is the tightest policy that fixes it: a full referrer on
 * same-origin navigations, still nothing at all cross-origin, so the outbound
 * links to GitHub leak no more than before.
 *
 * Keyed by exact pathname — a prefix match would quietly cover future
 * sub-routes that never asked for it.
 */
const SAME_ORIGIN_REFERRER_ROUTES: ReadonlySet<string> = new Set(['/feedback']);

/**
 * The single route allowed to be framed, and only same-origin.
 *
 * The /dev/notch harness renders each device scenario as an iframe of this page,
 * because an iframe is a real viewport: `window.innerWidth`, `matchMedia
 * (orientation: portrait)` and the safe-area probe all have to see the emulated
 * device rather than the developer's monitor, and nothing short of a nested
 * browsing context gives them that.
 *
 * Everything under /dev/ 404s unless the dev-harness gate is open, so this
 * cannot widen a production response — but it is still pinned to one exact
 * pathname rather than the /dev/ prefix, so a future harness has to opt in
 * deliberately instead of inheriting the exception.
 */
export const FRAMEABLE_ROUTE = '/dev/notch/frame';

/**
 * Rewrites a response's framing headers to permit same-origin embedding.
 *
 * SvelteKit generates the SSR policy itself (nonce and all), so the frame-
 * ancestors directive has to be edited in the emitted header rather than
 * configured — replacing the whole policy here would drop the script nonce with
 * it, which is exactly what applyHeaders() in hooks.server.ts refuses to do.
 */
export function allowSameOriginFraming(response: Response): void {
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  const policy = response.headers.get('Content-Security-Policy');
  if (!policy) return;
  response.headers.set(
    'Content-Security-Policy',
    policy.replace(FRAME_ANCESTORS_NONE, "frame-ancestors 'self'")
  );
}

const FRAME_ANCESTORS_NONE = "frame-ancestors 'none'";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Reporting-Endpoints': 'csp="/api/csp-report"',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

/** The security headers for one response, with any per-route override applied. */
export function securityHeadersFor(pathname: string): Readonly<Record<string, string>> {
  if (!SAME_ORIGIN_REFERRER_ROUTES.has(pathname)) return SECURITY_HEADERS;
  return { ...SECURITY_HEADERS, 'Referrer-Policy': 'same-origin' };
}
