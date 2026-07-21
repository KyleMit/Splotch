# ADR-0066: Snapshot Undo Reinstated — Paper Raster + Tiered Pre-Stroke Snapshots

**Status:** Active — supersedes ADR-0033 (and with it ADR-0035 keyframing and ADR-0036
simplification); device verification of the perf gates is pending (tracked on PR 442). Amended by
ADR-0068 (2026-07): the crayon's "live-equals-fold" contract narrows again — closed passes commit as
live-captured rasters the fold blits, so only the open pass's short repaint window re-renders (and
is allowed to re-roll nondeterministic texture). **Date:** 2026-07

## Context

ADR-0033 replaced the original full-canvas undo-snapshot stack (ADR-0004) with a command log
replayed over a single baseline raster, to kill two costs: ten 4×-DPR rasters resident (~160 MB on a
tablet) and a full-canvas copy at every gesture start. It then needed two structural patches —
ADR-0035 keyframing (a single long scribble is one command holding thousands of ops, so undo replay
went O(total ops)) and ADR-0036 commit-time simplification (shrink the stored ops so keyframes
rarely fire) — plus a hard determinism contract: every brush must replay bit-identically from stored
ops.

The crayon brush (ADR-0065) broke the balance. Its commands bypass ADR-0036 simplification wholesale
(RDP re-fits flip binary-tooth texels; reordering would move the `crayonFlush` mix markers), so raw
~1200-op crayon strokes hit the ADR-0035 keyframe threshold (384) that was calibrated for
*simplified* pen ops. Phase 0 of the evaluation (`perf:undo`, iPad-Pro profile, 4× throttle)
confirmed two structural defects:

* **Every multi-second crayon stroke keyframed** — a full-drawing replay with pattern fills and
  flush stamps at every pointerup: commit hitch 1.2–2.2 s per stroke end.
* **Crayon undo depth collapsed to ~1** — `MAX_KEYFRAMES = 1` folds all older history into the
  baseline on each new keyframe, so a crayon session left the child a single undo step instead
  of 20.

Patching replay further (crayon-aware thresholds, rolling snapshots) would deepen the determinism
constraint that had already cost three ADRs of machinery, and it forecloses brush directions the
crayon wants next (soft fractional-alpha tooth, nondeterministic grain — all illegal under
bit-identical replay). The alternative was reversing ADR-0033 — but the naïve pre-0033 snapshot
stack was rejected for real reasons (memory, per-gesture copy), so the reversal needed a design that
kept its wins.

## Decision

**The committed drawing is a raster, not a log.** `undoHistory.ts` promotes the baseline to the
committed source of truth (the "paper" raster, a `max(w,h)` square), with a bounded stack of
pre-stroke snapshots:

* **Commit** (`pushCommand`): copy the pre-stroke paper onto the snapshot stack (depth
  `MAX_UNDO_STACK_SIZE = 20`), then fold the stroke's ops into the paper via the same shared
  `renderOp`. One full-canvas `drawImage` per commit at pointerup (`engine.snapshot` mark) — cheaper
  than pre-ADR-0033, which copied at gesture *start* and kept every snapshot live.
* **Tiered memory**: the `K_LIVE = 2` most recent snapshots stay live rasters (~30 MB each at 2× DPR
  on a 13″ iPad — instant common undo); older entries encode to a **lossless blob** off the commit
  path (`canvas.toBlob('image/webp', 1)` — lossless on Chromium; WebKit falls back to PNG per spec)
  and decode only on deep undo. Worst-case history is paper + `K_LIVE` × full raster + (20 −
  `K_LIVE`) × encoded blob, transiently one extra raster while a fresh demotion's encode is in
  flight. The measured blob sizes are Chromium-lossless-WebP, harness-derived: 1.4–2 MB per
  crayon-heavy snapshot, so 30 + 2 × 30 + 18 × 1.4–2 ≈ 115–126 MB analytic on the biggest iPad
  raster (the container harness itself observed ≈ 92–120 MB) — versus ~600 MB for 20 naïve live
  snapshots. Those blob sizes do not transfer to WebKit: Safari (desktop and iOS) has no canvas WebP
  encoder, so every cold snapshot takes the PNG fallback, which compresses the crayon's noisy
  binary-alpha texture markedly worse (plausibly 2–4× per snapshot) and encodes slower — the ≲ 150
  MB and encode-smoothness gates are therefore decided by the on-device run, whose console driver
  reports per-entry blob KB. The tier re-balances in both directions: an encoded entry that rises
  into the `K_LIVE` window (undo popping the stack, or a commit landing on an undo-shallowed one)
  re-inflates back to a live raster off the hot path (`reinflateHotSnapshots`), so the invariant
  holds after undo-then-draw, not only while the stack grows.
* **Undo is queued and async** (`engine.ts undo()`): deep entries decode before they blit, so rapid
  taps serialize through a promise chain; each step repaints, updates undo/empty state, and the
  chain is returned so the E2E harness can await settlement.
* **Undo/resize/remount/export are all blits** (`repaintAll`: one paper `drawImage` + pending +
  in-flight ops) — `paintStateThrough` and the whole replay machinery are gone.
