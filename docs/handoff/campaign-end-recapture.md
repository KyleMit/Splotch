# Handoff — campaign-end recapture

> 2026-08-28 · branch `codex/issue-1215-sim-emulator-recapture` · finish #1215, then #1322, on
> stacked campaign #1483

## Objective & non-goals

Finish issue #1215's four-mode recaptures for `ipad-simulator-web`, `android-emulator-web`,
`ipad-simulator-native`, and `android-emulator-native`; declare and pin the still-null refresh
regimes from trusted captures; promote compact hash-bound evidence; fold complete modes; and
regenerate/rescore the deployment-target matrix. Then process #1322 as the final #1225 campaign
issue.

Non-goals: do not merge stack #1483; do not force fidelity-invalid cells green; do not promote the
discarded Android scratch roots; do not erase the #1252 portrait-action attribution caveat because
one fresh idle control passes; do not recapture already-reviewed physical #1197 evidence.

## State

| Item                | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Branch              | `codex/issue-1215-sim-emulator-recapture` (pushed)                                          |
| PR                  | none — #1215 is incomplete                                                                  |
| Base                | `a55bb7aa80fdd1081774455ca885f55f81a9a91d` (ready PR #1485)                                 |
| Implementation head | `477b36edde8808a00956920bc770b6a8e32b2b33`                                                  |
| Stack               | #1483: #1481 → #1482 → #1484 → #1485; all ready, review-settled, exact-head green, unmerged |
| Controller          | `/private/tmp/splotch-issue-stack-controller-1225/.issue-stack/run.json`                    |

### Commits

| SHA                                        | What                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `477b36edde8808a00956920bc770b6a8e32b2b33` | Harden split/Appium capture for simulator/emulator recapture |

### Files touched

* `tools/perf/ios/capture-xcuitest-screen.mjs`
* `tools/perf/lib/campaign-plan.mjs`
* `tools/perf/split-capture/capture-device-frames.mjs`
* `tools/perf/split-capture/serve-floor-control.mjs`
* `tools/perf/split-capture/verify-android-input.mjs`
* `tools/perf/split-capture/lib/android-input.mjs`
* `tools/perf/split-capture/lib/page-bootstrap.mjs`
* `tools/perf/tests/bootstrap-theme.test.mjs`
* `tools/perf/tests/campaign-plan.test.mjs`
* `tools/perf/tests/split-capture.test.mjs`
* `docs/handoff/campaign-end-recapture.md`

### Trusted partial captures — not promoted

* `perf-profiles/campaign-1215/ipad-simulator-web`: 18/20 cells banked.
  * portrait-light 4/5; eraser exhausted after three cadence-invalid attempts.
  * portrait-dark 4/5; pen-undo exhausted after three cadence-invalid attempts.
  * landscape-light 5/5; landscape-dark 5/5.
  * Accepted drawings observed a 17 ms beat / 60 Hz regime and passed fidelity.
  * All four action idle controls pass. Landscape-light eraser is an attributable advisory red.
* `perf-profiles/campaign-1215/android-emulator-web-v5`: portrait-light 5/5 only.
  * All drawings pass fidelity at 16.7 ms / 60 Hz, about 1.09 moves/frame and 65 moves/s.
  * Eraser initial fill and all nine refills verify cleanly.
  * Magic is an attributable advisory red.
  * The idle control fails at post p95/max 33.3/33.3 ms; retain the #1252 portrait-action caveat.
  * Portrait-dark was interrupted before an artifact or ledger attempt; its status remains zero
    attempts.

Discarded scratch remains under `perf-profiles/campaign-1215/android-emulator-web`, `-v2`, `-v3`,
`-v4`, `-v4-smoke`, and `-v5-smoke`. These roots encode obsolete instruments or isolated smoke
proofs and must not be folded or promoted.

All session-owned capture processes are stopped. Ports 4198, 4199, 4735, and 9235 were verified
free; emulator-5554 was stopped; the iPad Simulator was shut down. Shared physical-device rig
infrastructure and `perf-profiles/evidence/operator/ipad-grant-log.tsv` were untouched.

## Decisions made (and why)

* The Android emulator drawing runner now receives the campaign-owned CDP port. The prior plan sent
  actions to that port but let split drawing fall back to an occupied default.
* Each successful page-front activation guard removes its temporary forward in `finally`. Retaining
  it made the capture's required before-dispatch rebind fail.
* Split and Appium eraser bootstrap paths retry transient transparent fills within the existing
  four-second verification budget. Permanent transparency still exhausts and fails. The fix changed
  Android eraser from repeated readiness failures to a full-repeat trusted capture with all refills.
* Android CSS-to-screen coordinates include the measured Chrome content/cutout origin using the
  `outerWidth/Height - innerWidth/Height` offset, and the floor verifier uses the same transform.
  Before the fix, landscape gestures produced only 3–9 events; the same cell afterward produced
  3,656 trusted moves and full fidelity.
* Every instrument change restarted Android emulator web into a new output root. Only v5 is eligible
  to continue; earlier roots are deliberately mixed/obsolete scratch.
* Simulator cadence failures remain unscoreable. Valid product reds and passing idle controls are
  preserved; no gate was weakened.

## Unverified assumptions

* The content-origin transform is proven on `Pixel_7_Pro_API_33` in both rotations and covered by
  the floor verifier, but physical Android/native were not recaptured after this harness change.
* The Appium eraser retry is regression-tested but has not yet been exercised on iOS/native.
* iPad simulator web repeatedly observed 60 Hz, but its regime is still undeclared/unpinned because
  the wrap happened before target completion and fold work.
* The 18/20 iPad simulator web corpus may be foldable with two preserved-with-reason cells; confirm
  current campaign-source rules before promoting it.
* No reviewed PR exists for #1215. The branch contains only the pushed harness commit and this
  handoff.

## Done & verified

* Focused campaign/split/bootstrap/Appium suite: 4 files / 300 tests passed.
* `npm run check`: passed with zero errors/warnings.
* `npm run lint`: passed with zero errors and two base-existing warnings.
* `npm run format:check`: passed before this handoff edit; rerun after updating the packet.
* `git diff --check`: passed before this handoff edit.
* Empirical Android proofs:
  * portrait-light eraser smoke: exit 0, fidelity pass, initial fill and nine refills verified.
  * landscape-light pen smoke: 3–9 events before transform fix; 3,656 trusted moves, 1.09
    moves/frame, exit 0, fidelity pass afterward.
* Branch and remote matched `477b36edde8808a00956920bc770b6a8e32b2b33`; worktree was clean before
  this handoff edit.

## Risks & next 3 steps

1. Resume with the `resume-handoff`, `start-capture-session`, `profiling`, and
   `run-performance-matrix` skills. Verify this packet against the branch, rerun the focused
   300-test suite, cold-boot the emulator, re-prove explicit unused ports, and continue only
   `android-emulator-web-v5` from portrait-dark. Do not reuse discarded roots.
2. Finish the 57 capture cells: iPad simulator web retry/disposition for 2 missing cells; Android
   emulator web portrait-dark/landscape-light/landscape-dark (15); iPad simulator native (20);
   Android emulator native (20). Preserve idle-control and fidelity reasons verbatim.
3. Declare/pin still-null simulator/native refresh regimes from trusted banked evidence; promote
   compact hash-bound corpora; fold complete modes; regenerate/rescore the matrix; run evidence,
   matrix, ADR, format, lint, type, and relevant full test gates. Then open/review/link the #1215 PR
   atop #1485 before starting final issue #1322.

Risks: web/native builds clobber the same output, so keep web-before-native ordering; iPad Simulator
session drift requires `--reboot-simulator`; Android web portrait action scores remain
unattributable under #1252 when idle control fails; scratch is gitignored and is the only copy until
promotion.

## Reread first

* `docs/PROFILING-CAMPAIGNS.md`
* `docs/PROFILING.md`, `docs/PROFILING-IPAD.md`, and `docs/PROFILING-ANDROID.md`
* `tools/perf/lib/campaign-plan.mjs`
* `tools/perf/split-capture/lib/android-input.mjs`
* `tools/perf/split-capture/lib/page-bootstrap.mjs`
* ADR-0134, ADR-0136, and ADR-0145
* Issues #1215, #1252, #1322, and #1225
* The `resume-handoff`, `start-capture-session`, `profiling`, `run-performance-matrix`,
  `implement-issue-stack`, and `create-stacked-prs` skills

<details>
<summary>Superseded 2026-08-26 packet</summary>

## Objective & non-goals

Finish issue #1322: capture the remaining sim/emulator targets (or record their dispositions),
promote evidence, fold sources, regenerate the matrix, and open the final stack PR closing #1322 and
#1215. Non-goals: any new instrument work; #1323's iOS half (scoped on the issue, needs an operator
finger); product fixes (#1386/#1387 are backlog).

## State

* Stack #1377, 8 PRs open, bottom→top: #1375 → #1376 → #1378 → #1379 → #1380 → #1381 → #1383 → #1385
  (tip = this branch). Standalone gate PRs off main: #1382 (Android WebView pressure/contact
  calibration), #1384 (open-Settings max-frame allowance). **Nothing merged.**
