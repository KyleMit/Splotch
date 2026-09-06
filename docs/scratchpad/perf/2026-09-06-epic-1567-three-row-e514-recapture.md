# Epic 1567: three release-gate rows recaptured at e5142fab

Three of the four physical release-gate rows were freshly captured at product commit
e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3, whose `web/src` tree hash (5418138750d9) is identical to
current `main` (4c177433fd6395885a13490ae25e4fdca750f692) — so these are current-product
measurements. The fourth row, `android-device-native`, was **not** recaptured this session (its
split-transport drawing needs a `server.url` build while its Appium action sweep needs the bundled
`capacitor://localhost` origin — two builds the single-pass campaign cannot serve at once; #1563
already records its native actions as preserved for this reason).

The authoritative four-row matrix was **not** folded. A matrix combining three rows at e5142fab with
`android-device-native` still at 9af487b3 would be a mixed-commit set presented as a snapshot; the
campaign convention is one product commit per matrix. The three rows are preserved as rescoreable
committed evidence instead, and the matrix stays at its coherent 9af487b3 state until the fourth row
is captured at the same commit.

All captures were one session (`start-capture-session` preflight green on both devices), host quiet,
serialized (iPad first, then Android). Every raw capture is retained, failures included.

## Capture provenance

* Isolated worktree at e5142fab, clean web build (`start.B5T1xKl6.js`) and clean `perf:build:cap`
  native bundle, both provenance-stamped `dirty: false`.
* iPad native: Appium/XCUITest, native Capacitor WebView, bundled `capacitor://localhost`. A foreign
  `iproxy` held WDA port 8100, so the campaign ran with a capabilities file pinning
  `appium:wdaLocalPort: 8110` (see the capture-path note below).
* Android web: ADR-0135 split transport (drawing + undo) over the session-owned probe host, direct
  CDP for actions. Every drawing cell passed `trustedTouch` + `cadence`.
* Borrowed, untouched throughout: the RemoteXPC tunnel, the shared Appium server, the foreign iproxy
  on 8100, and every foreign preview/probe on 4173/4175.

## iPad native — drawing clean, two settings-control action reds

Drawing: all 16 cells PASS. Lost-frame share 0–0.09% (budget 1%/1.5%), paint P95 15–16 ms. The
native WKWebView does not reproduce the iPad **web** row's lost-frame reds. Pen undo passes in every
mode. Drift references 0.05% → 0.04% → 0.02% (spread 0.03 pp, one capture session — no
within-session drift).

Action reds (post-action frame P95 gate 20 ms; per-repeat post-action maxima from
`postActionFrameGapsMs`):

| Mode           | Action                      | Per-repeat maxima (ms) | Pooled P95 (ms) | Max breach |
| -------------- | --------------------------- | ---------------------- | --------------- | ---------- |
| portrait-dark  | disable drawing sounds      | 25 / 29 / 29           | 25              | none       |
| landscape-dark | disable auto-save on delete | 34 / 25 / 26           | 25              | none       |

Both are Settings toggle actions, both dark-mode only, both genuine P95 reds (no confirmed 33.5 ms
max breach). All other action groups pass. `gateAllowances` is empty by design: the ADR-0090
Settings allowance is the physical-iPad-**web** Safari calibration
(`isCalibratedPhysicalIpadWeb = !nativeApp`), so the native row is held to base gates.

## Android web — drawing clean incl. undo, two action reds

Drawing: all cells PASS, every mode `trustedTouch` + `cadence` true. Pen undo captured in all four
modes through the split transport — closing the web side of #1630's undo-coverage gap.

Action reds:

| Mode            | Action                                         | Per-repeat maxima (ms) | Gate breached           |
| --------------- | ---------------------------------------------- | ---------------------- | ----------------------- |
| landscape-light | empty after clear: LANDSCAPE→PORTRAIT rotation | first-frame 43.9 (P95) | first-frame (33.5 ms)   |
| landscape-dark  | disable Night Mode in the compact shell        | 33.3 / 33.3 / 33.3     | post-action P95 (20 ms) |

The rotation red is a first-frame breach (43.9 ms) with clean post-action frames (16.8 ms); the
Night Mode red is a compact-shell toggle steady at ~33.3 ms. Neither had appeared as a tracked cell
before this recapture; both are on a release-gate row and warrant their own follow-up.

## iPad web — unchanged reds reconfirmed (already committed)

Re-verified against the already-committed `2026-09-05-epic-1567-ipad-e514-control` corpus (#1686):
10 drawing lost-frame reds (pen/magic/eraser 1.02–1.37%) and the coloring-selection / Settings /
rotation action reds. Not re-promoted here to avoid duplicating that corpus.

## Evidence

Promoted whole (keeper `--keep-all`, device identifiers redacted, source hashes unchanged, guard
clean):

* `perf-profiles/evidence/2026-09-06-epic-1567-ipad-native-e514/` (23 captures)
* `perf-profiles/evidence/2026-09-06-epic-1567-android-device-web-e514/` (23 captures)

## Disposition

Bounded capture work completed: three of four release-gate rows current at e5142fab, with undo on
the Android web row. The release gate is **not** passed — `android-device-native` is uncaptured at
this commit, iPad-web drawing/coloring reds persist (#1569 quarantined), and #1578's WebKit
history-settle gate is unresolved. The matrix is deliberately not folded to a mixed-commit state.
