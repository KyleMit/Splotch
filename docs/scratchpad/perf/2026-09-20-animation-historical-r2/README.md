# PR 1867 animation: canonical historical before/after captures

This is evidence for issue 1870, not its full acceptance. Seventeen of twenty planned captures
completed on one frozen harness. Android native has only `before-1`; `after-1`, `after-2`, and
`before-2` are explicit holes because the 90-minute active operator-time bound, excluding unattended
capture and CI waits, was reached. The native result cannot certify a before/after comparison. No
current-product matrix cell or product arm was changed.

Run `node docs/scratchpad/perf/2026-09-20-animation-historical-r2/check.mjs` to verify the manifest,
all completed capture identities and controls, and every stored summary against the scorer's
packaged inputs. Run `compare.mjs` for every red action, or `compare.mjs --all` for every action.
`CAPTURE-ORDER.tsv` gives the raw artifact hashes, capture completion times, and verdicts.
`COVERAGE.json` names all twenty positions and the exact holes. Each reduction retains every input
read by `summarizeActions`; its `sourceSha256` refers to the private original. The raw JSON, full
console logs, install proofs, restricted-front request logs, and failed attempts remain under the
rig's `evidence/1870/animation-historical-r2/` directory because they contain device identifiers and
local paths.

## Frozen identities and commands

Before is a9b633c4392de7ca943d3f927ff86686956cdb83, the first parent of the PR 1867 merge. After is
751093de306f08f771f52f85996f55838b7b0d15, that merge. The unmodified capture harness/scorer is
98869d91adc0427d8dba39d3ce96fc319558b789, the PR 2114 merge on `main`. `BUILD-IDENTITY.json` records
the two clean web-build provenance stamps, served entries/digests, iPad signed-app entries and tree
hashes, and Android APK hashes. The historical sources and signed artifacts were not rebuilt or
changed in this unit; the focused compatibility proof in PR 2114 had already exercised these same
artifacts. Before/after assets were never mixed with a current-product matrix capture.

Each target used `--repeats=4 --report-only`: repeat 1 is warmup and repeats 2–4 are scored. The web
command list was
`idle,palette,color-picker,brushes,stroke-width,settings,coloring,screenshot,ai-waiting,undo,unavailable,clear`
on macOS WebKit, iPad Safari, and Android Chrome. The native list was
`palette,clear,brushes,stroke-width,undo,settings,color-picker,coloring,ai-waiting,unavailable,screenshot`
on iPad and Android. Every completed run includes separate `first open of coloring books` and
`reopen coloring books` rows; the retired ambiguous `open coloring books` action is absent. The
historical pre-rendered coloring tiles were retained as product behavior. All four complete targets
ran before/after/after/before; Android native stopped after before-1.

| Target                  | Arm route                                                        | Matched controls                                                                          | Coverage |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| macOS WebKit            | Frozen HTTP previews on ports 54844/54845                        | Light, desktop Playwright/WebKit, same ordered actions and gates                          | 4/4      |
| Physical iPad Safari    | Restricted HTTPS fronts on ports 54851/54852 to those previews   | iPadOS 26.5, landscape/light, same native-touch input and existing Safari gate allowances | 4/4      |
| Physical iPad native    | Signed archived App.app installed serially                       | iPadOS 26.5, landscape/light, same native-touch input and gates                           | 4/4      |
| Physical Android Chrome | `adb reverse` localhost ports 54844/54845, switched between arms | Android 16, portrait/light, trusted CDP touch, requested and observed 60 Hz               | 4/4      |
| Physical Android native | Signed archived APK installed serially                           | Android 16, portrait/light, native touch                                                  | 1/4      |

The Safari fronts returned 200 for `/` and the matching historical coloring manifest, and 403 for
`/dev/engine` and `/api/verify-key`. Their root HTML served the exact before/after entries; the
capture artifacts independently recorded the matching digests. They did not broaden the allowlist or
API. Chrome's localhost origin let each AI finish sample prove a secure context and exactly one
stubbed generate request. The four unit-1 listeners stayed untouched; this unit stopped only its two
restricted fronts and removed only its own Android reverse mappings.

For iPad native, `devicectl` recorded the installed bundle ID, version, and private bundle path. A
separate direct-WDA WebView fetch of the installed entry matched the SHA-256 of each archived signed
app entry, including the reinstalled before arm and final restoration of the original after app. The
first sandboxed `codesign --verify --deep --strict` attempt could not access the local developer
trust chain; the same verification passed for both archived bundles with host access. Both attempts
are retained privately. For Android native, the phone's installed `base.apk` was pulled and its
SHA-256 matched the before archive before capture. The original control APK was pulled before the
install and restored afterward; the installed post-restore SHA-256 matched its original value
exactly. Play Protect UI during install was not inspected, and this unit performed no UI approval.

## Measured results

The scorer gates every action independently. A red is preserved even when another run of that action
is green. First/reopen coloring-picker rows pass in all seventeen captures.

| Target         | Before-1                                                 | After-1                                       | After-2                                                                      | Before-2                         |
| -------------- | -------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| macOS WebKit   | All 26 pass                                              | `clear drawing` post P95 21 ms red            | `clear drawing` post P95 21 ms and `select coloring page` post P95 21 ms red | All 26 pass                      |
| iPad Safari    | `select Magic brush` max 79 ms red, three breach samples | All 26 pass                                   | All 26 pass                                                                  | All 26 pass                      |
| iPad native    | `select Magic brush` max 82 ms red, two breach samples   | Same action max 83 ms red, two breach samples | All 25 pass                                                                  | All 25 pass                      |
| Android Chrome | All 26 pass                                              | All 26 pass                                   | `clear drawing on a coloring page` post P95 33.3 ms red                      | Same action post P95 33.3 ms red |
| Android native | All 25 pass                                              | Not captured                                  | Not captured                                                                 | Not captured                     |

Passing iPad runs still contain single-sample breaches: Safari after-1, after-2, and before-2 had
`select Magic brush` maxima of 63, 63, and 66 ms; native after-2 and before-2 had 66 and 82 ms.
Native before-1 and after-1 also had `select coloring page` maxima of 87 and 86 ms. Those actions
pass only because the gate requires at least two breaching samples. The Magic action has a breach in
every iPad capture, across Safari and native and both arms.

The consistent macOS `clear drawing` post-P95 difference is measured in these two after captures;
this package contains no trace that assigns its cause. The iPad Magic hitch is present before PR
1867 and occurs in both native arms. Android Chrome's coloring-page clear red appears in the latter
half of the sequence across both arms. These observations do not support assigning those shared or
order-associated reds to PR 1867. The one Android native pass is a compatibility and baseline
observation, not a comparison. Nothing here answers the separate iPadOS 26.6 runtime question: the
device ran 26.5.

The full private command logs and arm-install records are the operator evidence for process order
and installed apps. The packaged reductions, raw hashes, served web bindings, scorer recomputation,
and device WebView entry hashes support the machine-checkable statements above. Only the installed
native app association rests partly on operator-controlled install order, because a native capture
artifact has no embedded source commit. No rerun was performed to replace a red result.
