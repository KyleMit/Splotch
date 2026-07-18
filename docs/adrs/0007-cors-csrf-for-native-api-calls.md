# ADR-0007: CORS and CSRF Strategy for Native-to-Web API Calls

**Status:** Active (amended by [ADR-0064](0064-generate-image-raw-body-header-credentials.md))\
**Date:** 2026-06-01 (committed in 4370205)

> **Amendment (ADR-0064):** `/api/generate-image` no longer sends `multipart/form-data` — it now
> posts a raw `image/*` body, which SvelteKit's CSRF guard ignores, so that route no longer depends
> on the `trustedOrigins` allow-list below. The origins are kept as defense-in-depth for any future
> cross-origin form POST. The CORS allow-list also gained `X-Access-Token` / `X-Api-Key` (the
> generate-image credentials, kept out of the query string). The `curl` verification at the bottom
> should now use `-H "X-Access-Token: x" --data-binary @tiny.png -H "Content-Type: image/png"`
> instead of the `-F` multipart form fields.

## Context

The native apps (Android: `https://localhost`, iOS: `capacitor://localhost`) call the hosted
`https://splotch.art/api/generate-image` cross-origin. Two SvelteKit protections must be aligned:

1. **CSRF guard** (`kit.csrf`): SvelteKit rejects cross-origin POST requests with a
   `multipart/form-data` content type with `403 "Cross-site POST form submissions are forbidden"`.
   This check runs in `respond.js` **before** `hooks.server.ts`, so CORS headers added in the hook
   are never attached — the WebView sees "No 'Access-Control-Allow-Origin' header" and misreports it
   as a CORS error.

2. **CORS**: The `/api/*` routes need permissive `Access-Control-Allow-Origin` so the WebView origin
   can receive the response.

## Decision

**CSRF:** Add the two Capacitor WebView origins to `kit.csrf.trustedOrigins` in `svelte.config.js`:

```js
csrf: {
  trustedOrigins: ['https://localhost', 'capacitor://localhost'];
}
```

This is safe because:

* The AI endpoint is **token-gated** (no ambient auth that CSRF could abuse).
* The `/admin` route uses a cookie, but it is `SameSite=Strict` and therefore not sent on the
  cross-site requests these origins make.
* The `/api/admin/*` endpoints (ADR-0016) use JSON bodies, which SvelteKit's CSRF guard doesn't
  apply to anyway, and authenticate per-request via a bearer header — no ambient credential to ride.

**CORS:** `hooks.server.ts` adds `Access-Control-Allow-Origin: *` and handles `OPTIONS` preflights
for all `/api/*` routes, allowing `GET, POST, DELETE` plus the `Content-Type` and `Authorization`
headers (the bearer session for `/api/admin/*`). Wildcard is safe because every endpoint carries its
own credential gate and none relies on cookies — a wildcard origin can't be combined with
credentialed (cookie) requests in any case.

## Consequences

* **+** Native AI generation works without rebuilding the app after the server-side fix is deployed.
* **+** CSRF protection remains active for all other origins.
* **+** No changes needed to the native APK or IPA when the CORS/CSRF config changes — it's purely
  server-side.
* **-** The two trusted origins must be manually maintained if Capacitor changes its WebView origin
  scheme in a future major version.
* **-** Debugging CSRF vs. CORS failures in the WebView is non-obvious; the misreported error ("No
  CORS header") masks the real cause (CSRF 403). To verify:
  `curl -i -X POST https://splotch.art/api/generate-image -H "Origin: https://localhost" -F token=x -F image=@tiny.png`
  — a healthy response is `403 {"message":"Invalid access token"}` WITH a CORS header present.
