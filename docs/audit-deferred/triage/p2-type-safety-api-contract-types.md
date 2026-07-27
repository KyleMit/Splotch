# Share request/response contract types between routes and client callers

**Priority/category:** P2[type-safety] · **Cluster:** C11 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/aiCredential.ts:11-18`;
`web/src/routes/api/verify-access-code/+server.ts:32`;
`web/src/routes/api/verify-key/+server.ts:28`; `web/src/routes/api/report/+server.ts:101`;
`web/src/lib/drawing/aiImageResponse.ts:1-5` — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p2-type-safety-share-request-response-contract-types-between-routes-and.patch

## Verdict

**OPTIONS — real tradeoffs.** The fix itself is wanted; the fork is *where the contract types live*
— a shared client-safe wire-type module versus per-endpoint exports from each `+server.ts` — and
that choice must land the same way as the sibling admin finding (C08, "native page hand-rolls type
guards"), whose rolled-back draft used per-endpoint exports. Lean: **shared module**, applied to
both surfaces.

## Original finding (condensed)

Every endpoint's response shape is re-declared, loosely, on the client with no compile-time link to
the server: `aiCredential.ts` hand-writes an all-optional `VerifyPayload`, `ReportForm.svelte`
inlines its own `{ ok?, error?, url? }`, and nothing fails to compile if the server drops
`accessCode` or renames `error`. Proposed: declare each wire contract once in a client-safe module
and have routes annotate (`satisfies`) and clients import the same types.

## Why it was deferred

"Implementer failed to deliver a fix round." The reviewer's unresolved objection: **generate-image
and `drawing/aiImageResponse.ts` remain entirely unlinked** — the binary success and 422/429/error
wire semantics are still independently encoded on each side, so server changes compile while
silently breaking the client, leaving the generate-image portion of the finding unresolved. The
draft (2 commits: shared `$lib/apiContracts.ts` + `satisfies` on the three JSON routes + typed
client parses) passed type-check/unit/lint gates; only the review scope objection stood.

## Current state of the code

The finding still holds. `aiCredential.ts` was refactored (its local type is now `VerifyPayload`)
but is still hand-written and all-optional; `ReportForm.svelte` still inlines its response type;
`aiImageResponse.ts` still hardcodes 422/429 as local constants that generate-image's
`SAFETY_STATUS = 422` re-encodes independently. No `apiContracts`/`apiTypes` module exists.

**The draft patch no longer applies at HEAD** (`git apply --check` fails on `report`,
`verify-access-code`, and `verify-key` — those routes moved to `asRecord`/`stringField` and
`rateLimitPolicy` arguments). The `apiContracts.ts`, `aiCredential.ts`, `ReportForm.svelte`, and
`http.ts` hunks still apply, so the draft remains a useful starting point, not scrap.

Constraint from finding 1 (`p1-consistency-api-error-shapes.md`): until that lands, the shared
`ApiErrorResponse = { ok: false; error: string }` is *false* for `readJsonBody`'s 400 and all of
generate-image's thrown errors (they are `{ message }` on the wire today). Sequence this after it.

## Options considered

1. **Shared client-safe wire-type module, `web/src/lib/apiContracts.ts` (lean).** Rebase the draft
   and extend it to generate-image (see below). Pros: one canonical home with no server imports, so
   clients never import from route files; naturally hosts the *cross-endpoint* pieces — the
   `ApiErrorResponse` shape that finding 1's `fail()`/`throttled()` should `satisfies`, and
   generate-image's status semantics (`SAFETY_REFUSAL_STATUS`, `THROTTLED_STATUS`) which are
   constants + a binary body, not a per-endpoint JSON type; routes can import it freely. Cons: types
   live away from their producers; diverges from the C08 admin draft's convention unless the admin
   types are migrated into it (a mechanical follow-up).
2. **Per-endpoint type exports from each `+server.ts`** (the C08 draft's convention: export the type
   beside the producer, bind with `satisfies`, clients use type-only imports — erased at compile
   time, so nothing server-side reaches the bundle). Pros: contract sits next to the code that emits
   it; consistent with the admin draft as-is. Cons: the shared pieces still need a home —
   `ApiErrorResponse` can't be exported from `$lib/server/http.ts` for clients (the "never import
   `lib/server` from client code" rule), and generate-image's contract isn't a response type at all
   — so Option 2 ends up needing a small shared module *anyway*, at which point Option 1 is just
   Option 2 consolidated. Also scatters the contract across six route files.

Ranked 1 > 2. The deciding weight is that the reviewer-objection fix (linking generate-image) and
finding 1's `ApiErrorResponse` both require a client-safe shared module regardless; per-endpoint
exports would leave the convention split within this very cluster.

## Recommendation

Lean Option 1, with the explicit consistency rule: whichever home is chosen here must also be the
home for the admin contract types (C08). If C08's nearly-passing patch (per-endpoint exports) is
applied first, migrating `TokenSnapshot`/`LoginResponse`/`TokenMutationError` into `apiContracts.ts`
afterward is mechanical and type-only.

What must change versus the rolled-back draft to survive the recorded objection:

1. **Rebase over HEAD drift** — recreate the `report`/`verify-access-code`/`verify-key` hunks on top
   of the `asRecord`/`stringField` + `rateLimitPolicy` refactor (same `satisfies` additions, new
   surrounding text).
2. **Link generate-image (the objection that killed it).** Move the status semantics into the shared
   module and import them on *both* sides:

   ```ts
   // apiContracts.ts
   export const SAFETY_REFUSAL_STATUS = 422; // Gemini refused on safety grounds (ADR-0023)
   export const THROTTLED_STATUS = 429;
   export type ApiErrorResponse = { ok: false; error: string };
   ```

   `generate-image/+server.ts` replaces its local `SAFETY_STATUS = 422` with
   `SAFETY_REFUSAL_STATUS`, and `aiImageResponse.ts` replaces its local constants with the same
   imports — the 422/429 semantics are then encoded once. (The success body is raw image bytes; the
   shared constants + `ApiErrorResponse` are the linkable part of that contract.)
3. **Sequence after finding 1** so `ApiErrorResponse` describes the real wire shape for every JSON
   failure, and have `fail()`/`throttled()` carry `satisfies ApiErrorResponse` (the draft already
   did this for `throttled()`).
4. Keep the draft's defensive client parsing (`.catch(() => ({}))`, `'error' in data` narrowing) —
   it was not objected to and preserves behavior on malformed responses.

## Suggested next step

Decide the module-vs-per-endpoint convention together with the C08 admin doc, then re-stage in
docs/AUDIT.md with a revised brief (rebased draft + the generate-image linkage above), sequenced
after the error-shape unification. The old patch is a reference, not an apply-able artifact.
