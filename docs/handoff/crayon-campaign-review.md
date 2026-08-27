# Handoff — crayon campaign review + rig takeover

> 2026-08-27 · branch `perf/crayon-native-deferred-stamp` · PR
> [#1414](https://github.com/KyleMit/Splotch/pull/1414) · Take the physical capture rig, review two
> crayon performance campaigns adversarially, and take PR 1414 to merge-or-block.

## Objective & non-goals

Two campaigns eliminated crayon's lost-frame cost on both iPad runtimes. The web half is **merged**
(PR 1389); the native half is **open and green** (PR 1414) and wants an independent reviewer with
the rig in hand — every headline number came from one instrument, driven by the same session that
wrote the code.

**Do:** re-measure the claims you doubt (the rig is up and both devices are attached), review PR
1414 with `leave-pr-review`, decide merge-or-block, and close the three loose ends listed under
*Risks & next steps*.

**Non-goals:** starting a third optimization campaign; touching Android (physical-Android crayon is
already at pen parity — 0.41–0.55% web, 0.00–0.01% native, per the published matrix); re-running the
full trial ladder (14 branches are pushed if you want to reproduce one).

## Rig state — read before touching anything

| Resource         | State                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPad             | `00008103-0006202E3CF1001E` (hardware UDID, not the devicectl UUID). Attached, last proven by captures at ~00:20                                                                                                                             |
| Android          | `R5CRC3AVCXM` (SM-G990U1) attached, plus `emulator-5554`. Still holds `svc power stayon` + a 30-min screen timeout written by the 2026-08-26 preflight — **nothing has reverted those**                                                      |
| RemoteXPC tunnel | Running, **owned by another worktree's session** (`…/splotch-pr-1168-review/…`). Reuse it; never kill it (concurrent-worktree rule)                                                                                                          |
| Appium           | Running on 4723                                                                                                                                                                                                                              |
| Preview 4173     | **STALE — restart before any capture.** Its entry chunk 404s: the post-capture E2E runs rebuilt `web/build` without `PERF_MARKS` under the long-lived vite process. This happened *after* the final captures, so it does not invalidate them |

Re-arm with `npm run perf:preflight -- --wake-android --verify-android-input --verify-ios-launch`,
then `npm run perf:serve` (rebuilds instrumented). **Check `report.meta.counts.measures > 0` on
every artifact before scoring** — a zero there means the served bundle was uninstrumented, the trap
now documented in `docs/PROFILING-CAMPAIGNS.md`.

## State

Branch `perf/crayon-native-deferred-stamp`, based on `e6429a7a6` (main, = merged PR 1389). Clean
tree, pushed, CI green (13 pass / 3 skip).

| sha       | what                                                    |
| --------- | ------------------------------------------------------- |
| 635b2eb76 | the native deferred-stamp pipeline                      |
| e0a6ff0cd | native campaign log                                     |
| 63a676708 | ADR-0147 amendment (deferred replaces planes on native) |
| 9fe0ab7e7 | extract `tileBackingMigration.ts` (line budget)         |

Files: `crayonPassBuffer.ts` (+162, the pipeline), `engine.ts`, `strokeOps.ts` (`final` flag on
`crayonFlush`), `tiledRenderer.ts`, `tiledUndoPatches.ts` (`peek`), `tileBackingMigration.ts` (new),
`crayonPassBuffer.test.ts` (+87), ADR-0147, campaign log.

Experiment branches on origin: 5 `exp/crayon-native-a*` (ablation rungs), 7 `exp/crayon-native-t*`
(trials), plus the 24 already-filed-and-closed web log PRs #1390–#1413.

## Decisions made (and why)

* **Deposition is per-runtime** (ADR-0147, extending ADR-0146's granularity precedent): web restamps
  per op; native paints wax directly and defers its glaze. Each runtime's optimum measured as the
  other's pessimum, twice over — this is not hedging, it is two measured curves.
* **Native: the glaze leaves the contact window.** `crayonFlush` ops carry `final`; checkpoints and
  splits became pure seed boundaries. Only the closing flush stamps, two frames post-lift, followed
  by a 1-px `getImageData` that forces WebKit's canvas command buffer to flush *between* strokes.
* **Reverted / rejected, do not revisit:** stroke-cadence-only deferral (3.0%), post-lift stamp
  without the forced flush (3.5% — worse than doing nothing), folding the glaze into the shadow
  offscreen (2.8%, web), frame-batched restamps (2.6%, web), single premixed plane (1.45%, web).
* **One capture round was discarded on the record** — a mangled build measured a blank renderer at
  0.00%; unit tests caught it, the capture did not. See the native log's T1 entry.

## Unverified assumptions

These are the review's best targets. Each is believed, none is proven:

1. **The visual trade has never been eyeballed by a human on device.** On native, over *existing
   ink* the live preview is unmixed opaque wax and the exact glaze appears ~2 frames after lift;
   mid-stroke checkpoints no longer mix incrementally. Blank paper is byte-exact throughout (that
   part is algebra, not assertion). This is the issue-1372-style check PR 1414 asks for and the
   single best reason to block it.
2. **The forced-flush mechanism is inferred, not traced.** The 1.7% → 0.37% jump is real and
   reproducible; "WebKit's command buffer only flushes on a read" is the story fitted to it. No
   `xctrace` capture confirms it. If the mechanism is wrong the fix may be fragile across iOS
   versions.
3. **Native fidelity is uncalibrated** (ADR-0139) — every native number is comparative A/B on one
   instrument, never a gate score. The web numbers *are* calibrated.
4. **Trials ran 2–3 samples**, some 2. The web campaign's own lesson is that 3 samples of a
   single-frame statistic look consistent by chance.
5. **Undo/export/repaint interactions with the deferred stamp are unit-tested, not device-tested.**
   The settle-order paths (a pass pending its stamp when undo, export, or a repaint arrives) have
   contracts in `crayonPassBuffer.test.ts` but no on-device exercise.
6. **The 4×4 tile grid was never re-litigated** under either new pipeline; ADR-0085 sized it for the
   old one.

## Done & verified

* PR 1414 CI green: 13 checks pass. Locally: `npm run check` 0 errors, `eslint .` 0 errors, `knip`
  clean, **2102/2102 unit tests**, drawing E2E (crayon, undo, rotation, work-counters).
* Native final confirmation, all fidelity-passing, instrumented (`measures` ≈ 3800): crayon portrait
  **0.32 / 0.32 / 0.35%**, landscape **0.22 / 0.33%**, pen control 0.04%, web sanity 0.97% (inside
  the restamp band — web untouched by this PR).
* Web (merged) final: crayon 0.78 / 0.79 / 0.90% portrait, 0.77 / 0.97% landscape, pen 0.75%.
* Both campaigns' full ladders are in the two scratchpad logs, including every rejected variant.

## Risks & next 3 steps

1. **Eyeball PR 1414 on the device, then merge or block it** — assumption 1 above.
   `npm run
   perf:operator` is the guided path for hand-driven checks inside the installed
   WebView.
2. **`perf/crayon-campaign-notes-2026-08-26` is pushed but has no PR and is unmerged.** It carries
   the web campaign log, the `docs/PROFILING-CAMPAIGNS.md` E2E-rebuild trap, and the only promoted
   web evidence (`perf-profiles/evidence/crayon-elimination-2026-08-26/`). None of that is on
   `main`. Open a PR for it.
3. **Native evidence is not promoted.** Raw captures sit in gitignored
   `perf-profiles/crayon-native-2026-08-26/` (14 cells) and die with the scratch. Run
   `npm run perf:evidence:keep -- --corpus=perf-profiles/crayon-native-2026-08-26
   --campaign=crayon-native-2026-08-26`
   — note ADR-0138's selection prefers a *scoreable* representative, and these are uncalibrated, so
   check what it refuses.

Then: file the 12 `exp/crayon-native-*` branches as closed log PRs (same pattern as #1390–#1413),
and recapture the performance matrix to retire ADR-0137's `ipad-device-web:crayon` 1.5% exception on
both targets.

## Reread first

* `docs/scratchpad/perf/crayon-native-campaign-2026-08-26.md` — native ablation + 7-trial ladder,
  and the four earned WKWebView rules (only reads flush the command buffer; any tile-involving blit
  at pass cadence costs ~1.4 points; pattern strokes and detached-canvas work are free; the undo
  snapshot is a free under source).
* `docs/scratchpad/perf/crayon-elimination-campaign-2026-08-26.md` (on the notes branch) — the web
  campaign, 16 ideas, and its own three rules.
* `docs/adrs/0147-crayon-restamp-renderer-no-preview-planes.md` — the decision and both amendments;
  `0146` (granularity), `0137` (the gate exception this work retires), `0085` (the plane
  architecture being replaced).
* `web/src/lib/drawing/crayonPassBuffer.ts` — module header documents all three pipelines and why
  each exists; `closeCrayonPassOp` + `settlePendingStamp` are the native path's core.
* `docs/PROFILING-CAMPAIGNS.md` — the trap catalogue; `docs/PROFILING-IPAD.md` — the transport.
* Skills: `leave-pr-review` (review + post), `profiling`, `start-capture-session`,
  `run-performance-matrix`.
