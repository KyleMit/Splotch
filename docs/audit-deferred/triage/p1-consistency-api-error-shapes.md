# Unify the two error-response shapes across the API surface

**Priority/category:** P1[consistency] · **Cluster:** C11 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Normalize every client-facing JSON error to `{ ok: false, error }` via a
`fail()` builder plus a thin per-route wrapper that converts thrown SvelteKit `HttpError`s at the
handler boundary. The deferred run's only blocker was environmental (a sandbox that couldn't write
`.agents/`), not a design or review objection, and the wire change is verifiably safe for every
deployed client.

## Original finding (condensed)

Endpoints emit two incompatible JSON error shapes with no rule for which: `{ ok: false, error }`
(from `throttled()`, `verify-access-code`, `verify-key`, `report`) versus SvelteKit's `{ message }`
(every `throw error(...)` in generate-image / `generationAuthorization`, plus `readJsonBody`'s 400).
The same endpoint can return both — in `report`, a malformed body yields `{ message }` while a
missing `kind` yields `{ ok: false, error }` — so a client cannot parse a 400 without sniffing the
shape. The API skill even advertises "clients surface the `error` field directly", which is false
for every `error()`-thrown response.

## Why it was deferred

"Implementation failed": the code change itself was implemented and verified, but Ruler regeneration
could not update `.agents/skills/api/SKILL.md` because the burndown's nested sandbox denied writes
under `.agents/`, leaving the doc-sync half of the change incomplete. No reviewer objection was
recorded and no patch was kept. In a normal session `npm run ruler:apply` writes both generated
trees fine — the blocker does not exist outside that sandbox.

## Current state of the code

Still fully present at HEAD. The routes drifted since f934d43 (`asRecord`/`stringField` helpers,
`rateLimitPolicy`/`rateLimitKeys` extraction, `config.geminiApiKey()`), but none of that touched the
error shapes. The client-facing `throw error(...)` inventory at HEAD:

* `generate-image/+server.ts` — 400 ("Missing image" ×2), 413 ("Image is too large" ×3), 415
  ("Unsupported image type"), 422 (safety refusal), 502 (upstream failure)
* `generationAuthorization.ts` — 403 ("Invalid access token"), 500 (missing `GEMINI_API_KEY`)
* `http.ts` `readJsonBody` — 400 ("Expected a JSON body"), reachable from every JSON endpoint
* `admin/tokens/+server.ts` — 401 ("Unauthorized") (documented in the API skill as `{ message }`;
  not in the finding's file list but part of the same inconsistency)

`csp-report` is a deliberate exception: its 413/415/204 responses are bodyless by design (browsers
ignore the response) and should stay exempt.

**Wire-compat check (the deployed-native-app hazard):** unification is safe. What clients parse
today, verified at HEAD:

* generate-image — `readAiImageResponse` (`web/src/lib/drawing/aiImageResponse.ts`) branches on
  status only (422 → safety, 429 → throttled) and reads the body via `.text()` into a `detail` that
  `aiImage.ts` only ever logs to the console. Shipped native/multipart clients run the same parser.
  No client reads `message`.
* verify-access-code / verify-key — `aiCredential.ts` reads `data.error` with a `.catch(() => ({}))`
  fallback; a `{ message }` 400 today yields `undefined` and generic copy, so switching it to
  `{ ok, error }` strictly improves what the client can show.
* report — `ReportForm.svelte` reads `data.error` with a fallback string; same strict improvement.
* admin 401 — the native admin page (`routes/admin/native/+page.svelte:79`) branches on
  `response.status === 401` and never reads that body.

No deployed client parses `{ message }`, so no app-store release needs to precede the change.

## Options considered

1. **`fail()` + a handler-boundary wrapper (winner).** Add `fail(status, error, headers?)` to
   `http.ts` and a small `apiHandler()` that catches thrown `HttpError`s and re-emits them through
   `fail()`. Throw-based control flow stays exactly as written — `readJsonBody`'s signature,
   generate-image's deferred `readValidatedImage` thunk, and `generationAuthorization`'s throws all
   survive unchanged — and the invariant is enforced in one place that new endpoints inherit.
2. **Convert every throw site to a returned `fail()` Response (the finding's original proposal).**
   Same wire result, but it threads `Response` unions through `readJsonBody`, the image-reading
   thunk, and `authorizeGenerationRequest`'s already-union return type — more churn, and nothing
   stops the next endpoint from reintroducing a bare `throw error(...)`.

Option 1 wins on churn and on making the shape a guarantee rather than a convention.

## Recommendation

In `web/src/lib/server/http.ts`:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}

export function apiHandler(handler: RequestHandler): RequestHandler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, err.body.message);
      throw err; // genuinely unexpected → SvelteKit 500 + handleError, as today
    }
  };
}
```

Then: reimplement `throttled()` on top of `fail()` (adding the `Retry-After` header); wrap every
`/api/*` handler export in `apiHandler(...)` — including `admin/login` and `admin/tokens`, so the
401 also becomes `{ ok: false, error: 'Unauthorized' }` (client-safe per the check above) — except
`csp-report`, which keeps its documented bodyless responses (leave it unwrapped, or wrapped is
harmless since it throws nothing).

Doc sync in the same change (the part the sandbox blocked): update `.ruler/skills/api/SKILL.md` (the
"clients surface the `error` field directly" claim becomes true; the admin 401 example body; note
csp-report's bodyless exemption) and add the `fail()`/`apiHandler` convention to
`.claude/rules/server-api.md` (direct-edited, not generated), then `npm run ruler:apply`.

Extend `scripts/api-smoke.mjs` with the assertion the finding asked for: every JSON failure body it
already exercises (403 invalid token, 400 missing image, malformed-body 400, admin 401) is
`{ ok: false, error: string }`.

Sequencing within C11: land this first — the contract-types finding
(`p2-type-safety-api-contract-types.md`) wants an `ApiError = { ok: false; error: string }` type
that is only truthful once this ships. Findings 2 and 3 (helper extractions) are independent.

## Suggested next step

Re-stage in docs/AUDIT.md with the wrapper approach and the doc-sync + smoke-test additions folded
into the brief; no patch exists to apply. Land before the contract-types finding.
