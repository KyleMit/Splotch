# Move content-type parsing into a shared `http.ts` helper

**Priority/category:** P2[duplication] · **Cluster:** C11 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/api/generate-image/+server.ts:33-34` (`contentTypeOf`) and
`web/src/routes/api/csp-report/+server.ts:104-107` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Extract the one-line normalizer into `web/src/lib/server/http.ts` and use it
in both routes. The deferred implementation was correct; it was only blocked by pre-existing failing
test files that no longer exist.

## Original finding (condensed)

The exact "strip params, trim, lowercase the Content-Type" expression is written twice —
generate-image's `contentTypeOf` arrow and an inline copy in csp-report. Both endpoints branch on
Content-Type for correctness (multipart vs raw body; the telemetry format allowlist), so silent
divergence is a real behavioral bug risk, and the pattern belongs beside `readJsonBody`.

## Why it was deferred

"Implementation failed": the shared normalizer and both route updates were implemented with passing
focused tests, but the burndown's `npm run test:unit` gate was red because of **two pre-existing,
unrelated untracked test files** in that environment (13 unrelated failing assertions), so no commit
was made. No design or review objection was recorded.

## Current state of the code

Still holds verbatim at HEAD. generate-image moved to lines 31-32 (`contentTypeOf`, used at line 59
for the multipart branch and line 91 for the raw `mimeType`); csp-report's inline copy is now at
lines 113-116. The working tree is clean — the untracked failing test files that blocked the
burndown run are gone, so the original blocker no longer exists.

## Options considered

Only trivial variants exist (helper location, name). `http.ts` is the right home — both callers are
server routes, and it already hosts the sibling request-parsing helpers (`readJsonBody`, `asRecord`,
`stringField`). One naming note: the finding proposes `contentType(request)`, but csp-report already
has a local `const contentType` it would shadow; prefer generate-image's existing name
`contentTypeOf(request)` so both call sites read the same and no local rename is forced beyond
deleting the duplicates.

## Recommendation

Add to `web/src/lib/server/http.ts`:

```ts
export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}
```

Delete generate-image's local arrow (its two call sites keep the same name) and replace csp-report's
four-line inline expression with `const contentType = contentTypeOf(request);`. Add a small unit
test (params stripped, case folded, absent header → `''`).

No interaction with the error-shape decision (finding 1) — this helper never touches a response. It
composes trivially with the oversized-body extraction (finding 3); doing both in one `http.ts` pass
is fine.

## Suggested next step

Re-stage in docs/AUDIT.md as-is (with the `contentTypeOf` naming note); the verification gate that
killed the run was environmental and is already clear. Verify with
`grep -rn "split(';')" web/src/routes` (expect no hits) and `npm run test:api:smoke`.
