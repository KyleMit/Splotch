# Splotch HTTP API

The hosted SvelteKit app (Netlify, `https://splotch.art`) serves a small JSON API under `/api/*`. On
the web it's called same-origin; the native apps (a static export with no server) call the hosted
endpoints cross-origin via `apiUrl()` (`web/src/lib/api.ts`, base injected at build time as
`__NATIVE_API_BASE__`).

**CORS:** `hooks.server.ts` answers preflights and adds `Access-Control-Allow-Origin: *` to every
`/api/*` response, with `GET, POST, DELETE, OPTIONS` and the `Content-Type` / `Authorization` /
`X-Access-Token` / `X-Api-Key` / `X-Installation-Id` headers allowed, plus
`X-Free-Generations-Remaining` exposed and `Access-Control-Max-Age: 86400` so native clients can
read the updated allowance and cache the preflight instead of paying an OPTIONS round trip per
request. The wildcard is safe because every endpoint is either gated by a credential the caller must
already hold (access token, Gemini key, or admin session) or rate-limited and bounded. The
credential-less `report` endpoint creates a sanitized private support issue; `csp-report` is
size-capped and bounded to log lines. Nothing under `/api` uses cookies. See ADR-0007.

**Rate limiting:** unauthenticated oracles are throttled per IP with a sliding window (default 10
hits/min, `web/src/lib/server/rateLimit.ts`, ADR-0014). Every throttled response uses one standard
shape, built by `throttled(retryAfter)` in `web/src/lib/server/http.ts` — a `429` with a
`Retry-After` header and the JSON body:

```json
{ "ok": false, "error": "Too many attempts. Please wait 12s." }
```

The `error` field is user-facing (clients surface it directly). That `{ ok: false, error }` body is
the **one client-facing JSON error shape** across `/api/*`, built by the same module's
`fail(status, error, headers?)`; every handler is wrapped in its `apiHandler(...)`, which converts
every thrown failure into the same shape at the boundary — a SvelteKit `error(...)` keeps its status
and message, and an unexpected exception becomes a 500 with the generic error text — so neither
throw-based control flow nor a crashed dependency can leak SvelteKit's `{ message }` body. The one
exemption is `csp-report`, whose responses are deliberately bodyless (browsers ignore them). The
module's `readJsonBody(request)` is the shared JSON-body parser — a malformed body is a uniform
`400 "Expected a JSON body"`. Use these helpers in any new endpoint instead of hand-rolling the
parse, the failure body, or the 429.

