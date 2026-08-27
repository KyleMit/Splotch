# Splotch HTTP API

The hosted SvelteKit app (Netlify, `https://splotch.art`) serves a small JSON API under `/api/*`. On
the web it's called same-origin; the native apps (a static export with no server) call the hosted
endpoints cross-origin via `apiUrl()` (`web/src/lib/api.ts`, base injected at build time as
`__NATIVE_API_BASE__`).

**CORS:** `hooks.server.ts` answers preflights and adds `Access-Control-Allow-Origin: *` to every
`/api/*` response, with `GET, POST, DELETE, OPTIONS` and the `Content-Type` / `Authorization` /
`X-Access-Token` / `X-Api-Key` / `X-Installation-Id` / `X-Report-Token` headers allowed, plus
`X-Free-Generations-Remaining` and `X-Report-Token` exposed and `Access-Control-Max-Age: 86400` so
native clients can read the updated allowance and cache the preflight instead of paying an OPTIONS
round trip per request. The wildcard is safe because every endpoint is either gated by a credential
the caller must already hold (access token, OpenAI key, or admin session) or rate-limited and
bounded. The credential-less `report` endpoint creates a sanitized private support issue;
`csp-report` is size-capped and bounded to log lines. Nothing under `/api` uses cookies. See
ADR-0007.

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
`X-Access-Token: <allow-listed access token>` **or** `X-Api-Key: <BYO OpenAI key>` (mutually
exclusive; a key takes the BYOK path). The non-secret style enum is the one field in the URL —
`?style=Magical` (any value not in `STYLE_SUFFIXES` is ignored and the base prompt is used). The
body is capped at 15 MiB (`413`); a present, non-allow-listed `Content-Type` is `415`; an empty body
is `400`.

A client that sends `X-Async-Generation: 1` is saying it can collect the picture in a later request.
When a background worker is reachable, the response is then **`202`** with
`{ ok: true, jobId, pollAfterMs }` and the picture is collected from `/api/generation-result`
(ADR-0115); the drawing is written to the job store for the handoff, because a background function's
invocation body is capped in the low hundreds of KB, and the worker takes it in one read-and-delete.
It is at rest for that handoff and no longer; the finished picture is at rest until the poll that
hands it over deletes it. A job expires after 20 minutes, and an hourly sweep deletes whatever was
never collected. The server still answers in-line wherever there is no worker (a plain `vite dev`,
or an unconfigured signing secret), and a client that never sends the header always gets the
synchronous shape. Since every OpenAI effort tier exceeds the synchronous deadline at p90, that path
now usually ends in the controlled `502`.

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

Managed access-code requests also update a durable abuse-prevention tally keyed by a dedicated-key
HMAC grant ID: count, first/latest use, fixed deletion time, latest validated style category, and
latest outcome category. It never contains the code, prompt, drawing, provider detail, or key. The
`[ai-usage]` line for managed and BYOK requests contains only the date, credential category, style
category, and outcome category. A failed upstream call separately logs the provider's message from
the provider adapter or background worker; the usage record does not control those operational logs.
Free requests use the separate allowance records below. The exact tally retention and deletion
behavior is documented with the admin endpoint below.