* Captures completed this session, all under `perf-profiles/campaign-1322/` (gitignored scratch —
  promote before it dies):
  * `android-device-web`: 20/20 valid. 14 drawing green; refilled-eraser honest reds portrait-light
    1.39% / landscape-light 1.10% (fidelity+quiet+9 verified refills each). First-ever landscape
    rows. `landscape-light/crayon` 0.52% — the old 1.82% did not reproduce.
  * `android-device-native`: drawing came from `perf-profiles/campaign-1274/` this morning (16/16,
    worst 0.38%, banked as `evidence/2026-08-26-android-native-split`); cells read
    `uncalibrated-runtime` until PR #1382 merges, then re-derive to accepted with no recapture.
    Actions: all four modes REFUSED by the compact-shell rotation guard — disposition
    preserved-with-reason, issue #1387.
  * `ipad-device-web`: 20/20 valid. Crayon 1.10–1.47% (inside its 1.5% ADR-0137 exception —
    capture-time flat-gate FAILs are the documented read). **New signal: refilled eraser ~5.7–6.2%
    on every mode** — the honest quantity the superseded no-op eraser cells hid; needs its own read
    at fold time (real WebKit eraser cost vs refill bleed into the in-contact charge — check
    `eraserRefills` timing against phase windows before believing either). #1197's straddle
    adjudicated: `with ink: PORTRAIT to LANDSCAPE rotation` post-p95 17 PASS; one new one-sample
    borderline (`clear restored drawing after blank rotation` max 37).
