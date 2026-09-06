# Epic 1567: resumed physical campaign

Campaign incomplete. No product treatment has been accepted. The authoritative matrix still measures
9af487b3745c0c1237644c92d5a243b1825911d7 and all four physical rows are stale against the resumed
main control, 196a97757782a93ccb7a53cbb9aae3d313db2e56. Its 18 action reds remain historical
measurements; focused results below do not replace or subtract from them.

## Starting state

Fetched origin and verified all eleven PRs in the former campaign stack merged. The subsequent main
change, PR 1663, changes shipping skills rather than product code. Main Tests run 33966932355 and
Hosted Deploy Smoke run 33967040891 passed. The sub-issues API returned 21 direct children, 10 open;
every child's body and comments were read before selecting issue 1569. No issue was closed.

The required rival policy and host authentication checks pass after the owner refreshed the
installed wrapper. The first new branch starts at the main control above. No PR has been opened or
merged.

Both physical devices passed fresh input/rotation preflight. The existing RemoteXPC tunnel and WDA
build process are borrowed and untouched. Session-owned Appium uses an explicit external WDA URL,
whose driver strategy does not manage WDA's lifecycle. Control and experimental previews are owned
by this session. Exact endpoints, process IDs, and device identifiers stay in local operator state.

## Issue 1569: bounded negative results

All selection figures are physical iPad Safari, one retained warmup plus three scored repeats.
Repeat maxima are computed separately with `scoredActionFrameGaps`. Readiness uses the unchanged
action-specific predicate and 50 ms driver polling. Neither experiment changes the canonical SVG,
the scorer, the action plan, or the ready predicate.

| Mode and arm                                       | Scored-repeat maxima (ms) | Post-action P95 (ms) | Ready P50 / P95 (ms) |
| -------------------------------------------------- | ------------------------- | -------------------- | -------------------- |
| Landscape/light main control                       | 22 / 20 / 22              | 22                   | 128 / 128            |
| Landscape/light hidden-until-ready candidate       | 19 / 21 / 18              | 19                   | 129 / 130            |
| Landscape/light follow-up isolated-main control    | 18 / 17 / 21              | 18                   | 128 / 130            |
| Landscape/dark main control                        | 27 / 20 / 27              | 27                   | 134 / 136            |
| Landscape/dark hidden-until-ready candidate        | 26 / 26 / 19              | 26                   | 131 / 226            |
| Landscape/dark activation-time predecode candidate | 21 / 21 / 27              | 21                   | 129 / 129            |

The preceding known-good landscape/light idle control passed, with scored-repeat maxima 17 / 17 / 22
ms and post-action P95 17 ms.

**Hidden until ready:** changed the paper image's `hidden` expression from `!overlayUrl()` to
`!displayedOverlayUrl`. The hypothesis was that avoiding layout of the empty image before its
decoded source arrived would remove the selection-frame work. The second light-mode main control
also passed, preventing causal attribution of the candidate's apparent light-mode win. Dark mode
remained red and had a readiness tail. The product change and provisional test edit were reverted.

**Activation-time predecode:** called the existing `prefetchPageOverlay(page)` from `pickPage`,
before its existing press-feedback wait. The recorded activation is click-only, while the existing
predecode handlers listen to pointer entry and pointer-down. Starting that same work on activation
did not clear the dark-mode gate. The product change was reverted.