With neither credential, the request uses the installation's free grant and must send the
privacy-preserving `X-Installation-Id` pseudonym. Free attempts are rate-limited per IP at 15/min,
including validation, safety, upstream, exhaustion, and throttled failures. A durable Netlify Blobs
grant reserves one of ten slots before the provider call and conditionally finalizes it only after a
usable image exists; failures release the reservation. The short reservation lease recovers slots
after a function crash, and compare-and-set writes prevent concurrent requests from spending one
remaining slot twice. That grant store reads with **strong consistency**, unlike the other Blobs
stores: one request writes the reservation and then reads it back after the model call, so an
eventually-consistent read of its own write loses the reservation and fails a generation that
succeeded (ADR-0105's 2026-08-11 amendment). Finalizing still requires a live reservation — a
missing or already-reclaimed one is refused, so two completions can never claim one slot — but it is
no longer allowed to destroy a delivered image: a ledger write that fails is logged and the image
returned without the remaining-count header, leaving the daily ceiling as the spending boundary. A
separate durable compare-and-set counter reserves every free provider start before the model is
called and caps project-funded traffic across all installations and function instances at 500 calls
per UTC day. Provider failures and safety refusals are not refunded from that daily ceiling.

On success returns the image bytes. A free-grant response also carries
`X-Free-Generations-Remaining` and `X-Report-Token` — the latter the signed proof this AI attempt
ran here, which `/api/report-image` requires before it will accept a free-tier report. Exhaustion is
`403` with `{ ok:false, code:"FREE_GRANT_EXHAUSTED", error, remaining:0 }`, which sends the
already-parent-gated client flow to BYOK setup. Failure modes are split so the client can guide the
child correctly (ADR-0023). Exhausting the global daily provider-start ceiling is `503` with
`{ ok:false, code:"FREE_DAILY_LIMIT_EXHAUSTED", error }`; the client routes it to BYOK setup and
records the released installation reservation as `daily-limit`, not as an upstream provider failure.
A **`422`** means the model refused the drawing on **safety** grounds — the child should draw
something *different* (the app shows "let's try drawing something else!"). Every such response
carries a credential-bound `X-Report-Token` with the signed provider reason, so a parent can
explicitly report a possible false positive without making the refused drawing durable first. A
**`502`** is a genuine upstream/empty failure (retryable). The route talks to the model through the
provider-agnostic `AiImageProvider` seam (`web/src/lib/server/ai/provider.ts`, ADR-0047) — the
vendor SDK never appears in route code. The safety vs. empty/error split is decided by
`classifyOpenAiResponse` / `isSafetyError` in `web/src/lib/server/ai/openaiSafety.ts`, and probed by
the manual red-team suite (`npm run redteam`, `tools/redteam/`).

Every deliberate failure, including validation, authorization, safety, server-configuration,
upstream, and throttling responses, uses the canonical JSON body:

```json
{ "ok": false, "error": "Image is too large" }
```

The status distinguishes the cases above; a `429` also carries its required `Retry-After` header.

The model call is hardened to *increase* those refusals (the audience is toddlers). The request goes
through the **Responses API image-generation tool** rather than `/v1/images/edits`, because only
that shape accepts a real system `instructions` field and lets the model answer with a sentence
instead of a picture — the prose refusal the classifier turns into the `422`. `/v1/images/edits` has
neither: against the red-team corpus it returned a finished image for a drawn gun. `tool_choice` is
left on `auto`, since forcing the image tool would remove the model's ability to decline at all. The
instruction and both model ids live in the adapter, `web/src/lib/server/ai/openai.ts`.

### `GET /api/generation-result`

Collects a generation that `POST /api/generate-image` handed to the background worker (ADR-0115).
`?job=<64 hex chars>` is the whole request: the job id is 256 bits of randomness handed only to the
caller that started the job, so possession is the authorization, and it is deleted the moment the
picture is handed over.

| status | meaning                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| `202`  | Not finished yet — poll again. Empty body.                                     |
| `200`  | The picture, with the same headers the synchronous shape returns               |
| `422`  | Safety refusal, same body and `X-Report-Token` as the synchronous shape        |
| `502`  | Upstream/empty failure (retryable)                                             |
| `404`  | No such job, or it expired — a job lives 20 minutes and is deleted on delivery |
| `400`  | Malformed job id                                                               |

Send the same credential headers as the generation itself. They are not re-authorized (the job id
already is the capability) — they are what the report token is bound to, and omitting them only
costs the ability to report that picture. Rate-limited per IP, with a budget sized for waiting
rather than guessing.

Settling the free-generation reservation and minting the report token both happen **here**, not in
the worker: the worker is built without SvelteKit's aliases and can reach neither, which is also why
no credential is ever written into the job record.

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

Verifies a parent-supplied OpenAI API key with a minimal live call. Rate-limited per IP.

```json
// request
{ "apiKey": "..." }
// 200 — key verified
{ "ok": true }
// 200 — present but rejected key
{ "ok": false, "error": "That key could not authenticate with OpenAI." }
// 400 — missing, non-string, or blank key
{ "ok": false, "error": "No API key provided" }
```

A key check that never reached OpenAI is a **third** answer, not the second one:
`503 { ok:false, code:"KEY_CHECK_UNAVAILABLE", error }`. Only a `401`/`403` from OpenAI means the
key is bad; a timeout, a `429`, a `5xx`, or a dead socket means we failed to ask, and reporting that
as a bad key tells a parent something false about a credential that works. Observed on a real
deploy: a cold start outran `VERIFY_KEY_DEADLINE_MS` and a valid key came back rejected.

### `GET /api/free-generation-grant`

Returns the server-authoritative free allowance for `X-Installation-Id`. The read is rate-limited
per IP and never creates or spends a grant. It returns `503` when the project OpenAI key is absent
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

Privately reports either the AI result currently visible in `AiImageResult` or a safety refusal a
parent believes is a false positive. This is a separate, credentialed endpoint because its multipart
body carries child-created image content. It accepts the credential each of generation's three tiers
can present, picked client-side by the shared `aiCredentialHeaders()`
(`web/src/lib/ai/credentials.ts`): `X-Api-Key` (BYOK), `X-Access-Token` (managed invite), or — on
the free tier, where the caller holds neither — `X-Installation-Id` **plus `X-Report-Token`**. A
managed token must still be active; a BYO key is verified against the provider. Valid reports are
limited to 3/hour per managed token, per BYO caller IP, or per free caller IP. Authorization runs
before multipart parsing.

The free tier's credential is not generation's. An installation id is a client-generated 64-hex
string, so accepting it alone would leave an endpoint that writes image blobs and opens private
issues an unauthenticated public write, bounded only by a rate limiter that ADR-0014 defines as a
per-instance throttle — reset on cold start, uncoordinated across instances — rather than an
authorization boundary. Instead `/api/generate-image` mints a **report token** when a free run
returns an image (`X-Report-Token`: an HMAC over the installation id and a short expiry, keyed by
`REPORT_TOKEN_SECRET`) and this endpoint requires it back, so every accepted free report traces to a
generation this server actually performed. Every safety refusal also receives a credential-bound
report token whose signed context carries the provider's refusal reason. The client returns that
opaque token; it never authors the retained reason. With the secret unset, ordinary BYOK and managed
picture reporting still work, while free reporting and refusal-context reporting answer 503. See
ADR-0104's amendments, which also record the two rejected free-tier alternatives (shape-only
acceptance, and requiring a grant record).

