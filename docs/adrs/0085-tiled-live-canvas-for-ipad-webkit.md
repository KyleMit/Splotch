# ADR-0085: Tile the Full-Resolution Live Canvas to Avoid WebKit Surface-Flush Starvation

**Status:** Active — supersedes ADR-0066, ADR-0068, ADR-0069, ADR-0074, and ADR-0082 for the
production drawing route; amended by
[ADR-0086](0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md) for production undo and
[ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md) for idle tile composition, and amended
by [ADR-0089](0089-css-presented-tiled-paper-on-rotation.md) for rotation presentation and lazy
crayon surfaces; surface-budget evidence amended 2026-08-01; ADR-0086's twenty-step large-sweep
contract amended 2026-08. **Date:** 2026-07

## Context

The real drawing route passed the engine's JavaScript timing gates but visibly lagged on a 12.9-inch
iPad Pro. Trusted XCUITest input on iPadOS 26.5 measured the full-resolution 2732×1830 backing store
at about 117 delivered moves per second. The baseline spent at most 2 ms in one `engine.draw` call,
yet produced 417.03 ms of render starvation per drawing-second and paint latency of 480 ms P95, 630
ms P99, and 696 ms max. The missing time was after JavaScript returned, while WebKit flushed and
presented the actively mutated canvas surface.

Playwright WebKit did not reproduce the device cliff. It reported zero starvation and 15–16 ms paint
P95 at 1366×915@2×, 2049×1373@2×, and even 2732×1830@2×. Local emulation remains useful as a cheap
regression signal, but viewport size, DPR, WebKit, and CPU throttling do not reproduce the iPad's
GPU/display-process path. A physical-device trusted-input run is authoritative for this failure.

The acceptance budget follows the 60 Hz presentation cadence observed in MobileSafari:

* Paint P95 ≤20 ms: nearly every sample appears within one refresh.
* Paint P99 ≤33 ms: nearly every outlier appears within two refreshes.
* Paint max ≤50 ms, with ≥67 ms a hard failure: ordinary worst cases stay below three refreshes, and
  a four-frame freeze is never accepted.
* Render starvation ≤10 ms per drawing-second: long compositor gaps cannot hide behind otherwise
  good percentiles.

Forty-four isolated physical-device trials separated the causes:

| Isolation                                                                | Starvation ms/draw s | Paint P95/P99/max ms |
| ------------------------------------------------------------------------ | -------------------: | -------------------: |
| Baseline: one full-resolution live canvas                                |               417.03 |          480/630/696 |
| Remove undo snapshots                                                    |               406.76 |          156/172/189 |
| Remove the paper commit                                                  |               395.30 |          167/261/327 |
| Keep history but stop mutating the visible canvas                        |               326.05 |          245/296/330 |
| Bare pointer processing, no painted surface                              |                    0 |             15/31/38 |
| One painted full-size surface, no command recording                      |               400.86 |          153/170/187 |
| Two, four, eight, sixteen, or thirty-two full-resolution aggregate tiles |                    0 |    13–16/17–36/25–38 |
| Tiles plus the old full-size undo paper                                  |               335.56 |          249/316/342 |
| Tiles plus vector-operation history                                      |                    0 |             16/33/39 |
| Tiled magic brush with one giant pattern source                          |                60.64 |            41/78/115 |
| Tiled magic brush with tile-local pattern sources                        |                    0 |             16/26/36 |
| Tiled crayon preview without periodic pass checkpoints                   |                 8.20 |             18/37/56 |
| Tiled crayon preview with a 64-op checkpoint                             |                    0 |             16/24/36 |
| Fold overflow history immediately                                        |                23.46 |           20/108/200 |
| Fold one overflow command after 1.5 seconds idle                         |                    0 |             16/28/49 |
| Replace Web Audio with `HTMLAudioElement` playback                       |               272.04 |           37/135/190 |
| Keep the existing Web Audio implementation with the final tiled renderer |                    0 |             15/24/35 |

The complete serial trial log is below. “Δ” is starvation ms/drawing-second relative to the 417.03
baseline; a negative value is an improvement. Every trial changed one strategy at a time and was
backed out before the next, except the final productized combination.

