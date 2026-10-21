// SvelteKit's CSRF guard, which every /api route answered behind before the
// endpoints became plain Netlify Functions, and which svelte.config.js still
// configures for the pages SvelteKit serves. Self-contained: svelte.config.js
// loads it through Node's type stripping, which resolves no extensionless import.

// The native WebView origins (Android https://localhost, iOS capacitor://localhost).
// Shipped native builds still post the legacy multipart generate-image form
// (ADR-0064), and a form content-type from an untrusted origin is refused before
// any handler runs — so before the CORS headers that would let the WebView read
// the refusal. Safe to trust: the AI routes are credential-gated, and /admin's
// one cookie is SameSite=strict, so these cross-site requests never carry it.
export const CSRF_TRUSTED_ORIGINS = ['https://localhost', 'capacitor://localhost'];

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
