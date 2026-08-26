# Campaign-end recapture (#1322) — remaining phases

> 2026-08-26 · branch `claude/issue-1323-bundled-channel` · PR
> [#1385](https://github.com/KyleMit/Splotch/pull/1385) · finish the #1322 recapture (emulator +
> simulator + fold + matrix regen) after the physical-device halves completed

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