| #  | Isolated strategy                              |   Starvation (Δ) | Paint P95/P99/max ms | Result                                  |
| -- | ---------------------------------------------- | ---------------: | -------------------: | --------------------------------------- |
| 01 | Remove crayon backing surfaces                 |  439.64 (+22.61) |          467/742/805 | Fail                                    |
| 02 | Remove undo snapshots                          |  406.76 (−10.27) |          156/172/189 | Fail                                    |
| 03 | Remove paper commit                            |  395.30 (−21.73) |          167/261/327 | Fail                                    |
| 04 | Make the live canvas opaque                    |   414.31 (−2.72) |          481/625/700 | Fail                                    |
| 05 | Opaque plus `desynchronized`                   |   414.77 (−2.26) |          473/630/697 | Fail                                    |
| 06 | `willReadFrequently` CPU-canvas hint           |   413.74 (−3.29) |          265/331/367 | Fail                                    |
| 07 | Restore `touch-action: auto`                   |   417.63 (+0.60) |          563/780/855 | Fail                                    |
| 08 | Suppress engine callbacks                      |   418.43 (+1.40) |          465/632/690 | Fail                                    |
| 09 | Hide the painted presentation layer            |   419.11 (+2.08) |          562/788/854 | Fail                                    |
| 10 | Record history but stop live-canvas mutation   |  326.05 (−90.98) |          245/296/330 | Fail                                    |
| 11 | Bare pointer processing                        |      0 (−417.03) |             15/31/38 | Timing pass; diagnostic only            |
| 12 | One live surface without command recording     |  400.86 (−16.17) |          153/170/187 | Fail                                    |
| 13 | Thirty-two full-resolution aggregate tiles     |      0 (−417.03) |             16/17/38 | Timing pass; prototype                  |
| 14 | Tiles plus existing full-size undo paper       |  335.56 (−81.47) |          249/316/342 | Fail                                    |
| 15 | Sixteen full-resolution aggregate tiles        |      0 (−417.03) |             16/17/25 | Timing pass; prototype                  |
| 16 | Eight full-resolution aggregate tiles          |      0 (−417.03) |             15/36/38 | Fail P99; prototype                     |
| 17 | Four full-resolution aggregate tiles           |      0 (−417.03) |             13/30/31 | Timing pass; prototype                  |
| 18 | Two full-resolution aggregate tiles            |      0 (−417.03) |             15/30/37 | Timing pass; prototype                  |
| 19 | Sixteen tiles plus vector-operation history    |      0 (−417.03) |             16/33/39 | Timing pass; prototype                  |
| 20 | Functional vector-replay undo                  |      0 (−417.03) |             15/20/29 | Timing pass; prototype                  |
| 21 | Replay undo with one giant magic sheet         |  60.64 (−356.39) |            41/78/115 | Fail                                    |
| 22 | Crop magic pattern sources per tile            |      0 (−417.03) |             16/26/36 | Timing pass; prototype                  |
| 23 | Tile-local crayon preview buffers              |   8.20 (−408.83) |             18/37/56 | Fail P99/max                            |
| 24 | Thirty-two tiles with crayon preview buffers   |  14.40 (−402.63) |             16/31/64 | Fail starvation/max                     |
| 25 | Sixteen tiles plus periodic crayon checkpoints |      0 (−417.03) |             16/28/35 | Timing pass; prototype                  |
| 26 | Set crayon checkpoint interval to 64 ops       |      0 (−417.03) |             16/24/36 | Timing pass; retained                   |
| 27 | Erase a pre-inked tiled surface                |      0 (−417.03) |             15/29/34 | Timing pass; deferred scan not isolated |
| 28 | Defer tile-local eraser empty scan             |      0 (−417.03) |             16/17/26 | Timing pass; retained                   |
| 29 | Repeat magic with complete UI callbacks        |      0 (−417.03) |             13/24/25 | Timing pass                             |
| 30 | Repeat magic with UI callbacks suppressed      |      0 (−417.03) |             14/25/34 | Timing pass; no benefit                 |
| 31 | Repeat magic with drawing audio suppressed     |      0 (−417.03) |             13/25/28 | Timing pass; no benefit                 |
| 32 | Repeat magic with rate-limited drawing audio   |      0 (−417.03) |             16/17/34 | Timing pass; audio degradation rejected |
| 33 | Productized tiled pen                          |      0 (−417.03) |             16/17/34 | Pass                                    |
| 34 | Replace Web Audio with media-element playback  | 272.04 (−144.99) |           37/135/190 | Fail; input-fidelity gate also failed   |
| 35 | Productized tiled crayon                       |      0 (−417.03) |             14/24/41 | Pass                                    |
| 36 | Productized tiled magic                        |      0 (−417.03) |             15/16/24 | Pass                                    |
| 37 | Productized tiled eraser                       |      0 (−417.03) |             16/18/26 | Pass                                    |
| 38 | Repeated productized pen                       |      0 (−417.03) |             16/28/35 | Pass                                    |
| 39 | Repeated productized crayon                    |      0 (−417.03) |             15/24/44 | Pass                                    |
| 40 | Fold overflow history immediately              |  23.46 (−393.57) |           20/108/200 | Fail                                    |
| 41 | Fold overflow history after idle               |      0 (−417.03) |             16/28/49 | Pass                                    |
| 42 | Resume crayon after idle compaction            |      0 (−417.03) |             16/27/48 | Pass                                    |
| 43 | Repeat magic with immutable sheet snapshots    |      0 (−417.03) |             16/25/36 | Pass                                    |
| 44 | Repeat magic with normal Web Audio restored    |      0 (−417.03) |             15/24/35 | Pass; retained                          |

A 1.5× render-scale cap reduced some work but remained visibly laggy and removed 25% of linear
resolution (43.75% of the 2× backing pixels). It failed both the interaction and visual-quality
requirements. CSS promotion, an opaque canvas, `desynchronized`, `willReadFrequently`,
`touch-action`, hidden presentation, suppressed callbacks, and independently removing the crayon
backing, undo snapshots, or commit paper also failed. The decisive variable was the maximum size of
one actively mutated surface, not the total painted pixel count or JavaScript cost.

### Surface-budget amendment (2026-08-01)

The original tile-count prototypes above were single samples, changed both count and grid shape, and
produced a non-monotonic sequence: two and four tiles passed, eight failed P99, and sixteen passed.
They established that tiling removed the catastrophic full-surface stall, but not the per-surface
threshold or the reliability of a smaller grid.

A follow-up campaign on the same physical iPad model, OS, route, orientation, pen gesture, and
full-resolution 4.692 Mpx paper repeated each candidate three times. The
[normalized report and raw-source manifest](../../scrapbook/performance/2026-08-01-live-surface-budget/index.md)
record the twelve captures. The profiler now reads configured dimensions from the renderer rather
than inspecting idle DOM canvases, whose released backing stores report the browser's misleading
300×150 default.

