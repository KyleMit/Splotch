# ADR-0016: Admin Console via Shared Server Core + Bearer-Session API for Native

**Status:** Active **Date:** 2026-06

## Context

The `/admin` token console is server-rendered (form actions, HTTP-only cookie session). The native
apps are a static export with no server (ADR-0001), so `/admin` could not run there at all — the
About-tab admin link was suppressed on native (`!isNative()` in `AboutTab.svelte`).

Alternatives considered for making admin work on device:

1. **Point everything at the API, web included** — rewrite `/admin` as a pure client page that calls
   JSON endpoints. Rejected: the already-running web server would loop back through its own HTTP
   layer for work it can execute natively, and the web console would lose its HTTP-only cookie
   session (the credential would have to live in script-readable storage on the web too).
2. **Cookie-authenticated API for native** — reuse the existing `admin_session` cookie cross-origin.
   Rejected: the cookie is `SameSite=Strict` (deliberately, see ADR-0007), WebView cross-origin
   cookies are unreliable, and CORS wildcard (`Access-Control-Allow-Origin: *`) is incompatible with
   credentialed requests.
3. **Shared core, two front doors** — extract the auth/invite logic into a server module consumed
   directly by the web form actions and exposed as a bearer-authenticated JSON API for native.
   **Chosen.**

## Decision

**Shared core:** `src/lib/server/admin.ts` owns secret verification, the derived session token
(`HMAC-SHA256(key = ADMIN_ACCESS_TOKEN, "admin-session-v1")`), constant-time comparison, and
invite-URL building. Token CRUD stays in `src/lib/server/tokens.ts` (Netlify Blobs; storage model in
ADR-0025).

**Two front doors, one session token:**

* **Web** (`src/routes/admin/+page.server.ts`): unchanged model — form actions call the core
  directly (no self-HTTP), session rides in the HTTP-only `SameSite=Strict` cookie.
* **Native** (`src/routes/admin/native/+page.svelte`): a prerendered static page bundled into the
  app. It logs in via `POST /api/admin/login` (rate-limited per IP, **same limiter bucket** as the
  page action so the two doors don't double a brute-forcer's budget) and manages tokens via
  `GET/POST/DELETE /api/admin/tokens` with `Authorization: Bearer <session>`. The bearer value is
  the *same derived HMAC* the cookie stores — never the raw secret — so rotating
  `ADMIN_ACCESS_TOKEN` (or bumping the HMAC label) invalidates both transports at once. On device it
  persists in the Keychain/Keystore via the generalized `src/lib/secureStorage.ts`.

**One UI:** both pages render `src/lib/components/admin/AdminConsole.svelte`, a presentational
component with `onlogin/onlogout/onadd/onremove` callbacks. The web page binds callbacks to its form
actions via SvelteKit's programmatic-submission pattern (`fetch` + `deserialize` + `applyAction`);
the native page binds them to the JSON API through `apiUrl()`.

**Gotchas:**

* `/api/admin/tokens` declares `export const prerender = false` — it has a GET handler, and the
  site-wide prerender must not try to snapshot an auth-dependent response.
* All `/api/admin/tokens` methods return the full `{ ok, tokens, invites }` snapshot so mutations
  never need a follow-up fetch.
* The About-tab link is `isNative() ? '/admin/native' : '/admin'`. `/admin/native` also works on the
  web (it talks to the same-origin API), but `/admin` remains the canonical web console because of
  its cookie session.
* CORS/CSRF: covered by ADR-0007 — the admin API is JSON (outside SvelteKit's CSRF guard) and
  cookie-free, so the existing `/api/*` wildcard CORS is safe; the allowed methods/headers were
  extended to `GET, DELETE` and `Authorization`.

The API surface is documented in `.claude/skills/api/SKILL.md`; E2E coverage is
`tests/admin.spec.ts`.

## Consequences

* **+** Admin works on device; the web path is unchanged in behavior and never makes loopback HTTP
  calls.
* **+** Single auth core: one secret check, one derived-session scheme, one invalidation story
  (rotate the secret / bump the HMAC label) across cookie and bearer.
* **+** Single console UI — a layout or copy change lands in both front doors automatically.
* **-** The session credential now also exists outside an HTTP-only cookie (Keychain/Keystore on
  device; encrypted IndexedDB if `/admin/native` is used on the web) — a strictly weaker confinement
  than cookie-only, accepted because it's the derived HMAC, not the secret.
* **-** The derived session has no expiry of its own; revocation is only by rotating the secret.
  (Same property the ~10-year cookie already had.)
* **-** The web console's forms are now submitted programmatically, so it requires JavaScript (the
  rest of the app already does).
* **-** A native admin session always operates on **production** data (`__NATIVE_API_BASE__` is
  hard-coded to `https://splotch.art`), even in dev builds.