```text
Content-Type: multipart/form-data
X-Access-Token: <active token>  # or X-Api-Key, or X-Installation-Id on the free tier
X-Report-Token: <signed context>  # required for every refusal and every free-tier report

drawing=<png|jpeg|webp Blob>
kind=<picture|false-positive-refusal>
output=<png|jpeg|webp Blob>  # required for picture; absent for false-positive-refusal
style=<StyleName or empty>
```

For compatibility with already-installed clients, an absent `kind` is treated as `picture`.

The raw multipart body is capped before it is parsed, at the 4 MiB bundle limit plus a fixed budget
for part headers and boundaries; over that the request is rejected with 413 and never buffered
whole. Every report requires a non-empty drawing; a picture report also requires a non-empty output,
while a refusal report must not carry one. Retained image bytes total no more than 4 MiB. The
pre-parse cap is what bounds the request: the bundle check runs after the payload is already in
memory and weighs only the two images it keeps, so bytes hidden in a discarded field would otherwise
pass it. `style` is a closed server-side enum: an arbitrary value is rejected with 400, and no
client-supplied prompt is accepted. The server rebuilds the exact light-theme generation prompt from
the shared base prompt and selected style.

After the client disclosure is confirmed through the dedicated AI-report policy configured in Parent
Center, the server writes the evidence to the site-wide `ai-image-reports` Netlify Blobs store under
one opaque report-id prefix. Every bundle contains the input drawing, resolved `prompt.txt`, and
`metadata.json` (report category, report time, deletion time, style, MIME types, and the signed
provider refusal reason when applicable); a picture report additionally contains the output image.
The support issue and metadata categorize refusals as `false-positive-refusal` and expose that
server-authenticated reason to the reviewer. If private notification fails, the bundle is deleted
and the request fails rather than leaving unreachable evidence.

A scheduled `netlify/functions/purge-image-reports.ts` function scans every paginated store page
daily and deletes report objects older than 30 days. Humans commit to reviewing reports within 24
hours. See ADR-0104.