| Grid | Maximum surface | Paint P95/P99/max range | In-contact lost-frame share | Starvation episodes |
| ---- | --------------: | ----------------------: | --------------------------: | ------------------: |
| 2×1  |       2.346 Mpx |       24–25/36–41/50–59 |                  8.31–9.89% |                 0–2 |
| 3×1  |       1.565 Mpx |       16–17/29–32/33–47 |                  6.87–8.26% |                   0 |
| 2×2  |       1.173 Mpx |          16/25–31/37–39 |                  5.42–6.44% |                   0 |
| 4×4  |       0.294 Mpx |       15–16/16–23/25–39 |                  3.08–3.34% |                   0 |

All twelve runs passed the trusted-touch fidelity gate. For this device and workload, a ≥56 ms
surface-starvation episode is therefore bounded above 1.565 Mpx and at or below 2.346 Mpx: the
larger surface produced episodes in two of three runs and failed the paint-tail gates in all three,
while every smaller-surface run had zero episodes. This does not establish a universal WebKit
constant, a brush-independent threshold, or a fully passing interaction run; even the 4×4 cohort
missed the separate 1% cumulative lost-frame-share gate.

The evidence reaffirms 4×4. Its 0.294 Mpx maximum surface has 5.3× area headroom below the largest
repeatably starvation-free surface and roughly halves lost-frame share versus the 3×1 and 2×2
candidates. A barely passing smaller grid would not reduce aggregate live pixels or ADR-0086's
paper-relative undo budget. It would only reduce surface count while surrendering measured flush
headroom.

Over-tiling also has a cost. Each cell owns three live canvases, target visits grow with tile count,
and every boundary expands seam, clipping, transform, export, and replay risk. Trial 24 already
showed the non-monotonic limit: 32 tiles plus crayon preview buffers regressed to 14.40 ms of
starvation per drawing-second and a 64 ms maximum, worse than the retained 16-tile checkpointed
design. Surface size is a budget with headroom, not a quantity to minimize without bound.

The retained fixed grid is not a scale-independent cap. A larger future backing store can cross the
measured interval, while a smaller phone still pays the 48-canvas topology. Re-run the repeated
campaign on any larger supported surface, or after a renderer, WebKit, brush-buffer, or device-floor
change, before changing the grid or treating 0.294 Mpx as a universal target.

### Restamp-era surface-budget amendment (2026-08-30)

ADR-0147 replaced Safari crayon's two mutating preview planes with direct restamps onto the normal
tile and explicitly left the grid unverified for that renderer. A repeated physical-iPad sweep at
iPadOS 26.5, trusted XCUITest touch, ten gesture repeats, and the production route compared the
current 4×4 grid with one smaller and two larger topologies. Every capture passed the input-fidelity
gate.

| Grid | Maximum surface | Crayon portrait P95/P99/max | Crayon lost-frame share | Cross-brush result                  |
| ---- | --------------: | --------------------------: | ----------------------: | ----------------------------------- |
| 3×3  |       0.547 Mpx |              2100/2573/3337 |                  93.84% | rejected after one decisive failure |
| 4×4  |       0.308 Mpx |        15–16/22/50–62 (n=3) |        0.96–1.18% (n=3) | Magic passed at 16/19/34            |
| 4×5  |       0.246 Mpx |        15/16–17/31–36 (n=3) |        0.21–0.30% (n=3) | Magic passed at 16/20/35            |
| 5×5  |       0.197 Mpx |        15/16–17/35–44 (n=3) |        0.33–0.36% (n=3) | Magic failed at 16/19/59            |

The 4×4 crayon tail was not engine JavaScript: the slow frames carried at most 1 ms of engine work.
The 3×3 collapse and the two larger grids' improvement isolate active surface area as the causal
variable. The 5×5 Magic regression also confirms the older campaign's warning that target count is
not free. The retained 4×5 compromise lowers maximum surface area by 20% while adding four cells,
and it is the only measured topology that clears both brushes.

Landscape crayon was repeated three times on the same product build: 15/16–17/27–42 ms and
0.14–0.34% lost-frame share. Representative pen, ten-undo, Magic, and eraser controls all passed.
The one-variable experiment commits were 81a978ad784308f1f2a1adf600e7a66edc8d82ac (3×3),
553106e9f2db49ba2b31ff2f007f20b778ca9680 (5×5), and 743b0a18b2a3302bce10bea8723f13cbd5dedd03 (4×5),
all based on ce92369ffee964169f63d4b4539377de5075fd44.

## Decision

The shared `LiveSurface` used by both `DrawingCanvas` and `/dev/engine` renders a fixed 4×5 grid
from `web/src/lib/drawing/liveTiles.ts`. Each cell has:

* One normal-ink canvas.
* One bottom crayon-preview canvas using `mix-blend-mode: darken`.
* One top crayon-preview canvas using the authored color-mix opacity.

The original full-size `#drawingCanvas` remains the transparent input receiver, coordinate source,
and accessibility surface, but the renderer never paints it. The twenty cells preserve ADR-0015's
full `min(devicePixelRatio, 2)` resolution; tiling changes surface topology, not resolution.
Operations stay in paper coordinates. `tiledRenderer.ts` applies the paper-view transform to each
tile, culls dots and paths by their paper-space bounds, and renders only intersecting tiles. Its CSS
boundaries are shared and snapped to physical-device pixels even when the backing scale is capped
below device DPR, preventing independently composited neighbors from landing on fractional physical
pixels.

