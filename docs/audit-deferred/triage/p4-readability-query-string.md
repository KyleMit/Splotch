# Manual query-string concatenation for the generate-image endpoint

**Priority/category:** P4[readability] · **Cluster:** C02 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/aiImage.ts:141-142` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**DROP — not worth doing.** The line survives at HEAD but its context changed: it now sits isolated
inside a small, well-commented request-shaping function, it is correct as written, and the
`URLSearchParams` swap is a zero-behavior style preference that no longer has a larger refactor to
ride on.

## Original finding (condensed)

The endpoint URL is built by hand-concatenating `?style=` with a conditional and a manual
`encodeURIComponent`. It works, but it's string surgery that breaks the moment a second query param
is added, and it mixes "is there a style" branching into the URL literal. Proposed building the
query with `new URLSearchParams({ style })` (empty string when no style).

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still present, verbatim, now at `web/src/lib/drawing/aiImage.ts:161-162` inside the extracted
`buildRequest` function:

```ts
const endpoint = apiUrl('/api/generate-image')
  + (style ? `?style=${encodeURIComponent(style)}` : '');
```

The C02 anchor refactor (see `p2-complexity-generate-ai-image.md`) already merged without this
change, so the "falls out of the same extraction" opportunity is gone. What remains is one
correctly-encoded single-param URL in a 14-line function whose header comment already explains the
design (secrets ride in headers; the non-secret style enum is the query param). `style` is a
`StyleName` enum value (lowercase identifiers), so `encodeURIComponent` vs `URLSearchParams` produce
identical output here — the swap changes nothing observable, and the test suite asserts the fetch
call either way.

## Recommendation

Skip it. The finding's only forward-looking argument — "breaks when a second param is added" — is
speculative (YAGNI): the endpoint has had exactly one query param since ADR-0064, and if a second
one ever arrives, switching to `URLSearchParams` in *that* change is the natural, zero-extra-cost
move. A standalone commit whose entire content is one stylistic one-liner doesn't clear the bar for
review and CI cost on a P4.

## Suggested next step

Dropped — nothing to do now. If `/api/generate-image` ever grows a second query parameter, build the
query with `URLSearchParams` as part of that change.