```json
// 200 — the opaque id supports a private early-deletion request; it grants no blob access
{ "ok": true, "reportId": "1723123456789-550e8400-e29b-41d4-a716-446655440000" }
// 400 — invalid body, images, size, or style
{ "ok": false, "error": "That AI report could not be sent." }
// 400 — the free tier sent no well-formed installation id
{ "ok": false, "error": "Installation grant unavailable" }
// 403 — the report token is missing, forged, or bound to another generation credential
{ "ok": false, "error": "Invalid access token" }
// 403 — the report token has expired
{ "ok": false, "error": "That AI result can no longer be reported." }
// 413 — the raw multipart body exceeds the pre-parse cap
{ "ok": false, "error": "That AI report is too large to send." }
// 403 — invalid or expired generation credential
{ "ok": false, "error": "Invalid access token" }
// 503 — private reporting or evidence storage unavailable
{ "ok": false, "error": "AI reporting is not available right now. Please try again later." }
```

---

## Telemetry

### `POST /api/csp-report`

First-party receiver for browser CSP violation reports (issue #457) — the `report-uri` / `report-to`
target of the site's composed Content Security Policy (SvelteKit's resource policy plus the
meta-unsupported subset in root `netlify.toml`, which also sends the matching
`Reporting-Endpoints: csp="/api/csp-report"` header). Violations land as structured `[csp-report]`
lines in the Netlify function log — the app's only telemetry sink (no third-party reporting by
design; same stance as `handleError` in `hooks.server.ts`).

Delivery is browser-best-effort rather than complete telemetry. SSR policies are response headers
and carry both `report-uri` and `report-to`. Prerendered resource policies are meta-delivered, where
`report-uri` is forbidden; Chromium and WebKit generate observable `report-to` entries, but network
delivery is not guaranteed, and Firefox versions without Reporting API delivery have no fallback.
The complementary response policy's own violations still use `report-uri`. See ADR-0073 for the
accepted prerendering tradeoff.

Browsers post these unauthenticated, so there is no credential gate. Accepted `Content-Type`s:
`application/csp-report` (the legacy `report-uri` batch, `{"csp-report": {…kebab-case…}}` — Firefox
and Safari), `application/reports+json` (the Reporting-API batch, an array of
`{type: "csp-violation", url, body: {…camelCase…}}` — Chromium), and plain `application/json` for
tooling; anything else is `415`. Abuse is blunted the same way as `/api/report`: a per-IP rate limit
(10/min, the standard `throttled()` 429) plus hard caps — body over 32 KiB is `413`, at most 10
reports are logged per payload, and every logged field is length-capped. Each report is normalized
to one JSON log line (`documentURL`, `blockedURL`, `directive`, `disposition`, `sourceFile`, `line`,
`column`, `sample`). Query strings, fragments, and URL username/password components are removed from
the three URL-shaped fields before logging so credentials and other page-local secrets are not
retained; non-URL CSP sentinel values remain unchanged.

Every accepted payload — including malformed JSON, which is silently dropped — is answered `204`
with no body; browsers ignore the response, so there is nothing to return.

---

## Admin (access-token management)

The authenticated `/admin` page shows the exact current UTC day's provider starts against the daily
ceiling. To keep page load bounded, it reads at most 200 records from the `free-generation-grants`
store and labels all grant-derived success, failure, active/exhausted, reservation, and activity
figures as sampled. The raw Capacitor identifier is never sent or stored.

JSON twin of the server-rendered `/admin` console, driven by `tools/api-smoke/lib/admin-client.mjs`
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
env-seeded read fallback (`false` — local dev, or a deployed function without the Blobs context; see
ADR-0025). `tools/api-smoke/check-deployed-contract.mjs` asserts it is `true` against a real deploy;
that assertion is read-only on production and unrecognized targets, and paired with a token
round-trip only on Netlify preview hostnames.

| Method   | Body                  | Effect                                                                            |
| -------- | --------------------- | --------------------------------------------------------------------------------- |
| `GET`    | —                     | List tokens + invite URLs                                                         |
| `POST`   | `{ "token": "name" }` | Add a token. `400 { ok: false, error }` when empty or duplicate.                  |
| `DELETE` | `{ "token": "name" }` | Remove a token (idempotent). Also requests immediate deletion of its usage tally. |