`tiledSurfaces.ts` owns discovery and strict adoption of the template-provided tile elements, normal
and crayon backing-store allocation, deferred hidden-tile clears, and history-base tile creation.
`tiledRenderer.ts` owns renderer/history orchestration over those surfaces. This separation keeps
surface lifecycle independent of command ordering without changing allocation timing or pixels.

Production history retains vector operations and folds its non-undoable prefix, one command at a
time, into a 4×5 offscreen raster base after 1.5 seconds without active input. Pointerdown cancels
pending compaction. Each base tile tracks whether folding has painted it; blank base tiles neither
blit nor make their matching live canvas visible during repaint. ADR-0086 replaces ordinary
vector-replay undo with cropped, tile-local pre-command patches: a pop restores only the pixels that
command changed. Twenty realistic large sweeps retain twenty undo steps within ADR-0086's six-paper
resident byte budget; still-larger retained regions remain adaptively bounded. Clear is an ordinary
full-tile snapshot command, and export composites the tiled base and retained commands into its
destination.

Brush-specific invariants are:

* Magic-brush pattern sources are cropped to the target tile. Each recorded magic operation holds
  the immutable sheet snapshot it first revealed, so a later theme or coloring-page change cannot
  recolor retained history during replay.
* Crayon preview buffers are tile-local and flush every 64 operations, preventing one long gesture
  from accumulating a compositor-sized dirty pass.
* Eraser emptiness checks scan tiles on the next animation frame rather than synchronously scanning
  one full-size surface at pointerup.
* The existing Web Audio drawing sound remains enabled. The media-element replacement was rejected;
  the original implementation passed the final tiled test.

`LiveSurface.svelte` is the renderer's single DOM contract. The product route composes paper,
coloring art, pointer halos, and fullscreen control around it; `/dev/engine` renders it bare and
composites its live tiles for pixel assertions. Missing or incomplete tile markup fails engine
initialization instead of activating a fallback renderer. Product-only composition and rotation
behavior remain real-route test concerns.

The final trusted-touch runs all passed:

| Case                                    | Contact | Moves | Commits | Starvation ms/draw s | Paint P95/P99/max ms |
| --------------------------------------- | ------: | ----: | ------: | -------------------: | -------------------: |
| Pen                                     |   6.8 s |   810 |      10 |                    0 |             16/17/34 |
| Crayon                                  |   6.8 s |   810 |      10 |                    0 |             14/24/41 |
| Magic                                   |   6.8 s |   810 |      10 |                    0 |             15/16/24 |
| Eraser on a filled surface              |   6.8 s |   810 |      10 |                    0 |             16/18/26 |
| Crayon after idle history compaction    |  27.3 s | 3,210 |      40 |                    0 |             16/27/48 |
| Magic, three repeats, Web Audio enabled |  20.5 s | 2,347 |      30 |                    0 |             15/24/35 |
| Post-extraction magic verification      |  20.5 s | 2,362 |      30 |                    0 |             16/25/32 |

## Cross-Platform Regression Decision

The tiled renderer remains the single production architecture on desktop and iPad. A platform
detection seam was considered and rejected after a current-versus-control campaign on the same Mac
showed neutral in-contact pacing and materially better between-stroke response. The small increase
in renderer bookkeeping never consumed even 0.3 ms per frame and did not move frame P95.

The control was the immediate pre-tiling commit, 2769ceae9e8cf658ebc8cbd87ec47f02cf7bdd40. Both
builds were driven by the current runner, probe, input plan, and thresholds; only the served app
changed. The Mac was an Apple M5 MacBook Pro with 32 GiB RAM and macOS 26.5.2. Headed Playwright
WebKit ran at 1512×982 CSS pixels and 2× DPR. This exercises WebKit on real Mac hardware, but it is
not Safari and does not supersede the physical-iPad results above.

The full discrete-action comparison was:

| Build / target                | Three-repeat result                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current tiled renderer, iPad  | All 46 actions passed; first-response P95 ≤29 ms, post-action P95 17 ms, post-action max ≤32 ms                                                                               |
| Current tiled renderer, Mac   | Renderer-sensitive actions passed; post-action P95 was 19 ms. Screenshot first-response P95 was 14–18 ms and coloring-page selection was 8–11 ms                              |
| Pre-tiling single canvas, Mac | Screenshot failed repeatably at 78–88 ms first response and 41–44 ms post-action max; coloring-page selection failed at 24 ms first-response P95 and 32–33 ms post-action max |

Two isolated current-build samples failed the generic gate during the first full sweep: one 65 ms
post-action interval at Magic selection and one 90 ms first response at What's New. Both passed all
ten immediate focused repeats (Magic 19 ms max; What's New 19 ms first-response P95 and 21 ms
post-action max). A second full sweep kept every renderer-sensitive action within budget and found
one 34 ms cold What's New first response; the other two samples were 9 and 13 ms, and all its
post-action intervals were at most 19 ms. This remains a non-canvas cold-mount watchpoint rather
than evidence for a second renderer. By contrast, the control's screenshot failure occurred in all
three samples and its coloring-page hard-max failure repeated.

The production-route drawing probe used the same mixed ten-stroke, ten-second synthetic input three
times per brush and build. Values are the range across those three samples:

