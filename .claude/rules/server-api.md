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
  every endpoint is gated by a credential the caller already holds and nothing under `/api` uses
  cookies — never add a cookie-authenticated `/api` endpoint.
* Any unauthenticated oracle (login, code/key verification) must be rate-limited per IP via
  `src/lib/server/rateLimit.ts` (ADR-0014). Throttled responses use `throttled(retryAfter)` from
  `src/lib/server/http.ts` — the standard JSON `429` with `Retry-After` — and JSON bodies are parsed
  with its `readJsonBody(request)` (uniform `400` on malformed input). Don't hand-roll either.
* Admin auth: the raw `ADMIN_ACCESS_TOKEN` is exchanged once for a derived HMAC session token; all
  secret comparisons must be constant-time (`timingSafeEqual`). The web `/admin` console and the
  JSON `/api/admin/*` endpoints share one core (`src/lib/server/admin.ts` + `tokens.ts`) — the
  console never loops through the API.
* `/api/admin/tokens` mutations return the full snapshot shape (`tokens` + `invites`) so clients
  never need a follow-up fetch — preserve this for new admin endpoints.
* The model-vendor SDK (`@google/genai`) is imported only inside `src/lib/server/ai/` (ADR-0047).
  Routes and other server modules go through the `AiImageProvider` seam
  (`src/lib/server/ai/provider.ts`) — never import the SDK or Gemini types outside that directory.
  (The dev-time asset scripts in `scripts/` are the one sanctioned exception.)
* When adding or changing an endpoint, update the API reference in `.claude/skills/api/SKILL.md` as
  part of the same change.
* After changing an endpoint, run `npm run test:api:smoke` to validate the live `/api/*` contract
  (self-contained; boots its own test server). Extend the smoke script (`scripts/api-smoke.mjs`)
  when you add an endpoint or change a response shape.
