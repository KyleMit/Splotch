# Handoff — snapshot-undo device verdict (Phases 2–3)

> 2026-07-21 · branch `feat/snapshot-undo` · PR [#442](https://github.com/KyleMit/Splotch/pull/442)
> (stacked on PR 440's head) · Phases 0–1 done, container A/B done; next is the on-device iPad A/B,
> the verdict against the gates, then Phase 3 (rip out the loser)

## Objective & non-goals

**Objective.** Finish the ADR-0033 reversal evaluation: run the on-device iPad A/B (replay vs
snapshot undo), fill the gates table, deliver the verdict, then Phase 3 — delete the losing system
and write the ADR.

**Non-goals.** No pushes to PR [#440](https://github.com/KyleMit/Splotch/pull/440)'s branch
(`claude/splotch-stroke-texture-jye8jz`) or its base — this work lives on `feat/snapshot-undo` / PR
442 only. Crayon visual implementation is a hard keep: if snapshots win, Phase 3 deletes only
replay-serving plumbing (stored seeds, recorded `crayonFlush` markers' replay role, RDP bypass,
byte-stable-replay tests). No UI changes. Don't delete replay before the verdict.

## State

* `feat/snapshot-undo` @ `5f9212f` (this packet's commit; last code commit `581e869`), PR
  [#442](https://github.com/KyleMit/Splotch/pull/442) (base `claude/splotch-stroke-texture-jye8jz` =
  PR 440's head `4a3da0f`). Mirrored to `claude/resume-handoff-undo-snapshots-u7i9yo`. Once the
  437→440 stack merges to main, rebase.
* Commits: `154f2fe` crayon perf scenarios · `23e1a57` snapshot-mode prototype · `d01f3c5`+`581e869`
  A/B harness + iPad driver + undo-queue pacing fix.
* Touched: `web/src/lib/drawing/undoHistory.ts` (snapshot mode: paper canvas, depth-20 stack,
  K_LIVE=2 + lossless blob tier, magic-unready pending ops), `engine.ts` (`setUndoMode` seam, queued
  async snapshot undo), `/dev/engine` page + `web/tests/global.d.ts`, `web/tests/engine.spec.ts` (5
  snapshot specs), `scripts/perf/undo-scenarios.mjs` (`--undo-mode=both`, `--scenarios=`,
  crayon/scribble scenarios), `scripts/perf/ipad-console-driver.js` (same A/B on-device), profiling
  skill docs (via `.ruler/`).

## Decisions made (and why)

* **Phase 0 verdict: keyframe theory confirmed + a second defect.** Every multi-second crayon stroke
  keyframes (raw ops bypass ADR-0036, ~1200 segments vs the 384 threshold), commit hitch 1.2–2.2 s
  at 4× throttle; and `MAX_KEYFRAMES=1` folding collapses crayon undo depth to ~1. PR 442's body has
  the tables.
* **Snapshot commit copies at pointerup, not gesture start** (cheaper than pre-ADR-0033: one copy
  per commit, and it doubles as the fold target).
* **Blob tier ships WebP-quality-1** (lossless on Chromium, PNG per-spec fallback on WebKit).
  Measured: 1.4–2 MB per crayon-heavy snapshot — the "low single-digit MB" assumption holds.
* **Snapshot undo is queued/async** (deep entries decode); harness/driver pace steps on the
  `engine.undo` measure count landing — a plain loop outruns the queue and undercounts.
* **Mode switch drops history** (consolidates committed state into the baseline) — accepted for a
  dev seam; scenarios reset the engine anyway.

## Unverified assumptions

* **The container A/B cannot adjudicate blit-bound costs** — SwiftShader exaggerates full-canvas
  `drawImage`/decode. Snapshot commit max (200 ms–2.9 s) and undo avg (130–460 ms) in the proxy run
  are NOT device predictions. The gates need real WebKit + GPU.
* `canvas.toBlob` encodes off the main thread on WebKit (confirmed Chromium, assumed WebKit).
* WebKit's PNG fallback blob sizes (proxy measured WebP only).
* No jetsam at ~92–120 MB analytic history on min-spec iPad — unmeasured (Xcode gauge).

## Done & verified

* `npm run check` 0 errors · 461 unit tests · all 60 engine E2E incl. 5 new snapshot specs
  (undo-to-empty, depth-20 cap with blob restores, byte-exact crayon undo with 0 keyframes, undoable
  clear, mode-switch consolidation).
* Container A/B (`npm run perf:undo -- --undo-mode=both`): snapshot mode = depth 20 everywhere, 0
  keyframes, `engine.draw` unchanged within noise; full tables in
  `perf-profiles/2026-07-21T15-09-49-810Z-undo-scenarios-4x/undo-scenarios.md` (gitignored, in the
  PR body) — note its snapshot undo-step counts predate the pacing fix (`581e869`); a re-run reports
  all 20.

## Risks & next 3 steps

1. **On-device A/B (needs the user's iPad):** build with `PERF_MARKS=true` +
   `PUBLIC_ENABLE_DEV_HARNESS=true`, open `/dev/engine` in iPad Safari, paste
   `scripts/perf/ipad-console-driver.js` into the Mac's Web Inspector console — it runs all four
   scenarios × both modes and prints the gates numbers (commit max, snap copy max, undo max, history
   MB). Runbook: `ipad-device-profiling.md` in the profiling skill. Watch the Xcode memory gauge for
   the snapshot tier; record a Timeline for frame drops during blob encodes.
2. **Verdict vs gates** (undo p95 < 50 ms; commit p95 < ~16 ms — the paper copy is the risk;
   `engine.draw` unchanged; memory ≲ 150 MB / no jetsam; no frame drops while encoding). If commit
   copy is the only failure, try `createImageBitmap`-based copy / pooling before falling back to
   replay + targeted fixes (rolling one-undo-back snapshot, crayon-aware keyframe threshold).
3. **Phase 3 (only after the verdict):** rip out the loser, update ADR-0033/0034/0035/0036/0065
   (`/update-adrs`), and if snapshots win, file the crayon-upside follow-ups (soft fractional-alpha
   tooth, per-stroke composited layer, nondeterministic grain — all become legal).

## Reread first

* PR [#442](https://github.com/KyleMit/Splotch/pull/442) body — Phase 0 tables, A/B proxy results,
  gates status
* `web/src/lib/drawing/undoHistory.ts` (the snapshot-mode block) and `engine.ts`
  (`queueSnapshotUndo`, `setUndoMode`)
* `scripts/perf/ipad-console-driver.js` + `ipad-device-profiling.md` (profiling skill) — the
  on-device flow
* ADRs 0033/0034/0035/0036/0065 — what Phase 3 must amend
