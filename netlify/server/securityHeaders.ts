// Netlify stamps this header contract onto static responses. The plain API wrapper applies its
// non-document subset. TOML cannot import TypeScript, so securityHeaders.test.ts guards its mirror.

import { RESPONSE_CSP_DIRECTIVES, serializeCspDirectives } from '../securityPolicy.ts';

const CONTENT_SECURITY_POLICY = serializeCspDirectives(RESPONSE_CSP_DIRECTIVES);

// The /feedback same-origin referrer policy is retained in the recorded hosting contract.
const SAME_ORIGIN_REFERRER_ROUTES: ReadonlySet<string> = new Set(['/feedback']);

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Reporting-Endpoints': 'csp="/api/csp-report"',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

/**
 * The subset of the platform headers that still means something on a response
 * that is not a document.
 *
 * /api/* is served by the same function as /admin, but a JSON or image body has
 * nothing for a CSP or a referrer policy to act on. `nosniff` is the exception:
 * it is what stops a browser re-typing those bytes as HTML or script, which is
 * the one document-shaped risk an API response actually carries.
 *
 * Picked out of SECURITY_HEADERS rather than restated, so the value cannot
 * drift from the site's; securityHeaders.test.ts asserts that derivation.
 */
export const API_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': SECURITY_HEADERS['X-Content-Type-Options'],
};

/** The security headers for one response, with any per-route override applied. */
export function securityHeadersFor(pathname: string): Readonly<Record<string, string>> {
  if (!SAME_ORIGIN_REFERRER_ROUTES.has(pathname)) return SECURITY_HEADERS;
  return { ...SECURITY_HEADERS, 'Referrer-Policy': 'same-origin' };
}
