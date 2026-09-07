# Epic 1567: android-device-native at e5142fab and the four-row fold

The fourth physical release-gate row, `android-device-native`, was captured at product commit
e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 — the same commit the other three rows already hold
(`docs/scratchpad/perf/2026-09-06-epic-1567-three-row-e514-recapture.md`, PR #1689; iPad web via
#1686). All four rows then fold into the authoritative matrix as one single-commit snapshot,
rescored under the shipped allowance policy (ADR-0160, ADR-0162).

**Currency caveat.** When the three sibling rows were captured, e5142fab's `web/src` tree was
identical to `main`. It no longer is: `main` at 15631cd055e5d43cee56e57d66362a05a6009ef7 carries a
different `web/src` tree (0afd48f03ec6, versus e5142fab's 5418138750d9), after PR #1702's theme-flip
treatment and the ADR-0161 history-settle change. The fold is therefore a coherent e5142fab snapshot
of all four rows, not a measurement of current `main`. That is the campaign convention's requirement
— one product commit per matrix — and the staleness check reports the drift by design (ADR-0159);
`--strict` here asserts every row is current *against the fold's own commit*, which they are.

## Why two builds

The row's drawing and undo cells ride the ADR-0135 split transport into the installed Capacitor
WebView, which reaches the instrumented page through a build-time `server.url` pointed at the probe
host. Its action cells ride Appium against the app-owned WebView and must measure the packaged
`https://localhost` origin. A single installed build cannot serve both, so the row is two sequential
builds of the same clean source commit, one after the other, with the same rig, the same instrument,
and one campaign output root:

1. **Probe-host variant** (drawing + undo + references). Built in the isolated e5142fab worktree:
   `npm run perf:build:cap` then `node tools/perf/write-build-provenance.mjs` on the clean tree
   (stamp `e5142fab…`, `dirty: false`; native entry `start.z2LDyNyT.js`). The tracked
   `capacitor.config.json` was then given a temporary `server.url` (this host's LAN address, probe
   port 4175) and `server.cleartext: true`, `npx cap sync android` regenerated the ignored native
   config, Gradle built the debug APK, it was installed over the existing app (app data retained),
   and the tracked config was restored before any capture — `git status` clean. Debug APK SHA-256:
   `74584be4e88e7a911eae26c581c786c884f82c6084cdd5dcb581ec224795783a` (local only). The native
   static export was served by an explicit
   `CAPACITOR=true PUBLIC_ENABLE_DEV_HARNESS=true vite preview` on 4173 from that worktree and
   proxied by the probe host on 4175; the entry chunk was fetched through the probe host before the
   queue started. Capture delivery is `remote-probe-host`, and every drawing artifact records
   `pageIdentity: unprovable` (the fixed `server.url` carries no per-cell nonce) — the same explicit
   limitation PR #1683 retained.
2. **Bundled variant** (action sweeps). The restored config re-synced (`npx cap sync android`, no
   web rebuild — the same stamped `web/build`), Gradle rebuilt, reinstalled over the first variant.
   Debug APK SHA-256: `41a2ddc1c136f54428938537b93c9ea8c153f5ba645da9941de9fd20d8590d61` (local
   only). Before the sweep the app was launched and read over its devtools socket: `location.href`
   is `https://localhost/`, the user agent is the WebView, and the `PERF_MARKS` brush seam is
   present.

The campaign was driven from the e5142fab worktree's own `tools/perf`, whose files hash identically
to the instrument fingerprint recorded by the three sibling rows' campaign roots; `main`'s
`tools/perf` differs from it only in identifier-scrub comments, a legacy-UDID resolver case, and the
iPad Safari allowance ledger, none of which touch an Android native capture. Scorers and ledgers
re-derive at fold time, so the fold applies the shipped policy regardless.

## Rig

`start-capture-session` preflight: Android input 1.02 moves/frame (121.9 contact moves/s), page
followed a real rotation; ADR-0143 refresh-rate override keys read unset before the session. The
phone's app-persisted rotation preference read `lock-rotation: false` (force-landscape `true`, inert
while unlocked) before the split captures, read over the WebView's devtools socket rather than
mutated. Chrome was force-stopped before every native launch. A session-owned hold-awake watcher
re-asserted stay-awake every 60 s. Borrowed and untouched: the root-owned RemoteXPC tunnel. The
iPad's automation grant had expired at session start (WebDriverAgent timed out "enabling automation
mode"); the iPad is not part of this row.

Drawing pass:
`perf:campaign --target=android-device-native --items=pen-undo,crayon,magic,eraser
--max-attempts=2`
(19 cells: 16 drawing plus the start/middle/end crayon references). Action pass: `--items=actions`
(4 cells) after the bundled reinstall.

## Results

### Drawing and undo — all 16 cells and 3 references PASS, first attempt

Every cell landed on attempt 1 with `trustedTouch` + `cadence` passing, 118.2–118.5 contact moves/s
against the 8.3 ms (120 Hz) beat, `nativePackage: art.splotch.app`, `productCommit` e5142fab, served
entry `start.z2LDyNyT.js`. Rescored through the shipped scorer from this branch
(`perf:rescore --target=android-device-native`): 19 rescored, 0 fidelity failures.

| Mode            | Pen p95 / max / lost | Crayon p95 / max / lost | Magic p95 / max / lost | Eraser p95 / max / lost |
| --------------- | -------------------- | ----------------------- | ---------------------- | ----------------------- |
| portrait-light  | 8.1 / 8.3 / 0%       | 8.1 / 10.3 / 0.01%      | 8 / 8.3 / 0%           | 8 / 8.4 / 0%            |
| portrait-dark   | 8 / 8.7 / 0%         | 7.9 / 14.2 / 0.01%      | 8 / 9.4 / 0.03%        | 7.9 / 8.8 / 0%          |
| landscape-light | 8 / 15.4 / 0.01%     | 7.9 / 22.1 / 0.03%      | 8 / 24.1 / 0.03%       | 7.9 / 14.4 / 0.01%      |
| landscape-dark  | 7.9 / 12.8 / 0.01%   | 8 / 14.9 / 0.04%        | 7.9 / 14.3 / 0.03%     | 7.9 / 8.3 / 0%          |

Paint in ms; lost-frame share against the 1% budget. The landscape paint maxima (22–24 ms) sit well
inside the 50 ms gate. The 90.8 ms crayon paint-max red that PR #1683's start reference recorded at
8d0e1b4c did not recur in any of this session's 19 captures.

Pen undo, ten canonical actions per mode, every one changing the canvas digest (the split
transport's undo contract, PR #1638/#1683):

| Mode            | Engine P95 / max (ms) | Next-frame P95 / max (ms) |
| --------------- | --------------------- | ------------------------- |
| portrait-light  | 1.5 / 1.5             | 6.2 / 6.2                 |
| portrait-dark   | 1.3 / 1.3             | 6.3 / 6.3                 |
| landscape-light | 1.7 / 1.7             | 5.9 / 5.9                 |
| landscape-dark  | 1.4 / 1.4             | 5.8 / 5.8                 |

This completes issue #1630's eight physical Android undo sections at the final product commit: the
four web sections landed in PR #1689, these are the four native ones.

Drift references (crayon, portrait-light): start 0% → middle 0% → end 0.03% lost-frame share, one
capture session (`captureSessions.scope: single`), spread 0.03 pp against the 0.5 pp warning
boundary — no within-session drift.

### Actions — all four sweeps PASS on base gates, no unconfirmed max

Every sweep records `transport: native-capacitor-webview`, the packaged `https://localhost/` origin,
four repeats (one warmup, three scored), and an empty `gateAllowances` — this row has no ledger, so
every verdict is the base 20 ms P95 / 33.5 ms first-frame and max gate. Portrait modes measured the
sectioned Settings shell; landscape modes the compact shell (issue 1387's rotation picker contract,
now honoured by the runner).

| Mode            | Shell     | Action groups | Failed | Unconfirmed max |
| --------------- | --------- | ------------: | -----: | --------------: |
| portrait-light  | sectioned |            50 |      0 |               0 |
| portrait-dark   | sectioned |            50 |      0 |               0 |
| landscape-light | compact   |            36 |      0 |               0 |
| landscape-dark  | compact   |            36 |      0 |               0 |

The compact-shell Night Mode toggles — the cell that is red on the sibling `android-device-web` row
and holds ADR-0162's allowance there — read a post-action P95 of 16.7 ms in both directions and both
landscape modes on this row (one 25.1 ms max on `disable Night Mode` in landscape-dark, single
repeat, unconfirmed). Per issue 1704 a green on this probe is not proof the frame fit, so this is
recorded as the row's reading, not as evidence against the web row's attribution. Rotation first
frames read 3.5–6.9 ms P95 in landscape-light.

The portrait-dark sweep spent one attempt on a deliberate interruption: the campaign was paused at
the portrait-light/portrait-dark boundary so the iPad's expired automation grant could be re-armed
with the owner watching (a WebDriverAgent build is host load a sweep must not share). The ledger
records that attempt as `missing-or-invalid-json-exit-130` with no artifact; the resume ran with
`--max-attempts=3` so the cell kept two real tries, and landed on its first.

## The fold

All four rows folded through `perf:campaign:sources` from the one output root
(`perf-profiles/epic-1567-final-e5142fab/`), `--product-commit` e5142fab, 4/4 modes ready on every
row. The manifest header (`productCommit`, `recordedOn`, and the snapshot limitations) was updated
by hand as the previous fold did, since the fold tool rewrites modes only. Regenerated with
`gen:performance-matrix`; the chained staleness check then reads:

| Base                             | Verdict, all four rows                                                    |
| -------------------------------- | ------------------------------------------------------------------------- |
| `HEAD` (= current main)          | STALE, 3 engine commits since e5142fab                                    |
| e5142fab (the fold's own commit) | current, "4 captured cell group(s), all from the current product surface" |

So `--strict` against main cannot pass for any e5142fab fold, by construction — the same fact the
currency caveat above records — while the fold is provably single-commit. The 9af487b3 raw corpus
this manifest previously named was already gone from every checkout (ADR-0162's consequences
section), so this is also the first regeneration since ADR-0160 and ADR-0162 shipped: their
allowance provenance lands on the rendered iPad web and Android web cells in this same diff.

Every red in the regenerated `data.json`, read from `aggregate.allPhasesPassed` and each action
result's `passed`:

| Row                     | Red cells                                                                                           | Tracked by                   |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| `ipad-device-web`       | 10 drawing lost-frame cells: pen ×4, Magic ×3, eraser ×3 (1.02–1.37% vs 1%)                         | issue 1693 (budget decision) |
| `ipad-device-native`    | `disable drawing sounds` (portrait-dark), `disable auto-save on delete` (landscape-dark), P95 25 ms | issue 1694                   |
| `android-device-web`    | `empty after clear: LANDSCAPE to PORTRAIT rotation` (landscape-light), first-frame P95 43.9 ms      | issue 1695                   |
| `android-device-native` | none                                                                                                | —                            |

Thirteen reds, thirteen tracked; no new untracked red. `disable Night Mode in the compact shell` on
`android-device-web / landscape-dark` passes under ADR-0162; the anticipated `enable Night Mode`
flap did not appear (landscape-light reads 34/35 with only the rotation red). The strict check on
`data.json`'s diff shows no field dropped from a preserved run — the removed lines are the old
9af487b3 sources and commits the fold replaced.

## Evidence

Promoted whole with `perf:evidence:keep --keep-all --force --filter=android-device-native` into
`perf-profiles/evidence/2026-09-07-epic-1567-android-device-native-e514/` (23 captures: 16 drawing,
3 references, 4 action sweeps; the pen artifacts carry the undo sections). Device identifiers
redacted by the keeper; `check:device-identifiers` clean. A first promotion without the filter
copied the three sibling rows too and was replaced with `--force` — those rows keep their own
corpora (`2026-09-05-epic-1567-ipad-e514-control`, `2026-09-06-epic-1567-ipad-native-e514`,
`2026-09-06-epic-1567-android-device-web-e514`). Raw campaign roots, ledgers, both APKs, and every
capture log stay local.

## Disposition

The fourth release-gate row is captured at the same commit as the other three, folds into a
single-commit matrix, and carries no red. Issues 1563 and 1630 are met on their own terms: four rows
at one final product commit, honest dispositions on every cell, all eight physical Android undo
sections fresh, strict regeneration current against the fold commit. What this does **not** claim:
currency against main (three engine commits behind, stated above), a passed release gate (thirteen
tracked reds remain on the other three rows, each its own decision), or anything about issue 1704's
probe semantics, which are unchanged.