* Instrument changes made mid-pass: `artifactMatchesRuntime` native fix + android-device-native
  split transport (PR #1380); action-sweep palette-routing/fly-in fix e8418fd91. The PR #1385 review
  caught that the first actions fold would have mixed two instruments with no recoverable per-cell
  boundary — so **all four ADW actions cells were deleted and recaptured under the single current
  instrument** (the review-feedback branch, 2026-08-26 ~15:45 local; the campaign's
  `instrument.json` records the fingerprint). The four artifacts on disk are uniform; one honest
  borderline remains (`landscape-light` `undo clear after blank rotation`, single frame 34.2 ms).
* The two failed-then-fixed ADW actions cells and the screenshot-perturbed portrait-dark actions
  cell were recaptured; ledger rows for the dead attempts were removed per the
  all-failed-no-artifact rule (portrait-dark's artifact was deleted deliberately first — operator
  screenshot during the capture window, noted in chat).

## Decisions made and why

* Gate-semantics changes shipped as standalone PRs per the process rule adopted 2026-08-26
  (docs/PROFILING-CAMPAIGNS.md) — #1382, #1384. The android-native actions blocker was NOT worked
  around: the compact-shell guard's refusal is deliberate (campaign-state.mjs:216 comment is the
  spec) → #1387.
