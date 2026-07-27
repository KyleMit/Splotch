# `generateAiImage` bundles six concerns in one 95-line try/catch

**Priority/category:** P2[complexity] · **Cluster:** C02 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/aiImage.ts:94-188` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**DROP — already resolved.** The decomposition the finding asked for landed on main between the
pinned SHA and HEAD, in almost exactly the proposed shape.

## Original finding (condensed)

At f934d43, `generateAiImage` opened the modal, exported the canvas, set the preview, encoded WebP,
built auth headers, fetched, switched over four response kinds, and drove auto-save — all in one
~95-line function with a trailing `catch`/`finally`. Proposed extracting the header assembly
(`buildGenerateHeaders`) and the response switch + finish/auto-save (`handleAiResponse`) so the
top-level function reads launch → export → upload → dispatch.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Fully decomposed at HEAD (`web/src/lib/drawing/aiImage.ts`, merged via the audit-burndown PRs
between f934d43 and 32394ab):

* `exportUploadImage` (lines 121-144) — canvas export, stale-run check, preview slot-in, WebP
  transcode with PNG fallback.
* `buildRequest` (lines 151-164) — Content-Type plus BYOK-vs-managed auth header selection and the
  endpoint URL. This is the finding's proposed `buildGenerateHeaders`, widened to shape the whole
  request.
* `applyResponse` (lines 170-196) — the four-kind response switch, returning
  `'committed' | 'failed'` so the caller decides on auto-save. This is the proposed
  `handleAiResponse`, with the auto-save call hoisted into the orchestrator instead of buried in the
  handler — a strictly better split than the finding sketched.
* `autoSaveImages` (lines 86-114) and `createDrawingDeduper` (60-70) — auto-save + dedupe, already
  separate.

`generateAiImage` itself (lines 198-243) is now ~45 lines and reads exactly as the finding wanted:
launch modal → export/upload → build request → fetch → apply response → conditional auto-save, with
the `catch`/`finally` handling only timeout/abort classification and run teardown. The `runId`
ownership checks survived intact. The test suite grew from 387 to 407 lines
(`web/src/lib/drawing/aiImage.test.ts`) and covers the safety/throttle/error/timeout branches plus
the new upload-format and deduper seams.

## Recommendation

Nothing to do. The landed decomposition matches or improves on every element of the proposal;
re-staging it would be asking for work that is already merged.

## Suggested next step

Dropped — nothing to do.
