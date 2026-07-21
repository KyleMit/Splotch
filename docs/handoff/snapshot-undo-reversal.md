# Handoff — snapshot-undo reversal (ADR-0033 reconsidered)

> 2026-07-21 · branch `feat/snapshot-undo` (based on PR 440's head `4a3da0f`, so the crayon stack is
> included) · assessment done; next phase is Phase 0 perf attribution on device, then a
> snapshot-undo prototype behind a dev seam and an A/B verdict

## Objective & non-goals

**Objective.** Evaluate reversing ADR-0033 (command-replay undo) back to canvas-snapshot undo,
because (a) undo/stroke-finish perf is unacceptable on a large high-res 120 Hz iPad, and (b) the
replay architecture taxes every brush with determinism constraints (ADR-0065's binary tooth, stored
seeds, flush markers, RDP bypass exist only for replay). Plan agreed with the user:

* **Phase 0** — attribute the current pain on a real iPad with the existing marks.
* **Phase 1** — prototype snapshot mode behind a `setUndoMode('replay' | 'snapshot')` dev seam (the
  `setSimplifyParams` precedent), keeping both systems in one build.
* **Phase 2** — A/B the same scenarios in both modes on-device; verdict against the gates below.
* **Phase 3** — rip out the loser (only after the verdict).

**Non-goals.** Do **not** push to PR [#440](https://github.com/KyleMit/Splotch/pull/440)'s branch
(`claude/splotch-stroke-texture-jye8jz`) or its base (`claude/splotch-stroke-darkness-dpeo8t`) — all
new work goes in a **new PR**. Do not delete the replay system before Phase 2's verdict. No UI/UX
changes.

## State

* Branch `feat/snapshot-undo`, forked from PR 440's head `4a3da0f`
  (`claude/splotch-stroke-texture-jye8jz`) — **user's explicit choice**: the crayon implementation
  is preserved as it stands and is present for Phase 0 measurement and the A/B from day one. **No
  code written yet** — this packet is the only commit on top; the prior session was research + a
  chat-delivered assessment (condensed here).
* **The crayon stack is NOT on main** (`origin/main` @ `66c76a1`, merge of PR 413): the crayon code
  exists only on the unmerged PR 437 → 440 stack this branch now sits on. Once the stack merges,
  rebase this branch onto main; until then a PR for this work should be **stacked** (base
  `claude/splotch-stroke-texture-jye8jz`) so its diff shows only the snapshot work.
* **Crayon preservation is a hard constraint:** the brush's visual implementation (tooth field, pass
  tracker, darken mixing, overlays) is not to be redone. If snapshots win, Phase 3 deletes only the
  replay-serving plumbing — stored per-pass seeds, recorded `crayonFlush` markers, the RDP bypass,
  byte-stable-replay tests — while live rendering behavior stays identical.

## Decisions made (and why)

* **Recommendation delivered: reverse ADR-0033, but gated on measurement, not a leap.** Snapshots
  make undo O(1 blit) and permanently decouple brush complexity from undo — every future brush
  otherwise pays the determinism tax ADR-0065 documents.
* **Pain theory (unverified, see below):** two compounding causes on iPad. (1) Crayon `crayonFlush`
  stamps are canvas readbacks that make undo-replay synchronous — PR 440's own numbers show
  `engine.undo` going ~2.5 ms → ~0.3 s. (2) Crayon commands bypass ADR-0036 simplification, so a 120
  Hz crayon scribble blows past `KEYFRAME_SEGMENT_THRESHOLD` (384, calibrated for *simplified* pen
  ops) and routinely triggers the ADR-0035 keyframe path at pointerup: a ~30 MB square-raster build
  replaying the whole drawing, stamps included.
* **Architecture chosen for the prototype:** promote the existing `baselineCanvas`
  (`web/src/lib/drawing/undoHistory.ts`) into the committed source of truth ("paper canvas") —
  partial reversal of ADR-0034. At `commitStrokeGroup`, push the pre-stroke paper state onto a
  snapshot stack, then fold the stroke into the paper canvas. Undo/resize/remount/export/dev-repaint
  all become blits from it. Mid-stroke resize copies live pixels first (no determinism needed —
  pixel copies always work).
* **Hybrid memory tier (chosen over naive stack):** naive depth-20 raster stack is ~600 MB on an
  iPad Pro 13″ (square side ~2752 px ≈ 30 MB/snapshot) — jetsam territory (`undoHistory.ts:34-38`).
  Instead: `K_LIVE = 2` recent snapshots as live rasters (instant common undo), older entries
  encoded to WebP-lossless/PNG blobs via async `canvas.toBlob()` after commit, decoded (~30–100 ms
  est.) on deep undo. Budget ≈ 100–150 MB peak on the biggest iPad — same order as the pre-ADR-0033
  stack that shipped, at double the depth.
* **Dirty rectangles: optimization later, not the foundation** (ADR-0033's objection stands for
  sweeping scribbles; big win only for taps/dots). Mechanism if pursued: full-canvas `drawImage` to
  scratch at gesture start, crop union-bbox at commit.
* **Known couplings the paper canvas must replace** (the log is not just undo): resize/rotation
  rebuild (ADR-0034), remount persistence across navigation, magic-brush repaint after async fill
  decode, paper-space PNG export (`web/src/lib/drawing/exportDrawing.ts:53-60`), dev crayon-param
  repaint (`engine.ts` `setCrayonParams`).
