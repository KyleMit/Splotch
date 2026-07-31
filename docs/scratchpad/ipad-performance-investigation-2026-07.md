# iPad performance investigation — session log

> Working notes from the July 2026 performance campaign on PR
> [#682](https://github.com/KyleMit/Splotch/pull/682). ADRs remain the source of truth for retained
> architectural decisions; this document is the readable session narrative, including rejected
> paths, operational lessons, and unfinished work.

## Executive result

The original iPad drawing lag is fixed without lowering visual resolution. The production renderer
still draws at `min(devicePixelRatio, 2)`; it presents the live paper as sixteen full-resolution
tiles instead of one very large mutable canvas. On the physical 12.9-inch iPad Pro, the original
single canvas produced 417.03 ms of render starvation per drawing-second and paint latency of
480/630/696 ms P95/P99/max. The retained tiled renderer produced zero starvation, with final brush
captures between 14–16 ms P95, 16–24 ms P99, and 24–41 ms max.

Undo was then rebuilt around cropped tile-local before-image patches. Its physical-iPad baseline
after twenty pen commands was 1,778 ms P95/max; the retained path measured 0–1 ms engine time and
5–13 ms next-frame P95/max while preserving normal undo depth and full-resolution pixels.

The tiled architecture was also tested against the pre-tiling build on the same Mac. It did not make
desktop drawing slower in a user-visible way: in-contact P95 was unchanged, renderer bookkeeping
remained below 0.3 ms/frame, and the tiled build removed repeatable 0.5–0.7 second between-stroke
Magic gaps plus screenshot and coloring-selection failures. The result was option A from the
architecture decision: retain one production renderer rather than add platform detection and two
implementations.

Subsequent work made theme switching, screenshot save, coloring-page selection, rotation, clear,
brush selection, Parent Center transitions, and several cold UI mounts frame-bound. A committed
seven-target deployment matrix and interactive report now compare web/native behavior across the
physical iPad, iOS Simulator, Android emulator, and Mac. Physical Android web/native remain the two
missing rows.

## What “acceptable” means

MobileSafari presented web content at an observed 60 Hz even on the 120 Hz ProMotion panel. One
presentable frame is therefore about 16.7 ms. The drawing gates were calibrated to that cadence:

| Metric                             |                  Gate | User interpretation                                      |
| ---------------------------------- | --------------------: | -------------------------------------------------------- |
| Paint P95                          |                ≤20 ms | Almost every sample appears in one refresh               |
| Paint P99                          |                ≤33 ms | Almost every outlier appears within two refreshes        |
| Paint max                          |                ≤50 ms | Ordinary worst cases remain under three refreshes        |
| Hard freeze                        |          ≥67 ms fails | Four missed 60 Hz frames is visible                      |
| Starvation                         | ≤10 ms/drawing-second | Long compositor gaps cannot hide behind good percentiles |
| Undo engine P95                    |                ≤20 ms | Restore work fits near one refresh                       |
| Undo next-frame P95/max            |             ≤33/50 ms | The response appears within two/three refreshes          |
| Discrete action post-frame P95/max |             ≤20/32 ms | Transition stays at one refresh; no two-frame hole       |
| Discrete action first-frame P95    |                ≤32 ms | App begins visibly responding within two refreshes       |

P95 is the useful normal-experience boundary, but P99, the absolute max, and starvation must all be
kept. A single one-second freeze can coexist with a clean P95. Likewise, a frame interval that began
before the app received an automation event must be scored by the post-input remainder rather than
charged entirely to the product.

## Why the issue appeared on iPad

The decisive evidence separated JavaScript from presentation:

* Trusted XCUITest input delivered about 117 moves/second to a 2732×1830 backing store.
* `engine.draw` remained at or below 2 ms, input queue delay remained roughly 5–7 ms, and pointer
  handlers continued running about every 8.3 ms.
* `requestAnimationFrame` stopped for hundreds of milliseconds while input and drawing continued.
* When frames resumed, the already-drawn stroke appeared in a jump.

The bottleneck was Mobile WebKit’s canvas-surface flush/presentation path for one large actively
mutated surface. It was not primarily stroke mathematics, event loss, undo encoding, Svelte state,
refresh rate, or CPU speed. Resolution and DPR mattered because they made the surface large; WebKit
and the iPad GPU/display-process path mattered because desktop Playwright WebKit did not reproduce
the cliff even at the same nominal geometry and DPR. Refresh rate determined the gate, not the root
cause.

The desktop browser, phone, and Mac did not cross the same surface-size/presentation cliff. Local
Playwright remains useful for rejection, semantic checks, and comparisons, but a local pass cannot
approve changes to the physical iPad compositor path.

## The render-scale question

A 1.5× cap reduced the 2× canvas by 25% in each linear dimension and discarded 43.75% of its backing
pixels. It visibly softened the result and still did not eliminate all lag classes. Screenshot tests
later showed that a fresh Magic export blocked for 288–354 ms at full scale, 202 ms at 1.99×, and
144 ms at 1.5×. Lowering resolution was therefore neither a complete fix nor a no-degradation trade.
It was rejected after the topology fix preserved the full 2× result.

## What “vectorized” means here

The retained history records semantic drawing operations in paper coordinates: brush type, points,
color, width, texture state, and Magic-sheet identity. That is vector-like command history, not an
attempt to convert the final crayon pixels into clean SVG paths. Crayon remains a textured raster
rendering process with tile-local preview buffers and checkpoints every 64 operations. Magic uses
tile-local raster pattern sources. Undo restores cropped raster before-images for speed, while the
operation log remains available for replay, export, resize fallbacks, and idle compaction.

This distinction matters: the difficult crayon look was not re-vectorized into simplified geometry.
Its authored visual behavior remains in the brush renderer. The vector operation log describes how
to redraw it; tile-local rasters bound how much WebKit must mutate and how much undo must restore.

## Serial drawing investigation

Forty-four physical-device trials changed one idea at a time. Each experiment was backed out before
the next unless it became part of the final architecture. The complete table and re-attempt recipes
are in [ADR-0085](../adrs/0085-tiled-live-canvas-for-ipad-webkit.md); these are the turning points:

|    Trial | Strategy                                  | Starvation ms/s | Paint P95/P99/max ms | Conclusion                                               |
| -------: | ----------------------------------------- | --------------: | -------------------: | -------------------------------------------------------- |
| Baseline | One full-resolution live canvas           |          417.03 |          480/630/696 | Severe physical-iPad starvation                          |
|        2 | Remove undo snapshots                     |          406.76 |          156/172/189 | Undo was not the drawing root cause                      |
|        3 | Remove paper commit                       |          395.30 |          167/261/327 | Commit removal was insufficient                          |
|        6 | `willReadFrequently`                      |          413.74 |          265/331/367 | CPU-canvas hint failed                                   |
|       10 | Record history, stop visible mutation     |          326.05 |          245/296/330 | Surface mutation mattered, but not alone                 |
|       11 | Bare pointer processing                   |               0 |             15/31/38 | Input/JS path could meet the gate                        |
|       12 | One surface, no command recording         |          400.86 |          153/170/187 | One painted surface reproduced the cliff                 |
|       13 | Thirty-two aggregate tiles                |               0 |             16/17/38 | Surface topology was decisive                            |
|       14 | Tiles plus old full-size undo paper       |          335.56 |          249/316/342 | Any large offscreen mutated surface could reintroduce it |
|    17–19 | Four/sixteen tiles plus operation history |               0 |    13–16/17–33/31–39 | Viable architecture                                      |
|       21 | Tiled Magic with giant pattern source     |           60.64 |            41/78/115 | Large source surface still crossed the cliff             |
|       22 | Tile-local Magic sources                  |               0 |             16/26/36 | Fixed Magic without quality loss                         |
|       23 | Crayon previews without checkpoints       |            8.20 |             18/37/56 | Long crayon pass still accumulated too much work         |
|       26 | Checkpoint crayon every 64 ops            |               0 |             16/24/36 | Retained                                                 |
|       40 | Fold overflow history immediately         |           23.46 |           20/108/200 | Background maintenance may not run during interaction    |
|       41 | Fold one command after 1.5 s idle         |               0 |             16/28/49 | Retained                                                 |
|       44 | Normal Web Audio with final tiles         |               0 |             15/24/35 | Audio suppression was unnecessary                        |

Rejected paths included making the canvas opaque, `desynchronized`, `willReadFrequently`, restoring
browser touch behavior, suppressing callbacks, hiding presentation, removing crayon surfaces,
removing history, lowering scale, rate-limiting drawing audio, and replacing Web Audio with media
elements. Several improved one number but did not cross all gates; some degraded visuals or audio.

## Retained drawing architecture

The production drawing route owns a fixed 4×4 grid. Each tile has normal ink and two crayon preview
layers. The old full-size `#drawingCanvas` remains as a transparent input/accessibility surface but
has only a 1×1 bitmap and is never painted in production. Operations remain in paper coordinates,
and only intersecting tiles are touched.

Important invariants learned during productization:

* A large offscreen canvas can trigger the same WebKit cliff as a visible one.
* Magic pattern sources must be cropped per tile and retain the immutable sheet they first revealed.
* Crayon previews must be tile-local and periodically checkpointed.
* Eraser empty scans must be deferred and performed over tile-local content.
* Old operations may be folded into a tiled base only after idle, one command at a time; pointerdown
  cancels compaction.
* Ordinary builds must tree-shake all profiling marks and test-only persistence sinks.

Final physical-device drawing captures all recorded zero starvation:

| Brush/case                              | Paint P95/P99/max ms |
| --------------------------------------- | -------------------: |
| Pen                                     |             16/17/34 |
| Crayon                                  |             14/24/41 |
| Magic                                   |             15/16/24 |
| Eraser on filled paper                  |             16/18/26 |
| Crayon after idle compaction            |             16/27/48 |
| Magic, three repeats, Web Audio enabled |             15/24/35 |

## Undo investigation

Vector replay was a useful diagnostic and fallback, but replaying twenty commands on undo took about
1.5–1.8 seconds on the iPad. Full-paper snapshots recreated the large-surface problem. The retained
design captures cropped before-images only for touched regions and only for intersecting tiles. Undo
restores those patches rather than repainting the whole drawing.

Normal history retains twenty undo steps. Canvas-spanning commands reduce depth adaptively before
patches exceed a three-paper resident byte budget. Clear is also a snapshot command, but empty-tile
state and deferred clearing avoid allocating or flushing unnecessary surfaces. Geometry-changing
fallbacks may replay retained vector operations when old patches no longer fit.

The serial undo trial table, clear sub-trials, and re-attempt instructions are in
[ADR-0086](../adrs/0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md). The main lesson is
that operation history and raster patches are complementary: operations preserve semantics and
fallback correctness; patches bound the interactive restore cost.

## Follow-on user-visible fixes

Each substantial issue was reproduced, isolated, changed one strategy at a time, and cross-checked
on other available targets. Authoritative details live in the linked ADRs.

| Interaction                         | Measured failure                                                | Retained approach                                                                                                      | Final evidence                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme switch                        | 978–1,214 ms missed-frame gap                                   | Decode theme assets without repainting inactive Magic history; extend sheet edges from source strips; hide empty tiles | 9 ms P95, 29–33 ms max on physical iPad ([ADR-0087](../adrs/0087-frame-bound-theme-switch-on-ipad-webkit.md))                              |
| Screenshot                          | 241–401 ms main-thread blocked frames; some brush exports worse | Snapshot settled tiles, compose/encode in a worker, cool down duplicate taps                                           | 9–13 ms P95, 25 ms worst across repeated pen/crayon/Magic saves ([ADR-0088](../adrs/0088-frame-bound-screenshot-export-on-ipad-webkit.md)) |
| Coloring selection                  | 50 ms max on simulator after earlier visibility fix             | Generated alpha-native overlays plus worker-ready Magic sheets                                                         | physical native 17 ms P95 / 18 ms max; Mac 19 ms max ([ADR-0091](../adrs/0091-alpha-overlays-and-worker-magic-sheets.md))                  |
| Rotation                            | 56–57 ms isolated; 111–131 ms in blank/undo sequence            | Keep tiles in upright paper coordinates and rotate with CSS; lazy hidden surfaces; staged blank migration              | physical ink 20–31 ms, 9 ms P95; later sequences ≤26 ms ([ADR-0089](../adrs/0089-css-presented-tiled-paper-on-rotation.md))                |
| Audio after lift                    | Audible tail lasted seconds                                     | Synchronously zero gain, disconnect both nodes, call untimestamped `stop()`                                            | teardown 0/0/1 ms in three Magic strokes; frame max 25 ms                                                                                  |
| Clear                               | Full-surface snapshot/clear gap                                 | Tile-state snapshot and deferred backing clear                                                                         | retained action within the discrete-action gate                                                                                            |
| Cold release notes                  | Cold locale/date work delayed first response                    | Pre-group release history and reveal work across frames                                                                | cold What's New first response reduced into gate                                                                                           |
| Crayon/Magic/custom color selection | Cold resource/layer work on selection                           | Defer or precompute only the work needed for first visible state                                                       | retained focused runs within 20/32 ms gates                                                                                                |
| Action drawer                       | Layer/transition burst                                          | Bound the transition work and score action-aligned frames                                                              | retained focused run within gate                                                                                                           |
| Parent setting toggle               | Global `<html>` state invalidated a 1440×2780 document          | Keep immutable boot seed on `<html>` and live state on the action panel                                                | Android 30-repeat screenshot off/on both 16.8 ms max; Mac 20/19; iPad sim 17/19                                                            |
| Advanced controls                   | Two simultaneous slide transitions drove a shared GPU burst     | Group both rows under one `advanced-controls-settings` transition wrapper                                              | Android 30-repeat off/on 16.8/16.8 ms; Mac 18/18; iPad sim 25/26                                                                           |

The audio fix intentionally kept Web Audio. The original fade scheduled against
`AudioContext.currentTime`; WebKit could leave the context suspended at time zero, so the scheduled
stop and `onended` cleanup never ran. Pointerup reached `stopDrawSound()` in 0–1 ms. Teardown now
has no dependency on audio-clock progress.

## Cross-platform architecture comparison

The Mac A/B used the current runner and test plan against two served applications: current tiles and
the immediate pre-tiling commit `2769ceae`. Headed Playwright WebKit ran at 1512×982 CSS pixels and
2× DPR on an M5 MacBook Pro.

| Build              | Result                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Current tiled iPad | All 46 actions passed; first-response P95 ≤29 ms, post P95 17 ms, post max ≤32 ms                                           |
| Current tiled Mac  | Renderer-sensitive actions passed; post P95 19 ms                                                                           |
| Pre-tiling Mac     | Screenshot repeatedly failed at 78–88 ms first response and 41–44 ms post max; coloring selection reached 32–33 ms post max |

In-contact frame P95 stayed at 19 ms on both Mac renderers. The old Magic path nevertheless lost
1,162–1,344 ms between strokes and had 495–658 ms whole-window maxima; tiled Magic lost zero and
held the whole-window max to 19 ms. This is why a second architecture and platform sniffing were
rejected.

## Deployment matrix snapshot

The committed report is
[scrapbook/performance/2026-07-31-deployment-target-matrix](../../scrapbook/performance/2026-07-31-deployment-target-matrix/index.md).
It contains normalized JSON plus Markdown and an interactive visualization. It currently describes
product commit `09c4efac27ca` and seven of nine targets:

1. physical iPad native;
2. iPad Simulator web;
3. iPad Simulator native;
4. Android emulator web;
5. Android emulator native;
6. physical iPad web;
7. macOS web.

Physical Android web and native were unavailable because the phone never became an authorized ADB
device. The snapshot preserved failures rather than repeating until green. The notable captured
failures were physical-iPad native crayon (one 73 ms in-contact gap), several native rotation/action
cases that were subsequently fixed, and severe Android-emulator Chrome action noise under the
original Appium transport.

The iOS Simulator did reproduce the historical renderer strongly enough to be a rejection tier.
Against `2769ceae`, historical web Magic measured 1371/1604/1653 ms P95/P99/max with 650.69 ms/s
starvation; historical native Magic measured 1046/1246/1296 ms with 767.63 ms/s. Current tiled
web/native Magic measured 15/16/17 and 16/18/20 ms. Simulator success still cannot approve a
physical device, but it can catch reintroduction of the original architecture.

## Harness and measurement lessons

### Use the transport that measures the actual target

* Physical iPad web/native and both iOS Simulator variants use Appium/XCUITest for trusted native
  touch and an in-page probe for frames.
* Android browser actions use direct CDP trusted touch. Appium’s Android Chrome cadence introduced
  global scheduling noise and is not an approval path.
* Android native uses Appium to attach to the Capacitor WebView.
* Mac uses headed Playwright WebKit.
* Native rotation must unlock the real product preference through Parent Center, reload so the
  Capacitor plugin releases the platform lock, then restore the preference. A profiling-only state
  mutation would test a path no parent performs.

### Measure the action, not a convenient nearby window

The action probe records the input mark, first frame, readiness observation, and every post-action
frame. `a977f457` added action-aligned trace marks and focused trace windows so a failure can be
attributed to layout, paint, raster, GPU, or idle scheduling rather than guessed from a broad trace.

An Android `enable drawing sounds` sample showed a 50.1 ms frame around 425–475 ms after the setting
was ready in 5.3 ms. The trace contained compositor `BeginFrame` events but no main-thread frame,
animation callback, long task, layout, paint, raster, or GPU work that could explain product
blocking. A 30-repeat no-op idle control then produced P95 16.8 ms and max 66.6 ms with no UI
mutation. That late gap is ambient renderer omission of an animation callback on a static page, not
sound work. The scorer still needs to stop treating such idle omissions as visible action freezes
without hiding truly deferred rendering.

Evidence:

* `perf-profiles/2026-07-31T23-01-08-673Z-android-web-actions-advanced-controls-trace-window-3/trace.json`
* `perf-profiles/2026-07-31T23-25-19-480Z-android-web-actions-idle-control-sound-attribution/actions.json`

### Fidelity is a gate of its own

A timing pass under unrealistic input is advisory. Physical MobileSafari was calibrated by touch
cadence and contact geometry. Native WebView coalescing, simulator touches, and Android automation
have different signatures. Reports retain these distinctions instead of applying the iPad approval
label to every Appium session.

### Preserve raw artifacts and failed samples

Do not repeat a red measurement until it happens to pass. Save the raw JSON/trace, label the exact
product commit, classify input fidelity, and run a focused follow-up. The committed report stores a
normalized dataset; `perf-profiles/` retains local raw timelines and is intentionally gitignored.

## Test seams retained in production source

Profiling behavior is compile-time gated by `PERF_MARKS`/the dev harness build. Normal builds strip
engine marks, action marks, automation data, and the screenshot save sink. The screenshot action may
provide `window.__screenshotSaveSink` only in a profiling build so benchmarks observe completion
without writing images into Photos or waiting on a system permission sheet. Product orientation is
not bypassed by a seam; the harness drives the real setting.

The general rule learned here: keep seams only at external nondeterministic boundaries, make them
compile-time removable, and use real product state transitions everywhere else.

## Commit ledger

The branch history is the most exact chronology of retained work:

| Commit     | Purpose                                                |
| ---------- | ------------------------------------------------------ |
| `2769ceae` | Automate trusted iPad compositor profiling             |
| `75502980` | Tile the live canvas                                   |
| `94a9ae84` | Make tiled undo frame-bounded                          |
| `f88d7bd3` | Eliminate theme-switch stall                           |
| `dde39112` | Move screenshot export off the interaction path        |
| `2392ee40` | Make coloring pages visible immediately                |
| `4fb6fb7f` | Handle brush-complete screenshot stalls                |
| `5e8ca08c` | Stop drawing audio immediately on lift                 |
| `ecf15734` | Keep iPad rotation frame-bound                         |
| `0289298f` | Add physical-iPad performance gates                    |
| `92b22aac` | Keep clear frame-bound                                 |
| `846acd60` | Keep blank rotations frame-bound                       |
| `ac7a0f39` | Keep crayon selection frame-bound                      |
| `b46faa39` | Remove cold locale work from release notes             |
| `44b31a98` | Keep Magic selection frame-bound                       |
| `734d66a5` | Keep custom color picker frame-bound                   |
| `092b32d3` | Expand physical-iPad action coverage                   |
| `8231e53a` | Restore drawing-engine quality gates                   |
| `e29d88ef` | Teach app-driver smoke tests about tiled ink           |
| `09c4efac` | Verify the tiled renderer on Mac                       |
| `044f5675` | Add the deployment performance matrix                  |
| `2f99e107` | Keep clear snapshots frame-bound                       |
| `dffcbfbc` | Recover native profiling setup after reload            |
| `92d30866` | Recover native action probes at measurement boundaries |
| `a3d90794` | Preserve drawing surfaces through rotation             |
| `5ce9bf06` | Render release history across frames                   |
| `4f0474c7` | Keep coloring-page selection frame-bound               |
| `2e31fa00` | Keep action-drawer frames responsive                   |
| `254e4195` | Add direct Android web action profiling                |
| `cd0ebcfd` | Repair mount-profile artifact writes                   |
| `67d1fe14` | Keep What's New frames responsive                      |
| `81470266` | Make theme profiling self-contained                    |
| `a977f457` | Add action-aligned performance diagnostics             |
| `3b8ca269` | Scope live Parent Center state to its panel            |
| `b91fcc08` | Group advanced-control transitions                     |

## Current status and unfinished work

The latest product changes are pushed on `experiment/trusted-ipad-input` and PR
[#682](https://github.com/KyleMit/Splotch/pull/682). The remaining work is deliberately split into
task-specific files in `docs/handoff/`:

* capture physical Android web/native and refresh the nine-target matrix;
* refine the discrete-action idle-frame gate using the no-op control evidence;
* rerun the complete current action suite and classify any genuine failures;
* refresh the committed report to the final product commit;
* address PR review feedback against the final branch, revalidating every comment.

One behavior-test follow-up is also known: the full Parent Center Playwright file passed 9/10 after
the advanced-controls change; the remaining assertion expected five separate What’s New date rows,
while the new grouped release-history UI presents one group. That is a stale test expectation, not
an observed performance regression, but it must be validated against intended UX before changing.

## Authoritative references

* [ADR-0083: real-screen capture](../adrs/0083-real-screen-capture-on-device.md)
* [ADR-0084: trusted XCUITest input](../adrs/0084-trusted-xcuitest-input-for-ipad-real-screen-profiling.md)
* [ADR-0085: tiled live canvas and all 44 trials](../adrs/0085-tiled-live-canvas-for-ipad-webkit.md)
* [ADR-0086: dirty-region tiled undo](../adrs/0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md)
* [ADR-0087: theme switching](../adrs/0087-frame-bound-theme-switch-on-ipad-webkit.md)
* [ADR-0088: screenshot export](../adrs/0088-frame-bound-screenshot-export-on-ipad-webkit.md)
* [ADR-0089: rotation presentation](../adrs/0089-css-presented-tiled-paper-on-rotation.md)
* [ADR-0090: performance gates and deployment transports](../adrs/0090-tiered-real-ipad-performance-regression-gates.md)
* [ADR-0091: coloring overlays and Magic sheets](../adrs/0091-alpha-overlays-and-worker-magic-sheets.md)
* [ADR-0092: Android browser action profiling](../adrs/0092-direct-cdp-android-browser-action-profiling.md)
* [Committed deployment-target report](../../scrapbook/performance/2026-07-31-deployment-target-matrix/index.md)