* **Magic-sheet hazard carried over**: commands are retained as ops (`pendingCommands`) only while
  the magic sheet is unready — folding then would bake a magic op's intentionally-blank pixels.
  Folding stops at the first blocked command so cross-command ordering (eraser, crayon mix) is
  preserved; each snapshot stores the pending set it was taken with.
* **Deleted**: the command log, keyframes (ADR-0035), `commandSimplify.ts` + `strokeSimplify.ts` and
  the whole ADR-0036 pipeline (~1000 lines + their tests), the `setUndoMode`/`setSimplifyParams` dev
  seams, and the `perf:sweep`/`perf:units` harnesses that tuned them.
* **Ops are still recorded per stroke** (`recordOp`) — not for undo, but because the commit fold and
  the pending-window/in-flight repaint render them; per-op crayon seeds and `crayonFlush` markers
  stay so the fold reproduces the live pixels byte-exactly.

One accepted semantics change: margin ink drawn outside a rotation-locked paper (ADR-0050) is now
cropped permanently at commit (the fold clips at the paper square), where the replay era resurrected
it on the next rotation. The E2E spec pins the new behavior; ADR-0050 carries the matching
amendment.

Evaluation method (PR 442): both systems shipped in one build behind a `setUndoMode` dev seam,
A/B-driven by `perf:undo --undo-mode=both` and the iPad console driver, then the loser was deleted.
The container proxy decided structure (depth-20 everywhere, zero keyframes, `engine.draw` unchanged,
blob budget); the **absolute** gates — undo p95 < 50 ms, commit hitch ≈ one 120 Hz frame, memory ≲
150 MB, no dropped frames while encoding — need real WebKit + GPU (SwiftShader exaggerates
full-canvas blits) and are verified on-device with `scripts/perf/ipad-console-driver.js` (profiling
skill runbook).

## Alternatives rejected

* **Keep replay, patch the crayon path** (crayon-aware keyframe threshold, rolling one-undo-back
  snapshot). Treats the symptom; keeps the determinism contract that taxes every future brush, and
  crayon undo depth still degrades whenever keyframes fire.
* **Naïve pre-ADR-0033 snapshot stack.** The copy-at-gesture-start cost and ten-plus live rasters
  are exactly what ADR-0033 correctly removed; without tiering, depth 20 would pin ~600 MB.
* **Dirty-rect snapshots.** Same rejection as in ADR-0033: toddler scribbles have near-full-canvas
  bounding boxes exactly when it matters.

## Consequences

* \+ Crayon undo is byte-exact at full depth 20 with zero keyframes — both Phase 0 defects are gone
  by construction, for every current and future brush.
* \+ Brushes are freed from replay determinism: soft fractional-alpha tooth, per-stroke composited
  layers, and nondeterministic grain become legal (only the commit fold and the short
  magic-pending/in-flight repaint window must match live pixels).
* \+ ~1000 lines of simplification/keyframe machinery and two perf harnesses deleted; undo, resize,
  remount, and export are one code path (a blit).
* \+ History memory is bounded and mostly encoded: paper + 2 live rasters + single-digit-MB blobs
  per deep entry, inside the ≲150 MB gate analytically on Chromium blob sizes; the larger WebKit PNG
  blobs are what the device gate settles.
* − Every commit pays a full-canvas `drawImage` at pointerup — the cost ADR-0033 removed, reinstated
  deliberately (once per *commit*, not per gesture start). It is the open device gate; if it drops
  frames on-device, the follow-ups are pooling the copy canvas and moving the copy off the pointerup
  task (`createImageBitmap`), before any return to replay.
* − Deep undo (past the 2 live rasters) pays a blob decode — asynchronous, so the undo button cannot
  jank, but a deep restore is no longer instant; proactive re-inflation of the next-deepest blob is
  the noted follow-up.
* − Blob encodes run after each commit; on-device verification must confirm they don't drop frames
  mid-drawing (`toBlob` encodes off the main thread in Chromium; assumed for WebKit).
* − Undo depth past 20 still loses history (unchanged), and the paper raster remains the single
  source of committed pixels — corruption of it (a failed deep-blob decode loses that one restore)
  has no log to rebuild from.

Supersedes **ADR-0033** (command-replay undo), **ADR-0035** (keyframes — deleted), and **ADR-0036**
(commit-time simplification — deleted). **ADR-0034**'s decision (no virtual canvas; rebuild on
resize from the retained history) survives with the rebuild now a paper blit. Amends **ADR-0065**:
the RDP bypass and replay-cost consequences are moot; the determinism contract narrows to
"live-equals-fold." Amends **ADR-0050**: the margin-ink corner (permanent crop at commit, no
resurrect-on-rotation, snapshot stack instead of a command-retention window). Amends **ADR-0032**:
the mark set drops `engine.keyframe`/`engine.foldBaseline` and gains `engine.snapshot` +
`engine.fold` at commit, with `engine.undo` now paired by an explicit `engine.undo:end` mark. Amends
**ADR-0004**: `commandSimplify.ts` leaves the sibling-module list, and the undo-memory consequence
"resolved by ADR-0033" re-opens as the managed snapshot budget above. Amends **ADR-0015**: the
4×-DPR surface set is the paper + live snapshots (not "backing store + baseline"), and the
per-commit full-canvas copy returns. Amends **ADR-0043**: magic ops ride snapshots and the pending
fold, not the command log, and the margin crop is permanent.