| Brush  | Renderer      | Frame P95/max ms | Paint P95/max ms | Between-stroke lost ms | Whole-window max ms | Engine ms/frame |
| ------ | ------------- | ---------------- | ---------------- | ---------------------- | ------------------- | --------------- |
| Pen    | Single canvas | 19 / 19–24       | 17–18 / 18–23    | 0                      | 20–24               | 0.12–0.16       |
| Pen    | Tiled         | 19 / 19–24       | 17 / 18          | 0–8                    | 19–24               | 0.18–0.25       |
| Crayon | Single canvas | 19 / 19–20       | 17–18 / 18–19    | 37–89                  | 37–39               | 0.15–0.20       |
| Crayon | Tiled         | 19 / 19–20       | 18 / 18–19       | 0                      | 19–20               | 0.18–0.25       |
| Magic  | Single canvas | 19 / 19          | 16–18 / 18       | 1,162–1,344            | 495–658             | 0.09–0.10       |
| Magic  | Tiled         | 19 / 19          | 16–17 / 18       | 0                      | 19                  | 0.18–0.20       |

In-contact P95 alone would have hidden the desktop benefit: the old Magic renderer froze after
finger-up, between strokes. The tiled renderer removed that repeatable 0.5–0.7 second worst gap and
more than one second of aggregate lost presentation time per run. Crayon also improved its
between-stroke tail. Pen was frame-neutral. The outcome is therefore option A: retain and document
one tiled architecture. No renderer fork, platform sniffing, or device-specific detection is
justified by the measured cost.

## Consequences

* \+ The iPad no longer exhibits the hundreds-of-milliseconds compositor freezes, and all measured
  brush/history cases meet the frame-derived acceptance gates.
* \+ Rendering stays at 2× on the affected iPad. Stroke sharpness, exports, brush behavior, undo
  depth, and drawing sound are preserved; visual checks show no tile seams.
* \+ Undo response is frame-bounded by dirty-region restore rather than vector replay. Typical
  twenty-step patch history measured about 20 MiB; ADR-0086's 2026-08 amendment raised the resident
  budget to six papers after twenty trusted large sweeps required 99.0 MiB of patches.
* \+ The result identifies a reusable platform constraint: keep any frequently mutated WebKit canvas
  surface below the tablet-size flush cliff, even when aggregate pixels are unchanged.
* \+ The same topology is neutral or faster on the measured Mac. It removes the old Magic renderer's
  repeatable 495–658 ms between-stroke gap without changing its 19 ms frame P95, so one production
  architecture serves both targets.
* − The production stack owns 60 positioned tile canvases plus the transparent input canvas. This
  increases DOM/layer count and makes tile geometry, transforms, blend planes, and source cropping
  explicit engine concerns.
* − Tile culling and target visits added about 0.04–0.11 ms of renderer work per measured Mac frame.
  That cost remains below 0.3 ms/frame and produced no observed frame-budget regression.
* − Undo, resize, export, magic-source lifetime, and crayon buffering now have tiled code paths.
  Boundary and replay tests are required whenever a brush or paper transform changes.
* \+ The white-box harness and product route exercise the same tiled renderer, undo history, live
  surface topology, and debug contract. Harness tests no longer certify a retired architecture.
* − Playwright cannot reproduce this device compositor failure even with extreme viewport/DPR
  emulation. Shipping changes to this path still requires the trusted physical-iPad gate.

## Reproducing the Campaign

### Measurement Contract

Use the production `/` route for physical-device acceptance because it includes the complete layer
stack and product controls. `/dev/engine` shares the tiled renderer and is appropriate for white-box
correctness and synthetic profiling, but it does not reproduce the product composition. Build once
with performance marks and the dev harness enabled:

```sh
npm run perf:build
```

Start Appium 3 with its XCUITest driver, connect the iPad over USB, and keep MobileSafari in the
foreground. The complete setup, trust checks, provisioning alternatives, and failure recovery are in
`docs/PROFILING-IPAD.md`. A representative trusted-touch capture is:

```sh
npm run perf:ipad:xcuitest --ignore-scripts -- \
  --device-id=<udid> \
  --url=http://<mac-lan-ip>:4173/ \
  --brush=magic \
  --gesture-repeats=3 \
  --label=<trial-name> \
  --output=/private/tmp/<trial-name>.json
```

The command starts the preview unless `--no-serve` is supplied. Do not score a run whose fidelity
verdict fails: untrusted JavaScript events, the wrong pointer type, implausible cadence, or absent
contact geometry can all make a broken renderer appear fast. Compare only runs with the same
gesture, brush, orientation, viewport, and device state. The campaign used one change per run,
restored the prior implementation before the next, and retained only the final productized
combination.

For a cheap local preflight, use the production route with explicit viewport and DPR:

```sh
npm run perf:frames:local -- \
  --engine=webkit \
  --viewport=1366x915 \
  --device-scale-factor=2 \
  --drive
```

Also try `2049x1373@2` and `2732x1830@2` when probing a suspected size threshold. These runs did not
reproduce the iPad cliff, even at the largest size. A local failure is actionable; a local pass is
not evidence that an iPad compositor change is safe.

For a desktop architecture comparison, keep the current harness while changing only the served
build. In a detached worktree at the control commit, build and serve an instrumented bundle on a
second port. Then run from the current worktree:

```sh
npm run perf:desktop:actions -- \
  --engine=webkit \
  --headed \
  --viewport=1512x982 \
  --device-scale-factor=2 \
  --url=http://127.0.0.1:4273/ \
  --repeats=4

npm run perf:frames:local -- \
  --engine=webkit \
  --headed \
  --viewport=1512x982 \
  --device-scale-factor=2 \
  --url=http://127.0.0.1:4273/ \
  --brush=magic \
  --phases=blank \
  --contact-seconds=10 \
  --drive=mixed \
  --no-forensics
```

