// Single source of truth for the site's security response headers. The root
// netlify.toml `[[headers]] for = "/*"` block sets these on every CDN/static
// response — but Netlify custom headers never reach function-served SSR
// responses (ADR-0073), so `/admin` (prerender = false) shipped with none of
// them: no CSP, no X-Frame-Options, on the most security-sensitive page.
// hooks.server.ts stamps this same set onto SSR responses so `/admin` matches
// the static pages. securityHeaders.test.ts guards the two copies against
// drift — netlify.toml must stay literal TOML for Netlify to read it at deploy
// time, so it can't import this module; the test asserts the values match.

// One directive per line for readability, joined into the single-line canonical
// form the header ships as. Keep the directive set and order identical to the
// netlify.toml CSP: the guard test compares the two after collapsing
// whitespace, and a mismatch fails CI.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  // blob: covers the app reading its own object URLs back through fetch() — the
  // picture report posts the drawing and the AI result it is already showing.
  // 'self' does not cover them: a blob: URL is matched by scheme, not by the
  // origin baked into it.
  "connect-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'report-uri /api/csp-report',
  'report-to csp',
].join('; ');

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
