# Extract credential-header assembly; stop hard-coding the auth header names client-side

**Priority/category:** P3[duplication] · **Cluster:** C02 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/aiImage.ts:135-142` (also `web/src/hooks.server.ts:63`) —
pinned at SHA f934d43 **Draft patch:** none

## Verdict

**DROP — already resolved.** A shared constants module exists at HEAD and every consumer — client
upload, server CORS list, and the endpoint's header reads — imports it. The header names are defined
exactly once.

## Original finding (condensed)

At f934d43, the upload's auth headers were built inline with bare `'X-Api-Key'` / `'X-Access-Token'`
string literals in `aiImage.ts`, and the same literals appeared independently in the server CORS
allow-list in `hooks.server.ts` — no shared source of truth, so a rename would drift silently.
Proposed named constants in a small module both client and server import, plus an extracted
`buildAuthHeaders` function for the BYOK-vs-managed selection.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Implemented at HEAD, in the exact proposed shape:

* `web/src/lib/apiHeaders.ts` — the shared module:
  `export const ACCESS_TOKEN_HEADER = 'X-Access-Token'; export const API_KEY_HEADER = 'X-Api-Key';`
* `web/src/lib/drawing/aiImage.ts:13,158-159` — the client imports both constants; the
  BYOK-vs-managed selection lives in the extracted `buildRequest` function (see the C02 companion
  doc `p2-complexity-generate-ai-image.md`).
* `web/src/hooks.server.ts:4,21` — the CORS `Access-Control-Allow-Headers` value is now a template
  literal over the same constants.
* `web/src/routes/api/generate-image/+server.ts:4,76-77` — the endpoint reads the incoming headers
  through the constants too, which the original finding didn't even ask for.

A grep for `X-Api-Key|X-Access-Token` across `web/src` finds the literals only in `apiHeaders.ts`
(plus a prose comment in `hooks.server.ts`). The CAPACITOR-split concern checks out clean:
`apiHeaders.ts` is a leaf module with zero imports, lives outside `lib/server/`, and is therefore
safe for client code on both build targets — the server importing a client-safe module is fine in
either direction that matters.

## Recommendation

Nothing to do. The single-source-of-truth module, the client extraction, and the server references
all exist; the drift hazard the finding described is gone.

## Suggested next step

Dropped — nothing to do.