Repeat the commands without `--url=` for the current build. Use a fresh browser process and three
samples for each side. Compare `betweenStrokes` and `wholeWindow`, not only the in-contact `pacing`
table; the old desktop Magic regression is invisible in the latter.

### Render-Scale Cap

The rejected quality escape hatch changed `MAX_RENDER_SCALE` in `drawing/engine.ts` from 2 to 1.5.
This is the smallest prototype for determining whether total backing pixels dominate:

1. Clamp the session render scale to `min(devicePixelRatio, 1.5)`.
2. Resize every live, overlay, history, and export-dependent surface from that shared scale.
3. Rebuild before measuring; changing the constant after initialization does not resize an existing
   drawing session.

At 1.5×, each axis retains 75% of the 2× samples and the canvas retains 56.25% of its pixels. The
result was visibly softer and still lagged; starvation improved only about 30%. A re-attempt must
compare both cross-stroke sharpness and exported image dimensions. Changing only the visible canvas
creates mismatched crayon overlays and invalidates the result.

### One Full-Size Mutated Surface

Trials 01–12 established the single-surface control. The quickest reconstruction is to leave pointer
tracking and command creation unchanged, then independently gate these sites:

* Live `renderOp` calls.
* Pre-stroke snapshot capture.
* Commit/fold into the paper raster.
* Crayon paper-space accumulation.
* UI callbacks and drawing sound callbacks.

Use a separate build per gate. Do not combine removals: the diagnostic value comes from one missing
stage at a time. The useful controls were:

* Bare pointer processing: record trusted movement but create and mutate no canvas. This passed at 0
  starvation and 15/31/38 ms paint P95/P99/max.
* One visible full-size canvas with command recording disabled: this failed at 400.86 ms/s and
  153/170/187 ms.
* Command recording with visible mutation disabled: this still failed at 326.05 ms/s because other
  large surfaces remained active.

Context and CSS variants can be reconstructed at the visible canvas's `getContext` call and style:
`alpha:false`, `desynchronized:true`, `willReadFrequently:true`, `touch-action:auto`, or hiding the
presentation layer. Recreate each separately. `desynchronized` needs an Android visual check because
some WebViews present an alpha-disabled canvas as black. `willReadFrequently` moves the tradeoff
toward CPU readback and is not a generic low-latency switch. Hiding a canvas does not guarantee that
WebKit discards its pending backing-store work.

### Live-Surface Tile Counts

The decisive prototype replaced one visible full-size canvas with multiple absolutely positioned
canvas elements while retaining the same aggregate device-pixel area:

1. Keep the original full-size canvas transparent and use it only for pointer coordinates and
   accessibility.
2. Divide its backing width and height with integer boundaries: `floor(column * width / columns)`
   through `floor((column + 1) * width / columns)`.
3. Give every tile its own backing dimensions and CSS position/size.
4. Apply the paper-view transform with the tile's device-pixel origin subtracted from its
   translation.
5. Compute each tile's paper-space bounds and render an op only when its padded geometry intersects.

Two, four, sixteen, and thirty-two aggregate tiles all eliminated starvation in their prototype
runs. Eight tiles had zero starvation but missed the P99 gate at 36 ms. The retained 4×4 grid gives
margin below the apparent per-surface cliff and symmetric geometry in both orientations.

The critical gotchas are:

* Split in backing pixels, not CSS pixels; otherwise fractional DPR leaves gaps or overlaps.
* Use shared boundary calculations for neighboring tiles so every backing pixel belongs to exactly
  one tile, and snap internal CSS boundaries through device DPR when render scale is capped below
  that DPR.
* Preserve round line caps and anti-alias padding when culling; centerline-only bounds clip stroke
  edges at tile seams.
* A tile canvas's local origin differs from paper coordinates. Subtract the tile offset in the
  visible transform, but keep recorded operations in paper coordinates.
* Crayon blend planes must use the same boundaries as normal ink. A single full-size blend overlay
  silently restores the failure.
* Tile count alone is insufficient if any frequently mutated full-size source or history surface
  remains.

### Snapshot Paper Versus Vector History

Trial 14 paired the passing live tiles with the existing full-size undo paper. It restored 335.56
ms/s starvation and 249/316/342 ms paint latency. This is the minimal demonstration that an
offscreen canvas can trigger the cliff even when the visible presentation is tiled.

The first passing live-render replacement recorded each stroke group as `StrokeGroupCommand`
operations:

1. Start one command when the first pointer in a group goes down.
2. Append the same immutable ops sent to live rendering.
3. Commit the group when its last pointer finishes.
4. In the initial prototype, undo by removing the newest retained command and repainting the tiled
   base plus remaining tail.
5. Keep the newest twenty groups as the user-visible undo window.

The first vector-replay implementation preserved live drawing at 0 starvation and 15/20/29 ms paint
latency, but later direct measurement found 1,778 ms `engine.undo` P95 after twenty commands.
ADR-0086 supersedes step 4 for production undo with cropped tile-local pre-command patches. Vector
commands remain necessary for resize reconstruction, export, and idle compaction. Re-attempts must
preserve grouping: five simultaneous fingers are one undo step, a clear is undoable, and an active
stroke must survive resize/remount without being committed twice.