* **One real design wrinkle:** magic strokes drawn while the sheet is undecoded currently paint
  nothing and get repainted by `replayAll` when ready; a snapshot would bake in the nothing. Fix
  options: transient op list only while the sheet is unready, or block reveal strokes until decode.
* **Crayon upside if snapshots win** (answers "was the ideal crayon blocked?" — yes): soft
  fractional-alpha tooth, per-stroke composited layer, depth-based buildup, nondeterministic grain
  all become legal; seeds/flush-recording/RDP-bypass/byte-stable tests all deletable.
* **What snapshots forfeit** (acknowledged, none on the roadmap): animated stroke replay, print-res
  re-render, compact vector persistence/sync, cheap unbounded undo. Recoverable later by logging ops
  as inert data with no replay-fidelity contract.
* **Fallback if the prototype loses:** stay on replay and land the targeted fixes — the rolling
  one-undo-back snapshot PR 440 names, plus a crayon-aware keyframe threshold.

## Phase 2 gates (agreed with user)

| Signal                                                        | Gate                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `engine.undo` p95, on-device iPad, crayon-heavy history       | < 50 ms (vs ~300 ms today); first-undo-after-scribble esp.     |
| `engine.commit` p95 at pointerup (pen and crayon)             | < ~16 ms — no visible hitch at stroke end                      |
| `engine.draw` avg/max                                         | unchanged within noise (≤ 2 ms budget) — guards the copy cost  |
| `engine.resize` / rotation rebuild                            | ≤ current (should improve: blit vs replay)                     |
| Peak memory (Xcode gauge), 40-command depth-20 crayon session | added undo memory ≲ 150 MB iPad Pro; **no jetsam on min-spec** |
| Measured blob size per crayon-heavy snapshot                  | low single-digit MB (validates the hybrid budget)              |
| Frame drops during rapid strokes while blobs encode           | none                                                           |

Kill criteria: `engine.draw` regresses meaningfully, or min-spec iPad can't hold the memory budget →
fall back to targeted fixes on replay.

## Unverified assumptions

* The keyframe-fires-on-ordinary-crayon-strokes theory — **not measured**; Phase 0's whole job.
* The ~0.3 s undo number is from the software-rendered (SwiftShader) harness, which exaggerates
  blits; real-device numbers unknown in both directions.
* Blob size estimate (low single-digit MB for crayon texture) and decode latency (~30–100 ms).
* `canvas.toBlob()` encodes off the main thread on WebKit (confirmed for Chromium, assumed WebKit).
* The reinstated per-gesture full-canvas copy is cheaper than today's pointerup work (simplify ≤ ~14
  ms + keyframe ~25 ms) — plausible, unmeasured; this is what `engine.draw` / `engine.commit` gates
  exist to check.
* User feedback drove undo depth 10 → 20 (per `undoHistory.ts:27-33`); assumed 20 is a hard
  requirement for the snapshot design too.

## Done & verified

* Research only; no code, no tests run, nothing to verify. Read and confirmed current: ADRs
  0033/0034/0035/0036/0065, `engine.ts`, `undoHistory.ts`, `exportDrawing.ts`, PR 440 body + commit
  history, `scripts/perf/` inventory (`perf:web`, `perf:undo`, `perf:ios`, `perf:units`,
  `perf:sweep`, `undo-scenarios.mjs`).
* Verified `origin/main` @ `66c76a1` has **no** crayon code (the stack is unmerged).

## Risks & next 3 steps

1. **Phase 0:** on this branch (crayon included), run the `profiling` skill's on-device flow
   (`npm run perf:ios`, or `perf:web` as proxy) over a crayon-heavy 120 Hz-style scenario; read
   `engine.commit` / `engine.keyframe` / `engine.simplify` / `engine.undo` and confirm or kill the
   keyframe theory. Measurement only — no pushes to the PR 440 stack branches.
2. **Phase 1:** on this branch, build snapshot mode behind `setUndoMode` (wired to `window.__engine`
   on `/dev/engine` like `setSimplifyParams`): paper-canvas source of truth, hybrid raster+blob
   stack, `wasEmpty` per entry, magic-unready handling. Open as a **new stacked PR** (base
   `claude/splotch-stroke-texture-jye8jz`) so the diff shows only this work.
3. **Phase 2:** extend `scripts/perf/undo-scenarios.mjs` (+ scenario.mjs) with crayon-heavy /
   deep-undo / rapid-stroke / rotation scenarios, run both modes on the iPad, fill in the gates
   table, deliver the verdict. Risk to watch: this branch rides the unmerged PR 437 → 440 stack — if
   the stack gains commits or merges to main, rebase before the verdict so the A/B measures current
   crayon behavior.

## Reread first

* ADR-0033 (command-replay undo, rejected alternatives incl. dirty-rect), ADR-0034 (virtual canvas
  removal — the part being reversed), ADR-0035 (keyframes), ADR-0036 (simplification), ADR-0065
  (crayon; its Consequences section lists everything replay blocked) — `docs/adrs/`
* `web/src/lib/drawing/undoHistory.ts` (baseline/keyframe/fold — the file being replaced)
* `web/src/lib/drawing/engine.ts` (commit/undo/resize paths; `setSimplifyParams` seam precedent)
* `web/src/lib/drawing/exportDrawing.ts:53-60` (export's replay dependency)
* PR [#440](https://github.com/KyleMit/Splotch/pull/440) body — the honest perf table and the
  rolling-snapshot fallback
* `profiling` skill (perf harness + marks), `testing` skill before touching engine specs