Both candidates were provisional dirty builds based on the main control; neither has a certified
product commit. They must not be promoted as measurements of unchanged main. Their exact patches and
original JSON remain in the gitignored raw corpus `perf-profiles/epic-1567-september-resume/`. The
two worktrees' canonical `tools/perf` trees were byte-identical throughout these A/B captures. The
per-repeat results and provisional provenance are also durable in
[issue 1569's experiment comment](https://github.com/KyleMit/Splotch/issues/1569#issuecomment-5552142331).

| Original artifact, relative to the raw corpus | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `main-control/known-good-idle.json`           | `e11a51d67cc346c94e95213605001be04a1b6c43f75f2099327d6a0a2992bf91` |
| `main-control/landscape-light-coloring.json`  | `159e9dae9ee548208e01561bfb3aaff9a61f4276cdd4b0c6e558cb9c33365375` |
| `main-control/landscape-light-followup.json`  | `b025a01349f273e9bcc9fa8284b7b3bce53b6fa79135e1fcfcdd84e21a7c6080` |
| `main-control/landscape-dark.json`            | `17b1bd295d96fd3be5b14130bc0df544e39a44f9f33689cdce02418cc83c7d77` |
| `ready-overlay-provisional.patch`             | `13e1e695dceaefc82c97a2808c79ad1f440b8e186809bc83e5eac5b1e4ac217f` |
| `ready-overlay-provisional.json`              | `6bbba92b0b78dbc249b79b574a79fa272c802560cdf0fa67f37f38acb59cddb9` |
| `ready-overlay-provisional-dark.json`         | `7db62ef0297f8d72c07d82f99d28a9741c71a04476877abadf2663fa2e135115` |
| `activation-decode-provisional.patch`         | `b618921798de1eaab279aae41862e32cdc0786f14f51c66b79e051761df44bb5` |
| `activation-decode-provisional-dark.json`     | `e8e325244881466cf898d39670beb1697dfb6673e9b5faf8495a6648ef0b8614` |

## Instruments attribution

An all-process Time Profiler recording of the same main product reproduced the selection red. Its
whole-sweep aggregate contains both Inspector evaluation and SVG/GPU work; aggregate counts do not
establish which work occupied a particular action frame.

To resolve that ambiguity, one temporary diagnostic field,
`timeOriginUnixMs: performance.timeOrigin`, was added to each result in the isolated control's
`action-probe.js`. It changes reporting only. The product build stayed the clean main build. A
second trace paired that timestamp with the unchanged relative action and frame timestamps. The
runner refused an attempted two-repeat command; the diagnostic therefore used its required warmup
plus three scored repeats. Only samples covered by the shorter trace can be correlated. The
temporary probe edit was reverted after use.

For scored repeat 2, the 29 ms frame spans trace seconds 47.690000244 to 47.719000244. The 1 ms
sampling table contains six WebContent main-thread samples inside that frame and 17 GPU-process
samples. The main-thread samples include the reactive/mutation work, paint, and SVG path submission;
none contains `PageRuntimeAgent::evaluate`. The GPU samples include five samples of
`IOSurfacePool::tryEvictOldestCachedSurface`, subsequent surface creation, Metal command submission,
and path rendering. Counts across threads are concurrent samples, not additive wall-clock costs.
This supports a surface/rasterization hypothesis rather than blaming Inspector evaluation for this
particular frame; it does not prove every selection red has the same cause.

The aligned trace export exited successfully but emitted dylib-overlap warnings for several system
processes. The relevant sampled WebContent/GPU frames resolved to named symbols. Raw traces and
exports remain local because they contain device and host metadata.

The timestamped diagnostic JSON's SHA-256 is
`f908f22c1cb64bdbbb3846914d7be4f3a8a891a1cb6562103bfdec262a457e0e`; the temporary probe patch's
SHA-256 is `0c3647933e05255784168f7c8e6c2555afbfeea65e63166a916cc6e56ec1de32`.

Issue 1569 remains open, with its faithful red and both negative product outcomes preserved. No
measured exception or relaxed gate has been approved. A current canonical landscape/light action
sweep is the next input for selecting another unresolved cell.

## Capture-path interruption

The first canonical landscape/light sweep failed during repeat 3's idle readback: Safari's remote
debugger did not answer `window.__actionProbe.finish(null)` before its 120-second timeout. No final
JSON was written, so no partial result is scored. WDA still answered its health check. A screenshot
after runner cleanup showed the unlocked home screen; it does not establish whether a prompt was
present during the blocked command.

A new session-owned Appium service on a free port reused the same external WDA without taking over
its lifecycle. Its full idle control passed with post-action P95 18 ms. The canonical harness was
restored after the timestamp diagnostic. A focused landscape/light `idle,settings-controls` control
completed; the failed full-sweep log remains local rather than being rerolled away.

## Settings opening: current experiment

The canonical landscape/light control reproduced `open Settings` at 27 / 28 / 28 ms scored-repeat
maxima, post-action P95 26 ms, and readiness P50/P95 229 / 230 ms. Disabling Advanced Controls was
17 / 17 / 17 ms; enabling was 18 / 19 / 21 ms, with post-action P95 18 ms. Both controls passed. The
older focused enable red is therefore not assumed to persist on this control.

A timestamped Settings-only diagnostic reproduced opening maxima of 24 / 28 / 27 ms. Its trace
aligns a late slow frame with animation completion, compositing hierarchy changes, touch-region
updates, layer removal, and painting. The following slow frame contains DOM construction, style,
layout, and accessibility work. These are sampled observations, not an additive accounting of
wall-clock cost. The temporary timestamp field was reverted after the diagnostic.

The bounded candidate adds `contain: layout paint` only to the wide shell's already-clipped
scrolling pane. The hypothesis is that limiting layout/paint invalidation across that boundary
reduces the opening/fill work. It does not change section scheduling or add persistent compositor
promotion to the whole Settings dialog. Local WebKit screenshots of the opening view were visually
identical; the pane's bounding box was identical. Containment changes the sections' offset parent,
so raw `offsetTop` values are not directly comparable. Full scroll and deep-link checks remain
required if the physical result supports keeping the candidate. It is a provisional dirty build, not
accepted product evidence.

The first canonical candidate capture passed opening frames at 19 / 20 / 26 ms maxima, P95 19 ms,
but driver-observed readiness worsened to P50/P95 332 / 1008 ms. The animation-start records were
11–18 ms after activation, so a paired diagnostic observed the unchanged `dialog.open === true`
predicate in the existing mutation observer. It added no activity or scoring rule and was reverted
in both worktrees after use. The main control's in-page opening times were 17 / 12 / 12 ms; the
candidate's were 9 / 16 / 10 ms. Driver readiness for those same arms was 224 / 331 / 334 ms and 239
/ 235 / 341 ms respectively. Remote readback is therefore not a precise opening-latency clock on
this path.

The paired diagnostic also failed the candidate's frame gate: main maxima 29 / 24 / 26 ms, P95 24
ms; candidate maxima 27 / 30 / 28 ms, P95 21 ms. The initial canonical pass did not establish a
repeatable gate win. Containment was reverted. The raw captures, exact patch, and readiness-only
diagnostic patch remain in the local corpus. Settings opening remains a faithful red with a bounded
negative product outcome; neither its failed follow-up nor the first candidate pass is discarded.

The Settings disposition and artifact hashes are recorded in
[the epic comment](https://github.com/KyleMit/Splotch/issues/1567#issuecomment-5552347625).

## Brush and rotation controls

The canonical probe's portrait/light `idle,brushes` control passed every measured action. Brush Menu
opening maxima were 19 / 17 / 17 ms; Magic selection was 17 / 17 / 17 ms. The historical
Magic-selection red is not assumed current from its old matrix entry.

The portrait/light `idle,rotation` control passed empty rotations and both undo-restoration checks.
With ink, portrait-to-landscape measured 27 / 26 / 26 ms maxima, P95 26 ms; landscape-to-portrait
measured 23 / 25 / 24 ms, P95 24 ms. Every slow frame was the first full post-resize interval,
ending about 24–28 ms after resize. Engine resize ran roughly 150 ms later with duration 0 ms at the
probe's resolution, with no canvas mutations. An aligned system trace is the next attribution input;
changing the engine's delayed resize would not target the measured slow interval.

The aligned diagnostic failed at repeat 4 setup because the trusted stroke did not enter undo
history; no final action JSON was written. The timestamped responses from completed earlier samples
remain recoverable from the local Appium log, whose response payload is truncated at 1024
characters. Only complete fields before that truncation are used for attribution, never as a
completed scored capture. In one recovered portrait-to-landscape sample, the first-frame timestamp
and the first two post-action gaps align the 26 ms frame to trace seconds 71.397–71.423. The trace
contains GPU surface-pool eviction and command submission alongside WebContent layout work in that
interval. It does not uniquely identify the paper sheet as the owner.

The export reported success but contained two XML-forbidden control bytes in one system symbol. They
were removed only in the parser's in-memory copy; the original export and trace were not edited. The
canonical probe was restored after the failed diagnostic. The next bounded candidate adds
`will-change: transform` to the textured paper sheet, testing whether a separate reusable paper
backing avoids rotation work. It changes no engine timing, pixels, or paper geometry and remains
provisional until a faithful physical comparison and resource-cost assessment support it.

The paper-sheet candidate never reached measurement: XCTest timed out launching Safari, and a fresh
unchanged-main idle control failed at the same launch. WDA still answered health checks and the iPad
was unlocked with Splotch visible. An existing-Safari attach was initially rejected by automatic
approval review as possible foreign-process ownership. Inspection of the installed
`ExistingWdaUrlStrategy` proved its launch only connects proxies/status and its quit stops neither
xcodebuild nor XCTest; the same action was then approved. With Safari launch/termination disabled,
WDA session creation succeeded but the debugger found no inspectable pages. The device process list
contained Safari and WDA but no WebContent process.

Permission for a Safari-only recovery was requested because the current Safari PID's creation could
not be proved from the session records. Borrowed WDA and RemoteXPC remain untouched. The unmeasured
paper-sheet candidate was reverted, with its patch retained; it is blocked evidence, not a negative
performance result.

Android's refreshed preflight passed input density at 1.02 moves/frame and 121.9 contact moves/s,
and both the device and loaded page followed landscape/portrait rotation. A clean-main Android
portrait/light coloring control is the next measurement while the Safari request remains pending.

## Android coloring-grid scroll attribution

The direct-CDP portrait/light control reproduced scroll maxima 33.4 / 33.3 / 33.4 ms, P95 33.3 ms.
Opening, selection, and clearing passed. A same-plan Chrome trace showed repeated long rAF intervals
across the gesture rather than a one-off image decode. In the second repeat's first 900 ms, the
renderer emitted 18 `DrawFrame` events roughly 50 ms apart, while `BeginFrame` kept arriving at
about 16.7 ms. Only one raster task was present, lasting 0.133 ms. Main-thread tasks were short;
this does not support blaming selector decode for the sustained cadence.

The CDP driver's `movePointer` awaits each dispatched touch acknowledgement and then sleeps another
16 ms. A temporary diagnostic replaces only this scroll's delivery with
`Input.synthesizeScrollGesture`, preserving the start/end coordinates, intended 450 ms duration,
touch source, product, ready predicate, and frame scorer. The protocol's speed is pixels per second
and negative Y distance scrolls down, per the
[Chrome DevTools Protocol input reference](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-synthesizeScrollGesture).
The diagnostic is not a product treatment or a matrix replacement. Its purpose is to distinguish
delivery cadence from product work before changing the existing selected-overlay predecode.

The browser-generated diagnostic passed scroll with maxima 16.8 / 33.4 / 33.3 ms and P95 16.8 ms.
Its renderer's draw events ran about 16.7 ms apart during the swipe, with trusted pointer-down at
the same coordinates. The same traced run had two idle maxima near 50.1 ms and failed that control;
it is retained as diagnostic evidence, not certification. Product predecode was not changed.

The narrow implementation delegates only the coloring-scroll gesture to Chrome and records
`scrollDelivery: cdp-synthesized-scroll` in that sample. The other input paths remain separate.
Focused Android-browser/XCUITest tests passed (93 tests), as did type checks, lint, and formatting.
The first non-traced canonical attempt stopped at the stale-build guard because the working
checkout's build still held the reverted paper-sheet experiment. It produced no action artifact.
That early exit leaked the known 60 Hz overrides (ADR-0143); both were verified at 60 and deleted
using the documented recovery. The prior exact settings were not recorded, so this is restoration to
unset defaults, not a claim of exact prior-setting restoration. Subsequent action captures start
with those keys unset and must restore that observed state.

The tested harness patch was applied beside the isolated clean-main build. Its complete
portrait/light action plan passed all 49 actions without tracing. Scroll maxima were 33.3 / 33.3 /
16.8 ms, with P95 16.8 ms; idle maxima were 33.3 / 33.3 / 16.7 ms, with P95 16.7 ms. The served
product remains 196a97757782a93ccb7a53cbb9aae3d313db2e56; harness source differences remain
explicit. The later metadata guard excludes desktop wheel samples from the touch-delivery label and
does not change the measured Android path.

The evidence keeper promoted the original control and both diagnostic action files into
`perf-profiles/evidence/2026-09-05-epic-1567-android-scroll-study/`, and the complete sweep into
`perf-profiles/evidence/2026-09-05-epic-1567-android-scroll-canonical/`. All four source hashes
remained unchanged after promotion, and every promoted file was checked against both locally
resolved device identifiers. Traces remain local. These focused artifacts do not update the
authoritative four-row matrix.

Before the first campaign commit, origin/main advanced to c373ae26dfd397f7822065a1b52e1121da3f7660
through PR #1671. Its changes are confined to the page-inventory generator, tests, and generated
report; no product or capture code changed. The campaign branch fast-forwarded to that main commit.
Captures retain their actual measured product commit rather than being relabeled.