Pure vector retention is not bounded for long sessions. The production variant therefore folds
commands older than the twenty-step tail into a 4×5 offscreen raster base. The base uses the same
tile boundaries as live rendering. Do not replace it with one aggregate paper canvas; trial 14
already demonstrates that architecture's failure.

### Magic-Brush Sources

The first tiled magic renderer still used one full-paper `CanvasPattern` source. Although target
mutation was tiled, WebKit had to consume the giant source during every reveal. Trial 21 regressed
to 60.64 ms/s and 41/78/115 ms.

To recreate the failing control, rasterize the coloring fill or rainbow into one paper-sized canvas,
create a no-repeat pattern from that canvas for every tile, and align it with `CanvasPattern`
translation. To reconstruct the passing version:

1. Register the paper-space rectangle consumed by each target context.
2. Crop that rectangle from the current sheet into a target-sized source canvas.
3. Create and cache the no-repeat pattern by both target context and source-sheet identity.
4. Translate the pattern to the crop's paper-space origin.
5. Store the first successfully rasterized `MagicSheetSnapshot` on every recorded magic operation.

The cropped source passed at 0 starvation and 16/26/36 ms. The immutable snapshot is required for
undo and idle folding: if the current coloring page, theme, gradient, or rotation changes, replaying
against the latest sheet recolors old strokes. A WeakMap keyed only by target context is also
insufficient because it can return a pattern from the wrong historical sheet.

Pattern prewarming is permitted after the sheet rasterizes, but do not synchronously crop every
possible source during pointerdown. Prewarm the fixed tile targets or let the first op populate the
cache before the measured gesture.

### Crayon Preview and Checkpointing

Crayon needs two live compositing planes per tile:

* A bottom buffer displayed with `mix-blend-mode: darken`.
* A top mirror displayed at `1 - colorMix` opacity.

Every raw crayon op deposits opaque tooth into both tile-local buffers. A `crayonFlush` stamps and
clears the accumulated dirty bounds. Trial 23 used tile-local preview buffers but let one long
gesture accumulate indefinitely; starvation was only 8.20 ms/s, but P99/max reached 37/56 ms and
failed. Increasing to thirty-two target tiles did not cure it and worsened the maximum to 64 ms.

The retained fix emits a flush after 64 crayon path operations, as well as at semantic pass
boundaries. It passed at 0 starvation and 16/24/36 ms. To re-attempt:

1. Maintain one `CrayonPassBuffer` per normal-ink tile context.
2. Track dirty device-pixel bounds so flush and clear remain proportional to deposited ink.
3. Increment the checkpoint counter once per recorded path op, not per coalesced pointer sample.
4. Record each flush in command order so history replay preserves subtractive mixing.
5. Reset the counter on every flush, clear, cancellation, and renderer teardown.
6. Treat a checkpoint as a deposition-pass boundary: continued crayon input receives a fresh seed
   and pass tracker so the next wax layer cannot reuse the phase that was just stamped.

Do not capture one full-paper crayon raster in production; that was part of the superseded snapshot
architecture. Also do not merge checkpoints across an eraser, pen, magic op, clear, or brush switch:
foreign compositing inside an open crayon pass changes layer order and can resurrect erased wax.

### Eraser Empty Scans

The tiled eraser itself passed because `destination-out` only touches intersecting ink tiles. The
remaining hazard was deciding whether the canvas had become empty:

1. Finish and commit the eraser command without a full-surface readback.
2. On the next animation frame, run the existing downscaled empty scan independently on each normal
   ink tile.
3. Stop at the first non-empty tile.
4. Publish the reactive empty state after the scan completes.

The deferred scan passed at 0 starvation and 16/17/26 ms. A re-attempt should include both
erase-to-empty and partial-erase cases. Scanning blend-preview planes is unnecessary after the
crayon pass has been flushed, but scheduling the scan before that flush can report a false empty
canvas.

### History Compaction Scheduling

Folding the twenty-first command immediately at commit moved too much replay/raster work onto the
interaction path. Trial 40 failed at 23.46 ms/s and 20/108/200 ms.

The passing scheduler:

1. Arms a 1.5-second timer when history exceeds twenty commands.
2. Cancels the timer at pointerdown.
3. On expiry, exits if any pointer is active.
4. Folds exactly one oldest command into the tiled base.
5. Re-arms itself if more overflow remains.

This passed at 0 starvation and 16/28/49 ms; drawing crayon after compaction passed at 16/27/48 ms.
Do not fold the whole prefix in one idle callback. "Idle" means absence of active input, not merely
a queued `requestIdleCallback`: WebKit can grant idle time immediately before the child's next
touch, and a large callback is still uninterruptible. One-command chunks plus pointerdown
cancellation make the work bounded.

The base must survive component teardown and remount with the vector tail. Resizing a base requires
tile-to-tile copying or replay; resizing by first assembling one full-size intermediate recreates
the surface topology this ADR avoids.

### Callbacks and Drawing Audio

Trials 29–34 isolated non-render side effects after tiling:

* Suppressing all UI callbacks did not improve the already-passing run.
* Suppressing drawing audio did not improve it.
* Rate-limiting drawing audio passed timing but audibly reduced feedback and was rejected.
* Replacing Web Audio with `HTMLAudioElement` regressed to 272.04 ms/s and also failed trusted-input
  fidelity.
* Restoring the existing Web Audio implementation passed at 0 starvation and 15/24/35 ms.

To re-attempt an audio architecture, change only the callback invoked by an otherwise identical
gesture and retain the fidelity verdict. Media elements can involve their own process scheduling and
are not necessarily cheaper than a warmed Web Audio graph. A timing pass that removes audible events
is a product regression, not a performance win.

