import { CSRF_TRUSTED_ORIGINS } from '../securityPolicy.ts';

// SvelteKit's CSRF guard, which every /api route answered behind before the
// endpoints became a plain Netlify Function; svelte.config.js still configures
// SvelteKit's own for the pages it serves, from the same trusted origins.

// Content types an HTML form can send without a preflight, plus SvelteKit's own
// binary form encoding, which its guard lists with them.
const FORM_CONTENT_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'application/x-sveltekit-formdata',
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Whether SvelteKit's guard would refuse this request as a cross-site form submission. */
export function isCrossSiteFormSubmission(request: Request, url: URL): boolean {
  const contentType = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim();
  const origin = request.headers.get('origin');
  return (
    FORM_CONTENT_TYPES.has(contentType.toLowerCase()) &&
    MUTATING_METHODS.has(request.method) &&
    origin !== url.origin &&
    (!origin || !CSRF_TRUSTED_ORIGINS.includes(origin))
  );
}