An endpoint that is only an oracle on its *failure* path (`verify-access-code` and generate-image's
managed-token check, which share one per-IP bucket) throttles just that path: `peekRateLimit`
(read-only) runs before the credential check so a limited IP gets a blind 429, and `rateLimit`
records the hit only when the check fails — legitimate callers never consume the budget. (For
generate-image's managed path, valid traffic is deliberately keyed per token, not per IP.)

---

## AI generation

### `POST /api/generate-image`

Generates a stylized image from a drawing. The current contract is the **raw image bytes as the
body** — the client uploads a high-quality **WebP** (`Content-Type: image/webp`) to keep the payload
small; the allowlist is `image/png`, `image/jpeg`, `image/webp`, and an absent type defaults to PNG.
There is no multipart envelope for the buffered function to parse and copy (ADR-0064). The
credential rides in a header, **never** the query string, because both are secrets that would
otherwise leak into access logs, browser history, and `Referer`: send
`X-Access-Token: <allow-listed access token>` **or** `X-Api-Key: <BYO Gemini key>` (mutually
exclusive; a key takes the BYOK path). The non-secret style enum is the one field in the URL —
`?style=Magical` (any value not in `STYLE_SUFFIXES` is ignored and the base prompt is used). The
body is capped at 15 MiB (`413`); a present, non-allow-listed `Content-Type` is `415`; an empty body
is `400`.

The server **also still accepts the legacy `multipart/form-data` shape** (`token` / `apiKey` /
`image` / `style` form fields) that the raw body replaced. Shipped native builds call the hosted API
and can only be updated via an app-store release (and PWA clients can run a stale service worker),
so a deploy is never atomic with its clients — dropping multipart would `403` every
already-installed client for missing credential headers. The handler branches on `Content-Type`; the
multipart branch is a labelled shim to remove once the oldest supported client sends the raw body.
This is also why the CSRF `trustedOrigins` allow-list (ADR-0007) is still required — the legacy
multipart POST from native is a cross-origin form submission that the guard would otherwise reject.

Managed tokens are rate-limited per token (15/min); BYOK requests are rate-limited per IP with a
deliberately generous limit (30/min), because the branch is otherwise unauthenticated and its
502-vs-200 result is a key-validity oracle. Invalid managed tokens are an access-code oracle, so
failed guesses share `/api/verify-access-code`'s per-IP budget: a limited IP gets the standard 429
before the token is even checked (no allowlist read), while valid tokens never touch that bucket.
See `web/src/routes/api/generate-image` and ADR-0006 / ADR-0014.

With neither credential, the request uses the installation's free grant and must send the
privacy-preserving `X-Installation-Id` pseudonym. Free attempts are rate-limited per IP at 15/min,
including validation, safety, upstream, exhaustion, and throttled failures. A durable Netlify Blobs
grant reserves one of ten slots before the provider call and conditionally finalizes it only after a
usable image exists; failures release the reservation. The short reservation lease recovers slots
after a function crash, and compare-and-set writes prevent concurrent requests from spending one
remaining slot twice. That grant store reads with **strong consistency**, unlike the other Blobs
stores: one request writes the reservation and then reads it back after the model call, so an
eventually-consistent read of its own write loses the reservation and fails a generation that
succeeded (ADR-0105's 2026-08-11 amendment). Finalizing is also never allowed to destroy a delivered
image — a reservation whose lease lapsed during a slow generation still spends its slot, and a
ledger write that fails outright is logged and the image returned without the remaining-count
header, leaving the daily ceiling as the spending boundary. A separate durable compare-and-set
counter reserves every free provider start before Gemini is called and caps project-funded traffic
across all installations and function instances at 500 calls per UTC day. Provider failures and
safety refusals are not refunded from that daily ceiling.

On success returns the image bytes. A free-grant response also carries
`X-Free-Generations-Remaining`. Exhaustion is `403` with
`{ ok:false, code:"FREE_GRANT_EXHAUSTED", error, remaining:0 }`, which sends the
already-parent-gated client flow to BYOK setup. Failure modes are split so the client can guide the
child correctly (ADR-0023). Exhausting the global daily provider-start ceiling is `503` with
`{ ok:false, code:"FREE_DAILY_LIMIT_EXHAUSTED", error }`; the client routes it to BYOK setup and
records the released installation reservation as `daily-limit`, not as an upstream provider failure.
A **`422`** means Gemini refused the drawing on **safety** grounds — the child should draw something
*different* (the app shows "let's try drawing something else!"); a **`502`** is a genuine
upstream/empty failure (retryable). The route talks to the model through the provider-agnostic
`AiImageProvider` seam (`web/src/lib/server/ai/provider.ts`, ADR-0047) — the vendor SDK never
appears in route code. The safety vs. empty/error split is decided by `classifyGeminiResponse` /
`isSafetyError` in `web/src/lib/server/ai/geminiSafety.ts`, and probed by the manual red-team suite
(`npm run redteam`, `tools/redteam/`).

Every deliberate failure, including validation, authorization, safety, server-configuration,
upstream, and throttling responses, uses the canonical JSON body:

```json
{ "ok": false, "error": "Image is too large" }
```

The status distinguishes the cases above; a `429` also carries its required `Retry-After` header.

The Gemini call is hardened to *increase* those refusals (the audience is toddlers): a
`systemInstruction` tells the model to decline unsafe drawings in plain text rather than "beautify"
them, and `safetySettings` set every configurable harm category to `BLOCK_LOW_AND_ABOVE` (the
`HARM_CATEGORY_IMAGE_*` output categories are deliberately omitted — the image model's endpoint
rejects them with a 400). Both live in the Gemini adapter, `web/src/lib/server/ai/gemini.ts`.

### `POST /api/verify-access-code`

Checks a "special access" invite code against the managed allowlist. Rate-limited per IP on its
*failure* path only: a limited IP gets a blind 429 before the code is checked, and only a failed
guess charges the shared per-IP bucket (the same one generate-image's managed-token check peeks), so
valid families behind one NAT never spend it.

```json
// request
{ "code": "sunny-meadow" }
// 200 — recognized code
{ "ok": true, "accessCode": "sunny-meadow" }
// 200 — present but unrecognized code
{ "ok": false, "error": "That access code was not recognized." }
// 400 — missing, non-string, or blank code
{ "ok": false, "error": "No access code provided" }
```

### `POST /api/verify-key`

Verifies a parent-supplied Gemini API key with a minimal live call. Rate-limited per IP.

```json
// request
{ "apiKey": "..." }
// 200 — key verified
{ "ok": true }
// 200 — present but rejected key
{ "ok": false, "error": "That key could not authenticate with Gemini." }
// 400 — missing, non-string, or blank key
{ "ok": false, "error": "No API key provided" }
```

### `GET /api/free-generation-grant`

Returns the server-authoritative free allowance for `X-Installation-Id`. The read is rate-limited
per IP and never creates or spends a grant. It returns `503` when the project Gemini key is absent
or the durable daily provider-start ceiling is exhausted, allowing clients without another
credential to hide the unavailable AI path.

```json
{ "ok": true, "remaining": 10, "limit": 10 }
```

---

## Feedback

### `POST /api/report`

Opens a private GitHub support issue from the in-app "report a bug / suggest a feature" form
(Settings → About → Send Feedback). Unauthenticated and a *write*, so it is rate-limited per IP with
a deliberately tight budget (5/min, vs the oracles' 10). Every issue is labelled `user-report` plus
`type:bug` / `type:feature`.

This endpoint is one of **two** front doors onto the same core. Validation, the honeypot, the issue
Markdown, and the error wording all live in `$lib/server/report.ts`; the `/feedback` page's form
action calls it too, and throttles into the same `reportBucket` so the pair shares one budget rather
than doubling it. Change the behaviour there, not here — this route only adds the JSON wire shape.
The page's action additionally echoes the submitted values back on failure and answers success with
a 303 redirect, neither of which a JSON endpoint needs.

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
// 200 — no private issue URL is exposed to the reporter
{ "ok": true }
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
via `$env/dynamic/private`; `GITHUB_ISSUE_REPO` overrides the default private repository
`KyleMit/splotch-feedback`. The optional `device` payload is shaped by the shared, dependency-free
`web/src/lib/platform/deviceReport.ts` (also used client-side to preview exactly what will be sent)
and re-sanitized server-side (known keys only, single-line, length-capped) before it reaches the
issue body. Because the endpoint is an unauthenticated public write and the message + device values
are attacker-controlled, both are run through `escapeIssueMarkdown()` (same seam) before they are
embedded in the Markdown body — it backslash-escapes `@`-mentions, `#`-references, image embeds
(`![…]`), and raw `<` HTML so a submitter can't make the issue notify people or load remote content.
See ADR-0060.

### `POST /api/report-image`

Privately reports the AI result currently visible in `AiImageResult`. This is a separate,
credentialed endpoint because its multipart body carries child-created image content. It accepts the
same `X-Access-Token` or `X-Api-Key` header as generation. A managed token must still be active; a
BYO key is verified against the provider. Valid reports are limited to 3/hour per managed token or
3/hour per BYO caller IP. Authorization runs before multipart parsing.

```text
Content-Type: multipart/form-data
X-Access-Token: <active token>  # or X-Api-Key

drawing=<png|jpeg|webp Blob>
output=<png|jpeg|webp Blob>
style=<StyleName or empty>
```

The two images must be non-empty and total no more than 4 MiB. `style` is a closed server-side enum:
an arbitrary value is rejected with 400, and no client-supplied prompt is accepted. The server
rebuilds the exact light-theme generation prompt from the shared base prompt and selected style.

After the client disclosure is confirmed through the dedicated image-report policy configured in
Parent Center, the server writes four objects to the site-wide `ai-image-reports` Netlify Blobs
store under one opaque report-id prefix: the input drawing, output image, resolved `prompt.txt`, and
`metadata.json` (report time, deletion time, style, and MIME types). It then creates a private
support issue carrying the blob prefix. If notification fails, the bundle is deleted and the request
fails rather than leaving unreachable evidence.

A scheduled `netlify/functions/purge-image-reports.ts` function scans every paginated store page
daily and deletes report objects older than 30 days. Humans commit to reviewing reports within 24
hours. See ADR-0104.

```json
// 200 — the opaque id supports a private early-deletion request; it grants no blob access
{ "ok": true, "reportId": "1723123456789-550e8400-e29b-41d4-a716-446655440000" }
// 400 — invalid body, images, size, or style
{ "ok": false, "error": "That picture could not be reported." }
// 403 — invalid or expired generation credential
{ "ok": false, "error": "Invalid access token" }
// 503 — private reporting or evidence storage unavailable
{ "ok": false, "error": "Picture reporting is not available right now. Please try again later." }
```

---

## Telemetry

### `POST /api/csp-report`

First-party receiver for browser CSP violation reports (issue #457) — the `report-uri` / `report-to`
target of the site's `Content-Security-Policy` header (root `netlify.toml`, which also sends the
matching `Reporting-Endpoints: csp="/api/csp-report"` header). Violations land as structured
`[csp-report]` lines in the Netlify function log — the app's only telemetry sink (no third-party
reporting by design; same stance as `handleError` in `hooks.server.ts`).

Browsers post these unauthenticated, so there is no credential gate. Accepted `Content-Type`s:
`application/csp-report` (the legacy `report-uri` batch, `{"csp-report": {…kebab-case…}}` — Firefox
and Safari), `application/reports+json` (the Reporting-API batch, an array of
`{type: "csp-violation", url, body: {…camelCase…}}` — Chromium), and plain `application/json` for
tooling; anything else is `415`. Abuse is blunted the same way as `/api/report`: a per-IP rate limit
(10/min, the standard `throttled()` 429) plus hard caps — body over 32 KiB is `413`, at most 10
reports are logged per payload, and every logged field is length-capped. Each report is normalized
to one JSON log line (`documentURL`, `blockedURL`, `directive`, `disposition`, `sourceFile`, `line`,
`column`, `sample`).

Every accepted payload — including malformed JSON, which is silently dropped — is answered `204`
with no body; browsers ignore the response, so there is nothing to return.

---

## Admin (access-token management)

The authenticated `/admin` page shows the exact current UTC day's provider starts against the daily
ceiling. To keep page load bounded, it reads at most 200 records from the `free-generation-grants`
store and labels all grant-derived success, failure, active/exhausted, reservation, and activity
figures as sampled. The raw Capacitor identifier is never sent or stored.

JSON twin of the server-rendered `/admin` console, driven by `tools/api-smoke/lib/adminClient.mjs`
(the local and deploy smoke tests). Both front doors call the same core
(`web/src/lib/server/admin.ts` \+ `web/src/lib/server/tokens.ts`) — the web console executes it
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
`401 { "ok": false, "error": "Unauthorized" }`. All methods return the same snapshot shape so
mutations never need a follow-up fetch:

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
ADR-0025). `tools/api-smoke/blobs-smoke.mjs` asserts it is `true` against a real deploy.

| Method   | Body                  | Effect                                                            |
| -------- | --------------------- | ----------------------------------------------------------------- |
| `GET`    | —                     | List tokens + invite URLs                                         |
| `POST`   | `{ "token": "name" }` | Add a token. `400 { ok: false, error }` when empty or duplicate.  |
| `DELETE` | `{ "token": "name" }` | Remove a token (idempotent). Also clears the token's usage tally. |

Mutations are etag compare-and-set writes with a few retries; if concurrent admin mutations keep
colliding (possible under Blobs eventual consistency, ADR-0025), `POST`/`DELETE` return
`409 { ok: false, error }` — safe to retry as-is.

A mutation on an instance where Blobs is configured but unreadable — the read threw, or every
seed-race confirmation read threw — returns `503 { ok: false, error }` and changes nothing. Writing
into the in-memory fallback there would report a token add/revoke that the durable list never saw
and that vanishes on recovery. The fallback still absorbs writes when `getStore()` itself fails,
which is local dev **and** the deployed-without-Blobs-context case (ADR-0025) — in the latter that
is a known false success, mitigated only by the `persistent: false` banner (issue #798). The status
per failure reason is `MUTATION_FAILURE_STATUS` in `web/src/lib/server/tokens.ts`, shared with the
`/admin` form action so both front doors answer the same failure identically.

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
(login success/failure, the bearer gate, and a token add/remove round-trip), the CORS contract
(`OPTIONS /api/*` → 204 carrying the CORS set, a non-`OPTIONS` `/api/*` response carrying it too,
and neither carrying the SSR `SECURITY_HEADERS`), the `verify-access-code` shape, `report`'s
validation + honeypot + graceful-unconfigured path (no `GITHUB_ISSUE_TOKEN` in the smoke env, so no
real issue is created), `csp-report`'s two payload formats + caps, and `generate-image`'s auth gate
(invalid token → 403, then the shared per-IP 429 once the verify budget is burned; valid token minus
image → 400 — every case is rejected before the model call), then tears the server down. No Gemini
key or Netlify Blobs needed; successful generation and `verify-key` (which make live model calls)
are out of scope. Use it to sanity-check the contract after changing any endpoint — it's the cheap
counterpart to the Playwright admin E2E in `tests/admin.spec.ts`. CI runs it in the `unit` job of
`test.yml` on every push/PR, so a contract regression fails the PR instead of shipping.

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