Mutations are etag compare-and-set writes with a few retries; if concurrent admin mutations keep
colliding (possible under Blobs eventual consistency, ADR-0025), `POST`/`DELETE` return
`409 { ok: false, error }` — safe to retry as-is.

A mutation returns `503 { ok: false, error }` and changes nothing whenever durable storage is
unavailable in a production-shaped runtime: `getStore()` threw, a Blobs read threw, or every
seed-race confirmation read threw. Writing into the in-memory fallback there would report a token
add/revoke that no durable list saw. Only Vite dev accepts mutations into memory; its list is
deliberately process-local so the admin workflow remains usable without Blobs. The status per
failure reason is `MUTATION_FAILURE_STATUS` in `web/src/lib/server/tokens.ts`, shared with the
`/admin` form action so both front doors answer the same failure identically.

Invite URLs are built from the request origin, so they point at the host that served the API.

Managed-code usage tallies are keyed by `grant-v1/HMAC-SHA256(USAGE_GRANT_ID_SECRET, code)` rather
than the raw code. Each minimized record contains only a count, first/latest timestamps, fixed
deletion timestamp, latest closed art-style category, and latest outcome category. Its deletion
timestamp is 30 days after the first request in that tally and later uses never extend it. Reads
omit and delete a tally at that exact boundary; a daily scheduled function removes expired inactive
records, normally within 24 hours, and also drops legacy raw-keyed records. If immediate cleanup
during `DELETE` fails, the fixed deadline remains the backstop. Rotating `USAGE_GRANT_ID_SECRET`
starts new opaque IDs without making old records readable through current codes; the scheduled purge
still removes them at their existing deadlines.

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

Run `npm run test:api:smoke` to check the local `/api/*` contract end-to-end. It's self-contained —
it boots a throwaway `vite dev` with a test `ADMIN_ACCESS_TOKEN`, exercises the admin auth flow
(login success/failure, the bearer gate, and a token add/remove round-trip), the CORS contract
(`OPTIONS /api/*` → 204 carrying the CORS set, a non-`OPTIONS` `/api/*` response carrying it too,
and neither carrying the SSR `SECURITY_HEADERS`), the `verify-access-code` shape, `report`'s
validation + honeypot + graceful-unconfigured path (no `GITHUB_ISSUE_TOKEN` in the smoke env, so no
real issue is created), `csp-report`'s two payload formats + caps, and `generate-image`'s auth gate
(invalid token → 403, then the shared per-IP 429 once the verify budget is burned; valid token minus
image → 400 — every case is rejected before the model call), then tears the server down. No model
key or Netlify Blobs needed; successful generation and `verify-key` (which make live model calls)
are out of scope. Use it to sanity-check the contract after changing any endpoint — it's the cheap
counterpart to the Playwright admin E2E in `tests/admin.spec.ts`. CI runs it in the `unit` job of
`test.yml` on every push/PR, so a contract regression fails the PR instead of shipping.

`test:api:smoke` deliberately runs against `vite dev`, which has **no** Blobs or deployed CDN
configuration. The normal real-deploy gate is `npm run test:deploy:smoke`:

```bash
DEPLOY_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
ADMIN_ACCESS_TOKEN=… npm run test:deploy:smoke
```

It checks the deployed `/`, `/privacy`, and SSR-rendered `/admin` routes, security and cache
headers, exact ADR-0030 version freshness, both native CORS origins, representative canonical
failures that cannot reach a model call, and the admin-token persistence contract. The workflow
probes production daily with a read-only `persistent:true` assertion; a manually targeted Netlify
preview also completes the token write/read/delete round-trip. Manual dispatch accepts an optional
preview or production URL and otherwise uses production. The unrelated GitHub Pages
`deployment_status` event is not a trigger or target source. Checks with an explicit preview URL
compare the deployed version to their selected ref exactly; production checks require the version
shape and no-cache policy but allow the build to trail docs/tooling-only commits excluded by
ADR-0070, including when its canonical URL is entered explicitly.

To isolate only the ADR-0025 Blobs failure mode, run `npm run test:blobs:smoke`:

```bash
BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
```

It logs in and asserts the snapshot's `persistent` is `true` (false ⇒ Blobs is dead on that deploy).
Production and unrecognized targets stop after that read. A Netlify preview also round-trips a
unique token through Blobs and cleans it up. The full hosted gate uses the same target-sensitive
persistence contract.

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