* Desktop rows: no recapture — **no product code changed this session** (verify with
  `git diff origin/main...HEAD -- web/src`; instrument/docs only), so the 2026-08-23 desktop corpus
  stays current. Record this disposition in the final PR.
* #1199: does not reproduce on a fresh emulator (posted on the issue with numbers); ride-or-close is
  the operator's call.

## Unverified assumptions

* The iPad eraser ~6% is assumed to be a genuine new reading, not refill bleed — NOT yet verified
  against the refill timestamps. Do this before publishing the fold.
* `android-emulator-web` is assumed capturable end-to-end via the split transport + CDP actions
  (regime declared, one banked bootstrap capture) but no full campaign has run on it.
* iPad-simulator targets are assumed to still fail cadence/density structurally; expected outcome is
  a preserved-with-reason disposition for #1215's sim half, but nobody has tried post-ADR-0145.
* The `hostQuiet` producer exists only on split/hand/desktop transports; Appium artifacts (all iPad
  cells) legitimately read `unrecorded` — the fold must not treat that as failure (composeRunTrust
  already maps absence to unrecorded).

## Done & verified

* All ledgers above read as stated (`perf-profiles/campaign-1322/*/ledger.tsv`); every valid cell's
  artifact parses and its fidelity/quiet fields were spot-read as reported.
* Action-sweep fix verified on hardware: `--actions=color-picker` landscape 4/4 PASS (r7), then all
  four ADW actions cells banked valid.
* `tools/perf` suite green at each commit on the stack; knip clean; preflight fully green at session
  start and before the closing pass (grant log now accrues from preflights — rows in
  `perf-profiles/evidence/operator/ipad-grant-log.tsv`).

## Risks & next 3 steps

1. **Emulator**: boot Pixel_7_Pro_API_33
   (`~/Library/Android/sdk/emulator/emulator -avd Pixel_7_Pro_API_33`),
   `adb -s emulator-5554 reverse tcp:<preview> tcp:<preview>`, run
   `perf:campaign --target=android-emulator-web` (split drawing needs `--probe-host` LAN URL;
   actions CDP needs `--cdp-port` + `--url` through the reverse). Then `android-emulator-native` via
   Appium with an Android caps file (template: this session's scratchpad wrote one — recreate:
   platformName Android, UiAutomator2, udid emulator-5554, appPackage art.splotch.app, appActivity
   .MainActivity, noReset) — native actions will hit the same #1387 guard on the handset-profile
   emulator; expect drawing only.
2. **iPad simulators** (#1215 sim half): boot Simulator, attempt one drawing cell per target; if
   density/cadence fails structurally, record preserved-with-reason and move on — the issue's
   done-when allows it.
3. **Fold + regen**: promote per-target corpora
   (`perf:evidence:keep --corpus=perf-profiles/campaign-1322 --campaign=2026-08-26-campaign-1322-<target> --filter=<target>`),
   investigate the iPad eraser 6% first, then `perf:campaign:sources` + `gen:performance-matrix`
   (expect `check:matrix-staleness` + dprint issues per docs; read the data.json diff for
   preserved-field loss per docs/PROFILING-CAMPAIGNS.md), final stack PR closing #1322 + #1215.

Risks: preview/probe pair (:4183/:4185) die with this session — re-serve and re-verify the manifest
before any capture; `web/build` holds the web build now but any `cap:sync` clobbers it; the campaign
scratch (`perf-profiles/campaign-1322/`, `campaign-1274/`) is gitignored and is the only copy of the
raw evidence until promotion.

## Reread first

* [docs/PROFILING-CAMPAIGNS.md](../PROFILING-CAMPAIGNS.md) — whole file; especially the recapture,
  evidence, and gate-semantics sections
* [tools/perf/lib/campaign-state.mjs:206](../../tools/perf/lib/campaign-state.mjs) — the
  compact-shell rotation guard (#1387's spec)
* Issue #1322 (scope table + hygiene), #1215 (sim disposition options), #1225's 2026-08-26 interim
  comment (session context)
* The start-capture-session skill before touching either physical device

</details>
