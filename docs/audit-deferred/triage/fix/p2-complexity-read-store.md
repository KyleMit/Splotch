# `readStore` bundles store-open, read, seed, confirmation-loop, and fallback into one function

**Priority/category:** P2 complexity · **Cluster:** C08 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/server/tokens.ts:67-111` — pinned at SHA f934d43 **Draft patch:**
none

## Verdict

**FIX — clear winner.** The proposed `confirmSeedRaceWinner` extraction is a small,
behavior-preserving cut along a real seam, it matches the house style the neighboring `mutateList`
extraction (67bb0ac) already set in this same file, and no reviewer ever objected to anything — the
deferral was purely a driver defect.

## Original finding (condensed)

`readStore` is the token module's linchpin and carries five responsibilities in one ~45-line body:
open the store, read the key, seed from env on empty, run the multi-attempt seed-race confirmation
loop, and degrade to the memory fallback. The nested confirmation loop (a `for` with an inner
`try/catch` inside the outer `try`) is the subtle, correctness-critical ADR-0025 lost-seed-race
handling, buried where it is hard to read in isolation. Proposed: extract it as
`confirmSeedRaceWinner(store): Promise<StoreRead>`.

## Why it was deferred

Driver defect, not a code judgment: the run's `.audit-work/current-brief.md` was stale (it still
described the invite-actions finding deferred minutes earlier), the verifier marked this finding
VALID without writing a fresh brief, and the implementer correctly refused to act on the wrong
brief. No implementation was attempted; no objections exist.

## Current state of the code

Fully holds. `readStore` (`web/src/lib/server/tokens.ts:67-111`) is byte-identical to the pinned
version — the f934d43..HEAD churn in this file (67bb0ac's `mutateList` extraction, 782cf6e's
`reason` discriminant, c16b441's comment) all landed in the mutation half below it. The confirmation
loop is at lines 88-98, the `unconfirmed` degradation at 99-100. The test surface is unchanged too:
`tokens.test.ts` has the `freshTokensWithSeedRace(seed, list, hiddenReads)` helper (line 81) and the
`stale-empty seed races` describe block (line 147) exercising the loop through the public API.

## Options considered

1. **Extract `confirmSeedRaceWinner(store)` as proposed** (winner). Names the one subtle block,
   leaves `readStore` reading as open → get → present?-return : seed → confirm → outer-catch →
   memory. Zero behavior change; consistent with `mutateList`.
2. **Also split the seed branch / go further (e.g. `readFromBlobs` helper).** More uniform, but the
   remaining pieces are already flat and self-describing; further cuts would just scatter the
   ADR-0025 commentary. Not worth it.
3. **Do nothing.** The function works and is well-commented — but the finding is right that the
   correctness-critical loop is the one part that deserves a name, and the cost is near zero.

## Recommendation

Implement option 1. Sketch (the `:88-100` block moves verbatim, with the
`SEED_CONFIRMATION_BACKOFF_MS` rationale comment traveling with it):

```ts
// ADR-0025: we lost the seed race (`onlyIfNew` write not modified) — some other
// instance seeded first. Reread until the winner's list is visible; never throws,
// so a transient read failure does not deny a current token.
async function confirmSeedRaceWinner(store: TokenStore): Promise<StoreRead> {
  for (let attempt = 1; attempt <= SEED_CONFIRMATION_ATTEMPTS; attempt++) {
    await sleep(SEED_CONFIRMATION_BACKOFF_MS * attempt);
    try {
      const winner = await store.getWithMetadata(KEY, { type: 'json' });
      if (winner && Array.isArray(winner.data)) {
        return { source: 'blobs', store, list: winner.data, etag: winner.etag };
      }
    } catch {
      // Keep trying so a single transient read failure does not deny a current token.
    }
  }
  console.warn('[tokens] Lost env-seed race but could not confirm the current list');
  return { source: 'unconfirmed', store, list: [] };
}
```

and in `readStore`: `if (!seededWrite.modified) return confirmSeedRaceWinner(store);` (inverting the
current `if (seededWrite.modified)` early-return keeps both arms explicit). Two invariants the
implementer must preserve, both trivially satisfied by a verbatim move:

* The helper **never throws** — the per-attempt inner `catch` stays inside the loop, so the outer
  `catch` in `readStore` (transient-error → memory fallback, no `blobsUnavailable` latch) keeps
  exactly its current reach.
* The `unconfirmed` return keeps `list: []` and no etag, which is what makes `isAllowedToken` deny
  and `mutateList` refuse to write against an unconfirmed read.

Keep the helper unexported: the existing `stale-empty seed races` tests already pin its behavior
through the public API, and exporting it just to test it directly would widen the module surface for
no coverage gain. Verification: `npm run test:unit` (the seed-race describe block), `npm run check`.

## Suggested next step

Re-stage in docs/AUDIT.md as-is (the original Proposed solution is an accurate brief; the only fix
needed is re-running verification so the driver writes a non-stale brief), or just implement
directly — it is a one-function mechanical move.
