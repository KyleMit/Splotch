---
name: api
description: HTTP API reference for the /api/* endpoints — generate-image, verify-access-code, verify-key, report, and the admin bearer-session endpoints, plus the CORS, rate-limiting, and auth model. Use before adding, changing, or calling any /api endpoint.
---

# Splotch HTTP API

The hosted SvelteKit app (Netlify, `https://splotch.art`) serves a small JSON API under `/api/*`. On
the web it's called same-origin; the native apps (a static export with no server) call the hosted
endpoints cross-origin via `apiUrl()` (`web/src/lib/api.ts`, base injected at build time as
`__NATIVE_API_BASE__`).

**CORS:** `hooks.server.ts` answers preflights and adds `Access-Control-Allow-Origin: *` to every
`/api/*` response, with `GET, POST, DELETE, OPTIONS` and the `Content-Type` / `Authorization`
headers allowed, plus `Access-Control-Max-Age: 86400` so native clients cache the preflight instead
of paying an OPTIONS round trip per request. The wildcard is safe because every endpoint is gated by
a credential the caller must already hold (access token, Gemini key, or admin session) and nothing
under `/api` uses cookies. See ADR-0007.

**Rate limiting:** unauthenticated oracles are throttled per IP with a sliding window (default 10
hits/min, `web/src/lib/server/rateLimit.ts`, ADR-0014). Every throttled response uses one standard
shape, built by `throttled(retryAfter)` in `web/src/lib/server/http.ts` — a `429` with a
`Retry-After` header and the JSON body:

```json
{ "ok": false, "error": "Too many attempts. Please wait 12s." }
```

The `error` field is user-facing (clients surface it directly). The same module's
`readJsonBody(request)` is the shared JSON-body parser — a malformed body is a uniform
`400 "Expected a JSON body"`. Use both helpers in any new endpoint instead of hand-rolling the parse
or the 429.

An endpoint that is only an oracle on its *failure* path (generate-image's managed-token check,
where valid traffic is deliberately keyed per token, not per IP) throttles just that path:
`peekRateLimit` (read-only) runs before the credential check so a limited IP gets a blind 429, and
`rateLimit` records the hit only when the check fails — legitimate callers never consume the budget.

---

## AI generation

### `POST /api/generate-image`

Generates a stylized image from a drawing. `multipart/form-data` with the PNG, style prompt, and
either an allow-listed access token or a BYO Gemini key. Managed tokens are rate-limited per token
(15/min); BYOK requests are rate-limited per IP with a deliberately generous limit (30/min), because
the branch is otherwise unauthenticated and its 502-vs-200 result is a key-validity oracle. Invalid
managed tokens are an access-code oracle, so failed guesses share `/api/verify-access-code`'s per-IP
budget: a limited IP gets the standard 429 before the token is even checked (no allowlist read),
while valid tokens never touch that bucket. See `web/src/routes/api/generate-image` and ADR-0006 /
ADR-0014.

On success returns the image bytes. Failure modes are split so the client can guide the child
correctly (ADR-0023): a **`422`** means Gemini refused the drawing on **safety** grounds — the child
should draw something *different* (the app shows "let's try drawing something else!"); a **`502`**
is a genuine upstream/empty failure (retryable). The route talks to the model through the
provider-agnostic `AiImageProvider` seam (`web/src/lib/server/ai/provider.ts`, ADR-0047) — the
vendor SDK never appears in route code. The safety vs. empty/error split is decided by
`classifyGeminiResponse` / `isSafetyError` in `web/src/lib/server/ai/geminiSafety.ts`, and probed by
the manual red-team suite (`npm run redteam`, `tests/redteam/`).

The Gemini call is hardened to *increase* those refusals (the audience is toddlers): a
`systemInstruction` tells the model to decline unsafe drawings in plain text rather than "beautify"
them, and `safetySettings` set every configurable harm category to `BLOCK_LOW_AND_ABOVE` (the
`HARM_CATEGORY_IMAGE_*` output categories are deliberately omitted — the image model's endpoint
rejects them with a 400). Both live in the Gemini adapter, `web/src/lib/server/ai/gemini.ts`.

### `POST /api/verify-access-code`

Checks a "special access" invite code against the managed allowlist. Rate-limited per IP.

```json
// request
{ "code": "sunny-meadow" }
// response
{ "ok": true, "accessCode": "sunny-meadow" }   // or { "ok": false, "error": "..." }
```

### `POST /api/verify-key`

Verifies a parent-supplied Gemini API key with a minimal live call. Rate-limited per IP.

```json
// request
{ "apiKey": "..." }
// response
{ "ok": true }   // or { "ok": false, "error": "..." }
```

---

## Feedback

### `POST /api/report`

Opens a GitHub issue from the in-app "report a bug / suggest a feature" form (Parent Center → About
→ Send Feedback). Unauthenticated and a *write*, so it is rate-limited per IP with a deliberately
tight budget (5/min, vs the oracles' 10). Every issue is labelled `user-report` plus `type:bug` /
`type:feature` (`docs/ISSUE-WORKFLOW.md`; both labels also live in `.github/labels.yml`).

```json
// request
{
  "kind": "bug",                 // "bug" | "feature" — required
  "message": "The undo button…", // required, trimmed, capped at 4000 chars
  "device": {                    // optional; only sent when the parent opts in (bugs only)
    "app": "1.3.45", "platform": "iOS", "os": "iOS 17.2", "device": "Apple iPhone15,2", "…": "…"
  },
  "hp": ""                       // honeypot — a filled value is quietly accepted with no issue
}
// 200
{ "ok": true, "url": "https://github.com/KyleMit/Splotch/issues/123" }
// 400 — missing/invalid kind or empty message
{ "ok": false, "error": "Please type a short description." }
// 503 — GITHUB_ISSUE_TOKEN not configured on this instance
{ "ok": false, "error": "Reporting is not available right now. Please try again later." }
// 502 — GitHub rejected the create
{ "ok": false, "error": "Could not send your report. Please try again later." }
```

The GitHub REST call is isolated behind a server seam, `web/src/lib/server/github.ts` (mirroring the
AI provider seam, ADR-0047) — route code never touches the token or the REST shape. Auth is a
fine-grained PAT in `GITHUB_ISSUE_TOKEN` (scope: *Issues: Read and write* on the target repo), read
via `$env/dynamic/private`; `GITHUB_ISSUE_REPO` overrides the default `KyleMit/Splotch`. The
optional `device` payload is shaped by the shared, dependency-free `web/src/lib/deviceReport.ts`
(also used client-side to preview exactly what will be sent) and re-sanitized server-side (known
keys only, single-line, length-capped) before it reaches the issue body. Because the endpoint is an
unauthenticated public write and the message + device values are attacker-controlled, both are run
through `escapeIssueMarkdown()` (same seam) before they are embedded in the Markdown body — it
backslash-escapes `@`-mentions, `#`-references, image embeds (`![…]`), and raw `<` HTML so a
submitter can't make the issue notify people or load remote content. See ADR-0060.

---

## Admin (access-token management)

JSON twin of the server-rendered `/admin` console, used by the native apps' `/admin/native` page
(the static bundle has no server to run the console's form actions). Both front doors call the same
core (`web/src/lib/server/admin.ts` \+ `web/src/lib/server/tokens.ts`) — the web console executes it
directly in its form actions and **never** loops back through these endpoints.

### Authentication model

* `ADMIN_ACCESS_TOKEN` (env var) is the raw admin secret. It is only ever sent once, in the login
  request body, and never stored client-side.
* Login returns a **derived session token**:
  `HMAC-SHA256(key = ADMIN_ACCESS_TOKEN, "admin-session-v1")` — the same value the web console
  stores in its HTTP-only cookie. It cannot be inverted to recover the secret, and rotating the
  secret (or bumping the HMAC label) invalidates every outstanding session at once.
* Subsequent requests send it as `Authorization: Bearer <session>`. The native app keeps it in the
  platform secure store (Keychain/Keystore).
* All comparisons are constant-time (`timingSafeEqual`).

### `POST /api/admin/login`

Exchange the admin secret for a session token. Rate-limited per IP (shared bucket with the `/admin`
page's login action, so the two doors don't double an attacker's budget).

```json
// request
{ "key": "<ADMIN_ACCESS_TOKEN>" }
// 200
{ "ok": true, "session": "<64-char hex HMAC>" }
// 403
{ "ok": false, "error": "Incorrect access key." }
// 429 (+ Retry-After header)
{ "ok": false, "error": "Too many attempts. Please wait 12s." }
```

### `/api/admin/tokens`

All methods require `Authorization: Bearer <session>`; failures are a uniform
`401 {"message":"Unauthorized"}`. All methods return the same snapshot shape so mutations never need
a follow-up fetch:

```json
{
  "ok": true,
  "tokens": ["sunny-meadow"],
  "invites": [
    { "token": "sunny-meadow", "url": "https://splotch.art/?ai_access_token=sunny-meadow" }
  ],
  "persistent": true
}
```

`persistent` reports whether the list is durably backed by Netlify Blobs (`true`) or the in-memory
env-seeded fallback (`false` — local dev, or a deployed function without the Blobs context; see
ADR-0025). `scripts/blobs-smoke.mjs` asserts it is `true` against a real deploy.

| Method   | Body                  | Effect                                                            |
| -------- | --------------------- | ----------------------------------------------------------------- |
| `GET`    | —                     | List tokens + invite URLs                                         |
| `POST`   | `{ "token": "name" }` | Add a token. `400 { ok: false, error }` when empty or duplicate.  |
| `DELETE` | `{ "token": "name" }` | Remove a token (idempotent). Also clears the token's usage tally. |

Mutations are etag compare-and-set writes with a few retries; if concurrent admin mutations keep
colliding (possible under Blobs eventual consistency, ADR-0025), `POST`/`DELETE` return
`409 { ok: false, error }` — safe to retry as-is.

Invite URLs are built from the request origin, so they point at the host that served the API.

### Example

```bash
SESSION=$(curl -s -X POST https://splotch.art/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"key":"<ADMIN_ACCESS_TOKEN>"}' | jq -r .session)

curl -s https://splotch.art/api/admin/tokens \
  -H "Authorization: Bearer $SESSION"
```

---

## Validating the API

Run `npm run test:api:smoke` to check the live `/api/*` contract end-to-end. It's self-contained —
it boots a throwaway `vite dev` with a test `ADMIN_ACCESS_TOKEN`, exercises the admin auth flow
(login success/failure, the bearer gate, and a token add/remove round-trip), the
`verify-access-code` shape, `report`'s validation + honeypot + graceful-unconfigured path (no
`GITHUB_ISSUE_TOKEN` in the smoke env, so no real issue is created), and `generate-image`'s auth
gate (invalid token → 403, then the shared per-IP 429 once the verify budget is burned; valid token
minus image → 400 — every case is rejected before the model call), then tears the server down. No
Gemini key or Netlify Blobs needed; successful generation and `verify-key` (which make live model
calls) are out of scope. Use it to sanity-check the contract after changing any endpoint — it's the
cheap counterpart to the Playwright admin E2E in `tests/admin.spec.ts`.

`test:api:smoke` deliberately runs against `vite dev`, which has **no** Blobs, so it can't catch the
failure mode of ADR-0025 (a deployed function without the Blobs context). For that, run
`npm run test:blobs:smoke` against a real deploy:

```bash
BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
```

It logs in, asserts the snapshot's `persistent` is `true` (false ⇒ Blobs is dead on that deploy),
round-trips a unique token through Blobs, and cleans it up. Run it against a PR's deploy preview
before merging an adapter/Netlify-config change, and against `https://splotch.art` to confirm
production.

## Local development

* `vite dev` / `netlify dev` run all endpoints same-origin — no CORS in play. Token mutations
  without Netlify Blobs credentials fall back to an in-memory list (seeded from
  `ALLOWED_TOKENS_LIST`) that resets on restart.
* Set `ADMIN_ACCESS_TOKEN` in your environment to use either admin console locally; unset, every
  login fails (there is nothing to authenticate against).
* A native dev build (`CAPACITOR=true`) points `apiUrl()` at `https://splotch.art`, so an on-device
  admin session talks to **production** data. The permissive `/api/*` CORS plus bearer auth means
  the WebView origin swap (Android `https://localhost`, iOS `capacitor://localhost`) needs no extra
  configuration.
* E2E coverage lives in `tests/admin.spec.ts`; the Playwright web server starts with
  `ADMIN_ACCESS_TOKEN=test-admin-secret`.
