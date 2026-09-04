---
paths:
  - "web/src/routes/api/**"
  - "web/src/routes/admin/**"
  - "web/src/lib/server/**"
  - "web/src/hooks.server.ts"
---

# Server & API rules

* Server code is web-only: it never ships in the native bundle. The apps call the hosted endpoints
  via `apiUrl()` (`src/lib/api.ts`). Never import `src/lib/server/*` from client code.
* `/api/*` sends `Access-Control-Allow-Origin: *` (ADR-0007). That wildcard is only safe because
  every endpoint is either gated by a credential the caller already holds or (the telemetry
  receivers `report`/`csp-report`) rate-limited and side-effect-bounded to log lines, and nothing
  under `/api` uses cookies — never add a cookie-authenticated `/api` endpoint.
* Every client-facing JSON error across `/api/*` is the one canonical `{ ok: false, error }` body,
  built by `fail(status, error, headers?)` in `src/lib/server/http.ts`. Wrap every `/api/*` handler
  export in its `apiHandler(...)`, which converts every thrown failure into the same shape at the
  boundary — a SvelteKit `error(...)` keeps its status and message; an unexpected non-HttpError
  becomes `fail(500, GENERIC_ERROR_MESSAGE)` with the standard `[server error]` log line (the
  wrapper bypasses `handleError`, so it carries that logging duty itself) — never let SvelteKit's `{
  message }` body reach a client. `csp-report` is the one exemption (deliberately bodyless
  responses; browsers ignore them) and stays unwrapped.
* Any unauthenticated oracle (login, code/key verification) must be rate-limited per IP via
  `src/lib/server/rateLimit.ts` (ADR-0014). Throttled responses use `throttled(retryAfter)` from
  `src/lib/server/http.ts` — the standard JSON `429` with `Retry-After` — and JSON bodies are parsed
  with its `readJsonBody(request)` (uniform `400` on malformed input). Don't hand-roll either.
  Rate-limit bucket keys come only from `src/lib/server/rateLimitKeys.ts` (lint-enforced —
  ADR-0014's shared-bucket contract).
* The dedicated `verify-access-code` and `verify-key` oracle endpoints deliberately return HTTP
  `200` with `{ ok: false, error }` for ordinary failed verification so validity is not disclosed
  through the status. Non-oracle request validation retains `4xx` responses with the same body
  shape; throttling retains the standard `429`.
* Never branch on user-facing message text to choose a status code or behavior — carry a
  machine-readable field (a discriminated `reason`/`kind`) and derive both status and message from
  it.
* Response shapes are exported types from the `+server.ts` that produces them; clients import them
  instead of re-declaring guards or parsing into `any`.
* Admin auth: the raw `ADMIN_ACCESS_TOKEN` is exchanged once for a derived HMAC session token; all
  secret comparisons must be constant-time (`timingSafeEqual`). The web `/admin` console and the
  JSON `/api/admin/*` endpoints share one core (`src/lib/server/admin.ts` + `tokens.ts`) — the
  console never loops through the API.
* `/api/admin/tokens` mutations return the full snapshot shape (`tokens` + `invites`) so clients
  never need a follow-up fetch — preserve this for new admin endpoints.
* The model-vendor SDK (`openai`) is imported only inside `src/lib/server/ai/` (ADR-0047). Routes
  and other server modules go through the `AiImageProvider` seam (`src/lib/server/ai/provider.ts`) —
  never import the SDK or vendor types outside that directory. (The dev-time asset scripts in
  `tools/` are the one sanctioned exception.)
* When adding or changing an endpoint, update the API reference in `docs/API.md` as part of the same
  change. It is authored in place — the `api` skill only points at it (ADR-0107), so there is
  nothing to regenerate.
* After changing an endpoint, run `npm run test:api:smoke` to validate the live `/api/*` contract
  (self-contained; boots its own test server). CI also runs it on every push/PR (`test.yml` `unit`
  job), so a contract break fails CI even if the local run is skipped. Extend the smoke script
  (`tools/api-smoke/run-local-contract.mjs`) when you add an endpoint or change a response shape.
