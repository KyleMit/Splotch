# Extract the WebP-upload guard predicate in `encodeWebpUpload`

**Priority/category:** P4[readability] · **Cluster:** C02 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/aiImage.ts:37-43` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**DROP — not worth doing.** The line survives at HEAD, but the named-predicate extraction would
restate an adjacent WHY comment without being able to replace it, and the magic-string concern
dissolves on inspection — the two `'image/webp'` occurrences in source are six lines apart in the
same function, and the test's literal *should* stay a literal.

## Original finding (condensed)

The decisive return of `encodeWebpUpload` —
`return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;` — packs three
conditions (encoder produced something, it's actually WebP not a PNG fallback, it's genuinely
smaller) into one ternary whose meaning is carried by the preceding comment. Proposed a local
`isSmallerWebp` predicate plus a `WEBP_MIME` constant.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still present, now at `web/src/lib/drawing/aiImage.ts:43-49`, directly under a three-line comment:

```ts
// A platform without WebP encoding hands back a PNG (or null) here; only take
// the result when it's genuinely smaller WebP, so we never upload a fatter
// re-encode than the original.
return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;
```

The upload-format suite in `aiImage.test.ts` (now 407 lines) covers both branches: "uploads a WebP
copy while keeping the PNG" and "falls back to the PNG upload when the platform cannot encode WebP".
Risk of the change is nil — but so is the payoff.

## Recommendation

Skip it. Three observations:

* The comment is a WHY comment the repo convention explicitly permits — the non-obvious fact is that
  `canvas.toBlob(…, 'image/webp')` *silently returns a PNG* on platforms without a WebP encoder. A
  predicate named `isSmallerWebp` cannot carry that platform quirk, so the comment stays either way
  and the extraction only adds a variable that paraphrases it.
* The `WEBP_MIME` constant would tie the `toBlob` request type (line 44) to the check (line 49) — a
  real but tiny coupling win, since the two literals sit six lines apart in a 24-line function where
  any drift is immediately visible.
* The test's `'image/webp'` literal (`aiImage.test.ts:375`) is an asset, not duplication: the test
  asserts the actual wire value the server dispatches on. Importing the constant there would make
  the assertion tautological — it would keep passing even if the constant were changed to a wrong
  value.

A P4 whose fix adds a line, keeps the comment, and weakens nothing but also improves nothing
measurable is exactly what triage skepticism exists to filter out.

## Suggested next step

Dropped — nothing to do.