#### Lift-Time Teardown Amendment (2026-07)

The retained Web Audio architecture originally faded the gain over 30 audio-clock milliseconds,
scheduled `source.stop()` at the end of that fade, and disconnected the nodes from `onended`.
Physical use exposed a seconds-long tail after finger lift. The pointer path itself was not late:
the iPad recorded `pointerup` to `stopDrawSound()` in 0–1 ms.

The failure mode was the lifetime dependency. Splotch creates its `AudioContext` during idle
preload, before a media-authorizing gesture. WebKit can therefore leave the context suspended with
`currentTime === 0`; in the device automation trace, the scheduled stop remained at 0.03 and neither
`ended` nor either disconnect occurred during the next three seconds. The WebDriver touch is trusted
for pointer delivery but does not set `navigator.userActivation`, so it cannot validate audible
output. It does validate the suspended-clock case that the teardown must survive.

Keep Web Audio, but make lift-time teardown independent of audio-clock progress:

1. If the context clock is running, ramp the gain to zero over 5 ms and tear down the graph from a
   wall-clock timer after the ramp.
2. If the context is suspended or its clock has not advanced, set the gain to zero and tear down the
   graph synchronously.
3. Disconnect both nodes and call `source.stop()` without depending on an `ended` event.

Three repeated Magic strokes detached both nodes 0 / 0 / 1 ms after pointerup, with a 25 ms maximum
drawing frame. A screenshot of that drawing remained at 21 ms, and a fresh-pen Undo measured 1 ms of
engine work with a 21 ms maximum interaction frame. `drawingSound.test.ts` pins the running-clock
declick ramp, suspended-clock synchronous mute, un-timestamped stop, both disconnects, and absence
of an `ended` handler. Do not make teardown depend on audio-clock progress or an `ended` event, and
do not replace Web Audio with the already-rejected media-element path.

#### Gesture-Start Resume Amendment (2026-08)

A focused production-route campaign later found a separate suspended-context cost. On the first
Magic stroke in MobileSafari, five measured runs spent 123–127 ms in the first `engine.draw` call
and reached 135–141 ms maximum frame gaps. Suppressing the renderer did not change the stall;
suppressing the drawing-audio callback removed it. The trusted XCUITest touch delivered pointer
events without setting `navigator.userActivation`, so every move called `AudioContext.resume()`
while the context remained suspended.

`playDrawSound` now attempts to resume a suspended context once when an active gesture first
requests playback. `stopDrawSound` resets that guard for the next gesture. This preserves the
user-activation opportunity at gesture start and bounds a denied or unresolved resume attempt away
from subsequent moves without rate-limiting audible feedback.

Six measured MobileSafari Magic strokes improved from 9/20/141 ms first-frame P95, post-action P95,
and maximum to 10/18/28 ms. The matching Capacitor run improved from 8/19/38 ms to 8/18/29 ms. All
twelve final feature checks retained the selected coloring page, Magic output, settled undo state,
enabled screenshot and Undo controls, and successful page clear. Automation still cannot validate
audible output because its touch lacks user activation; a human touch remains the acceptance check
for sound presence and lift-time cutoff.

### Productization and Regression Protocol

The production reconstruction is the combination of the passing architectures, not any single
prototype:

* 4×5 full-resolution normal-ink tiles.
* Two matching crayon preview planes per tile.
* Transparent aggregate input canvas.
* Paper-coordinate vector operations with padded tile culling.
* Twenty-command normal undo tail restored from cropped dirty-region tile snapshots, byte-bounded at
  six aggregate papers per ADR-0086, plus one-at-a-time idle folding into a 4×5 raster base.
* Tile-cropped immutable magic sources.
* A 64-op crayon checkpoint.
* Deferred tile-local eraser scans.
* Existing Web Audio.

After any change to this stack:

1. Run unit tests for operation replay and source lifetime.
2. Run the real-route Playwright flows for pen, crayon, magic, eraser, undo, resize, rotation,
   export, and remount.
3. Draw a cross-tile zigzag in the running app and inspect for seams at normal and rotated layouts.
4. Run the modified interaction on the physical iPad.
5. Repeat the three-gesture magic trusted-touch case with Web Audio enabled.
6. Reject the change if the original drawing gates regress, even if its new target metric improves.
7. Run ADR-0086's normal, rotated, post-compaction, and canvas-spanning undo cases.

## Amendment (ADR-0089, 2026-07)

The aggregate `#drawingCanvas` no longer owns a full-resolution bitmap in tiled production. It is a
full-CSS-size pointer receiver with a 1×1 backing; `engine.ts` stores the backing-pixel viewport
separately and passes explicit geometry into `resizeTiledRenderer`.

Locked rotations do not resize or repaint live tiles. All 48 surfaces sit inside `.live-paper-view`,
remain in upright paper coordinates, and receive the paper's CSS contain-fit transform. This reduced
physical-iPad rotation frames from 56–57 ms to 20–31 ms. The temporary letterbox margin is
consequently non-drawable in production; a stroke must begin on the visible paper.

Hidden crayon preview surfaces are allocated lazily per touched tile instead of being resized with
every blank paper. Undo-to-empty first paints the ink tiles hidden, waits two animation frames, and
then re-adopts the viewport. The combination measured 24 ms for undo-to-empty and 30 ms for the
first five-tile crayon stroke. ADR-0089 contains the isolation table and reconstruction protocol.
