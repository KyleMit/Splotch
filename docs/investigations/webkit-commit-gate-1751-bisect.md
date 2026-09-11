# WebKit commit-gate bisect — issue 1751

The confirmed `crayon-scribbles` and `multi-finger` breaches that have failed the post-merge fast
WebKit commit gate on every merge since 56741af7e5c91a96dabbb806461bbff5f71a09ba are not a product
regression from PR 1733. They follow the browser build the gate runs on: Dependabot's
`@playwright/test` 1.62.1 → 1.63.0 bump (e2709af5a3443a2dd5ffba029a00b8c7bf47b593, merged in
a38003caa591b9efe35740f762e90ef791d85716) moved the macOS runner from Playwright WebKit r2336
(WebKit 26.5) to r2359 (WebKit 26.6), inside the same not-comparable window that hid PR 1733's first
measurement. On WebKit 26.5, PR 1733's product passes the unchanged gate; on WebKit 26.6, the
product from before PR 1733 fails it the same way current main does.

PR 1733 did introduce a measured regression, on the undo path rather than the commit path: its undo
motion cue replayed the undone command's ops through the crayon pass buffer, which raised the
crayon-scribbles undo pass on the macOS runner from a 2 ms worst undo to 1,519 ms. That is the
replay the [1750 experiments](webkit-snapshot-experiments-1750.md) attributed; this change removes
it. It does not, and cannot, make the gate green on WebKit 26.6.

## Evidence and scope

The [evidence JSON](webkit-commit-gate-1751-bisect.json) projects every run below the way the
[1717 evidence](webkit-commit-gate-1717.json) does: each initial and confirmation pass keeps every
raw commit duration, the draw and undo totals, the undo entry count and the history raster size.
Per-call measure distributions, settle traces and frame observers are omitted; the linked CI
artifacts and the local `perf-profiles/` directories retain them. Runs captured before PR 1749 carry
no `browserVersion` in their settings; their WebKit version is the one the checkout's Playwright
pins, and `tools/print-playwright-version.mjs` is what the runner's browser cache keys on.

Neither earlier investigation bisected. The [1717 investigation](webkit-commit-gate-1717.md)
compared commits after cf19b6b8936c671667b44dd8c6e8e7a3d39c0a98 with each other and attributed the
commit wait to undo-crop `drawImage` calls; the 1750 experiments compared unchanged main with itself
under diagnostic arms and attributed the undo total to the ink-motion replay. Both were measuring on
WebKit 26.6 and never saw WebKit 26.5 again, so neither could tell a product change from a browser
change.

## What CI already recorded

The post-merge diagnostics artifacts for the runs around the window separate the two scenarios
before any new measurement:

| Run                                                                                                 | Product  | WebKit | Multi-finger P95, initial / confirmation | Crayon P95, initial / confirmation | Crayon draw total, initial | Crayon undo total / max |
| --------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------: | ---------------------------------: | -------------------------: | ----------------------: |
| [fdbb0ff 2026-09-08, first runner](https://github.com/KyleMit/Splotch/actions/runs/34181443861)     | pre-1733 | 26.5   |                               97 / 32 ms |                           9 / — ms |                  52,154 ms |                7 / 1 ms |
| fdbb0ff 2026-09-08, fresh-runner retry                                                              | pre-1733 | 26.5   |                             349 / 246 ms |                          21 / — ms |                  68,811 ms |               10 / 2 ms |
| [3d06915 2026-09-09 04:29, last green](https://github.com/KyleMit/Splotch/actions/runs/34311175562) | pre-1733 | 26.5   |                                 1 / — ms |                          10 / — ms |                  49,920 ms |                5 / 2 ms |
| [c1ce4c9 (PR 1732), first runner](https://github.com/KyleMit/Splotch/actions/runs/34336768214)      | pre-1733 | 26.5   |                              194 / 48 ms |                          13 / — ms |                  42,320 ms |                4 / 1 ms |
| c1ce4c9 (PR 1732), fresh-runner retry                                                               | pre-1733 | 26.5   |                              182 / 15 ms |                          10 / — ms |                  67,891 ms |               14 / 3 ms |
| [cf19b6b, first measured red](https://github.com/KyleMit/Splotch/actions/runs/34498053518)          | 1733     | 26.6   |                              85 / 163 ms |                   3,236 / 3,924 ms |                   8,347 ms |       35,564 / 2,989 ms |

Two things in this table were already inconsistent with the "green through 3d06915, red since
56741af" framing. Multi-finger was breaching on WebKit 26.5 before PR 1733 existed: the run that
filed issue 1717 on 2026-09-08 confirmed it on both runners, and the PR 1732 control point confirmed
it on the first runner and was acquitted only by the fresh-runner retry. Its pre-1733 shape is a few
enormous outliers (643, 747, 754, 1,046 ms) over an otherwise 0–1 ms distribution. And the crayon
regression is not extra work: at 3d06915 the runner spent 50 s drawing and 0.1 s committing, at
cf19b6b it spent 8 s drawing and 35 s committing, so the same deferred raster was charged at a
different API boundary, exactly the observation the 1717 investigation made across runners.

## Method

The prompt's method assumes a quiet macOS host. This session ran in a Linux cloud container, so the
decisive A/B ran on the macOS runner the gate itself uses, via `workflow_dispatch` of
`.github/workflows/test.yml` with `gate: fast`, one arm at a time on the same branch. Each arm is a
commit whose product tree is one side of the bisect and whose dependency tree pins one browser:

* **Arm X**, 250b030922ce0ee382d0cc07bc8a1d95b85076bb: the PR 1733 merge 56741af7e5c9 plus PR 1748's
  `tools/check-bundle-budgets.mjs` and `tools/lib/build-instrumentation.mjs`, so the instrumented
  build reaches measurement. `@playwright/test` stays at 1.62.1, so the runner installs WebKit 26.5.
* **Arm Y**, b83eee4408325bdbdfa29f0540bc1e76f0ddd90e: the same base with the PR 1733 merge
  reverted, which leaves the product tree byte-identical to c1ce4c9f4041 (PR 1732, the prompt's A/B
  control point), plus the same two tool files, plus the cherry-picked Playwright bump. The runner
  installs WebKit 26.6.

Each arm was measured twice on separate runners (a dispatch and a re-run of it). The scenario
inputs, pacing, settle policy, confirmation policy and `COMMIT_GATE_MS` are unchanged; the arms
touch nothing under `tools/perf/`.

A local Linux A/B ran first, serially on explicit ports with no other builds or suites alongside, at
3d06915 and 56741af with the same two tool files and each checkout's own Playwright (WebKit 26.5,
r2336). It could not reproduce the macOS baseline: Linux WebKit charges the deferred crayon raster
at commit on both builds (crayon P95 3,265 ms before PR 1733, 3,170 ms after), so it separates
nothing on the gate metric and is reported here only for what it does separate, the undo path.

## Result: the browser build, not the product

| Arm                                                                                     | Product                 | WebKit | Multi-finger P95, initial / confirmation | Crayon P95, initial / confirmation | Crayon draw total, initial | Crayon undo total / max | Gate                          |
| --------------------------------------------------------------------------------------- | ----------------------- | ------ | ---------------------------------------: | ---------------------------------: | -------------------------: | ----------------------: | ----------------------------- |
| [X run 1](https://github.com/KyleMit/Splotch/actions/runs/34594882882)                  | PR 1733                 | 26.5   |                                 3 / — ms |                           7 / — ms |                  32,611 ms |        3,132 / 1,519 ms | pass                          |
| X run 2 (re-run)                                                                        | PR 1733                 | 26.5   |                              333 / 23 ms |                          22 / — ms |                  85,923 ms |        2,713 / 2,333 ms | pass (multi-finger acquitted) |
| [Y run 1](https://github.com/KyleMit/Splotch/actions/runs/34595338398/job/103249678084) | pre-1733 (c1ce4c9 tree) | 26.6   |                              139 / 97 ms |                   3,808 / 3,757 ms |                  10,098 ms |                2 / 1 ms | fail                          |
| [Y run 2 (re-run)](https://github.com/KyleMit/Splotch/actions/runs/34595338398)         | pre-1733 (c1ce4c9 tree) | 26.6   |                             595 / 183 ms |                         61 / 49 ms |                 105,806 ms |             113 / 15 ms | fail                          |

PR 1733's product passes the unchanged gate on WebKit 26.5 both times. Run 2 is the pre-1733 shape
exactly: multi-finger's initial pass carried two isolated outliers (1,924 and 333 ms) over a 0–2 ms
distribution and its confirmation came back at 23 ms, and crayon sat at 22 ms with an 86 s draw,
inside the 9–21 ms band the pre-1733 post-merge runs recorded. The product from before PR 1733 fails
it on WebKit 26.6 on both runs, in the two shapes main has shown since cf19b6b: one runner charged
the crayon raster at commit (10 s draw, 3.8 s commit P95), the other charged it during drawing (106
s draw, 61 ms commit P95), and both breached. Multi-finger on 26.6 is no longer a couple of outliers
but a shifted distribution: Y run 2's initial pass has twenty-one of twenty-two samples between 48
and 1,267 ms. That is the pattern every post-merge failure on main has carried, on a product tree
that predates the accused PR.

Arm Y run 1's raw artifact was discarded when its run was re-run for the confirmation sample, so its
row is transcribed from the job log and the JSON marks it `samplesUnavailable`. Download an
attempt's artifact before re-running a workflow.

The commit-side mechanism is therefore the one the 1717 investigation described, deferred canvas
rendering paid at whichever API boundary the browser build flushes it, and the thing that changed
between the last green gate and the first red one is which boundary WebKit 26.6 picks. Nothing in PR
1733's diff touches the draw or commit path: the live tiles and crayon planes are DOM canvases the
browser composites, so there is no per-frame blit the PR could have removed, and its `engine.ts`
change on that path is one `inkMotion.cancel()` at stroke start.

## What PR 1733 did regress: the undo replay

The X arm's undo column is the regression. At 3d06915 the crayon-scribbles undo pass totalled 5 ms
over 20 undos on the macOS runner; PR 1733's product on the same browser totalled 3,132 ms with a
1,519 ms worst undo. The commit is bbd51a7d882e774ce5cb0933a71de111e550a063, "Shrink removed stroke
ink and spin successful undo feedback", which introduced `web/src/lib/drawing/inkMotion.ts` and its
`undo()` call in `engine.undo()`. That function replayed every op of the undone command through
`renderOp` onto a fresh overlay canvas and then closed the crayon pass on that canvas, so each undo
re-rasterized the whole stroke through the crayon pass buffer before the animation could start.

The local Linux walk of the five PR 1733 commits, each built with the two PR 1748 tool files and run
once through the fast suite (undo totals in ms, crayon-scribbles then multi-finger):

| Commit       | Title                                                       | Crayon undo total / avg / max | Multi-finger undo total / avg / max | Crayon commit P95 |
| ------------ | ----------------------------------------------------------- | ----------------------------- | ----------------------------------- | ----------------: |
| 478c88ba8eb0 | Animate flyout arrivals from their triggers                 | 43 / 2.1 / 30 ms              | 10 / 0.9 / 1 ms                     |          3,067 ms |
| 20dc972a21bc | Roll the brush face on explicit changed menu picks          | 18 / 0.9 / 5 ms               | 9 / 0.8 / 2 ms                      |          3,214 ms |
| bbd51a7d882e | Shrink removed stroke ink and spin successful undo feedback | 980 / 49.0 / 64 ms            | 25 / 2.3 / 7 ms                     |          3,042 ms |
| 5d4a7414efe2 | Pull a drawing snapshot toward the trash on clear           | 1,000 / 50.0 / 61 ms          | 28 / 2.5 / 6 ms                     |          3,025 ms |
| bb21685a68c5 | Cascade drawer controls on explicit opening                 | 1,077 / 53.9 / 91 ms          | 29 / 2.6 / 8 ms                     |          3,262 ms |

The undo total moves at bbd51a7d882e and nowhere else. The first two commits sit at the pre-1733
level, the two after it inherit the replay. Commit P95 is the Linux host's saturated deferred-raster
flush on every commit, unchanged across the walk, which is the same non-separation the pre/post arms
showed.

Profiling builds now bracket the ghost as `engine.undoInkMotion` beside `engine.undoPatchCapture`
and `engine.undoPatchCrop`, so the next investigation reads the split instead of bracketing the
function by hand as the 1750 experiments had to.

## The change

`inkMotion.undo()` no longer replays crayon or magic ink. For a command that carries either
(`strokeGhostReadsTiles`), it paints the command's footprint (each ink op at its padded width, the
same AA bleed the renderer's dirty rects carry) onto a mask canvas, composites the visible live
tiles onto the overlay through the tile painter the clear cue already used, and applies the mask
once with `destination-in`. Once the engine has applied the undo and the tiles hold the paper
without the command, `subtractRemainingInk()` paints the tiles onto the ghost again with
`destination-out`, so older ink inside the footprint (a yellow stroke the undone blue crossed) stays
pinned on the paper instead of shrinking with the ghost; the revision reviewed on PR 1771 skipped
that pass and visibly dragged crossing ink along. The ghost is therefore the pixels the command
owned, the cost is one path stroke plus two bounded sets of tile blits, and the crayon pipeline
never sees the overlay canvas. `engine.undoInkMotion` brackets both phases, so a tile-read undo
contributes two entries to that measure. A plain pen command keeps the replay: it is exact, it costs
a few milliseconds at most per undo on every browser measured here, and a five-finger drag's
footprint covers most of the paper, where the tile copy is the dearer path. The pixels under the
ghost, undo/redo, retained depth and the byte budget are untouched: the change reads the tiles and
writes nothing but the overlay.

The first revision read the tiles for every command. Its macOS dispatch
([run 34597294730](https://github.com/KyleMit/Splotch/actions/runs/34597294730), de8799b875a3)
measured `engine.undoInkMotion` at 873 ms over the eleven multi-finger undos (160 ms worst) against
under 1 ms per undo for the replay on current main, because each undo allocated two paper-sized
canvases and stroked a ~2,400-segment footprint across them. That revision is retained in the JSON
as `*-tileghost-all-*` and is why pen commands went back to the replay.

Local Linux A/B, WebKit 26.6, two runs per arm, serial on explicit ports:

| Arm                | Crayon undo total / avg / max | Multi-finger undo total / avg / max | Crayon commit P95, initial / confirmation |
| ------------------ | ----------------------------: | ----------------------------------: | ----------------------------------------: |
| main d213010 run 1 |            943 / 47.2 / 63 ms |                     20 / 1.8 / 4 ms |                          3,169 / 3,257 ms |
| main d213010 run 2 |         1,116 / 55.8 / 144 ms |                     23 / 2.1 / 4 ms |                          2,950 / 3,020 ms |
| this change run 1  |             151 / 7.5 / 11 ms |                     22 / 2.0 / 4 ms |                          3,075 / 3,202 ms |
| this change run 2  |             180 / 9.0 / 23 ms |                     22 / 2.0 / 3 ms |                          3,288 / 3,117 ms |
| with subtraction   |              122 / 6.1 / 8 ms |                     21 / 1.9 / 4 ms |                          3,115 / 2,930 ms |

Crayon undo drops by an order of magnitude, multi-finger undo is at parity, and the commit path is
unchanged, as it must be, because nothing on it changed. The subtraction pass added after review
(one run, `local-fix-subtract-run1` in the JSON) costs nothing measurable: its crayon undo pass is
122 ms total with an 8 ms worst step, and `engine.undoInkMotion` sums to 116 ms over its forty
entries.

On the macOS runner the gate uses (WebKit 26.6):

| Run                                                                  | Head         | Multi-finger P95, initial / confirmation | Crayon P95, initial / confirmation | Crayon draw total, initial | Crayon undo total / max (ghost total / max) | Multi-finger undo total / max (ghost total / max) | Gate |
| -------------------------------------------------------------------- | ------------ | ---------------------------------------: | ---------------------------------: | -------------------------: | ------------------------------------------: | ------------------------------------------------: | ---- |
| [run 1](https://github.com/KyleMit/Splotch/actions/runs/34598675267) | e49f25996e31 |                              132 / 99 ms |                         67 / 60 ms |                 120,240 ms |                   315 / 29 ms (246 / 26 ms) |                           387 / 48 ms (13 / 2 ms) | fail |
| [run 2](https://github.com/KyleMit/Splotch/actions/runs/34599430905) | d8123cb8d2f2 |                             102 / 173 ms |                   3,088 / 3,092 ms |                   7,719 ms |         2,035 / 2,001 ms (2,032 / 2,001 ms) |                              12 / 2 ms (8 / 1 ms) | fail |
| current main cf19b6b (post-merge)                                    | cf19b6b8936c |                              85 / 163 ms |                   3,236 / 3,924 ms |                   8,347 ms |                           35,564 / 2,989 ms |                                          9 / 2 ms | fail |
| pre-1733 on the same browser (arm Y run 2)                           | b83eee440832 |                             595 / 183 ms |                         61 / 49 ms |                 105,806 ms |                                 113 / 15 ms |                                       319 / 43 ms | fail |

The gate fails on this branch exactly as it fails on the pre-1733 product and on current main, and
for the same reason: the commit distributions are the browser build's. The two runs also landed on
one runner of each charging mode, which is worth reading separately.

Run 1 charged the crayon raster during drawing (120 s draw, 67 ms commit P95). There the
crayon-scribbles undo pass drops from 35.6 s with a 2,989 ms worst undo on current main to 315 ms
with a 29 ms worst, and the ghost itself (`engine.undoInkMotion`) is 26 ms at worst.

Run 2 charged it at commit (7.7 s draw, 3,088 ms commit P95), the mode cf19b6b's first runner was
in. There the pass totals 2,035 ms (3,515 ms in confirmation), and the whole of it is one undo: the
first ghost read of the live tiles after the burst pays the last stroke's still-pending raster,
2,001 ms initially and 3,373 ms in confirmation, and the other nineteen undos cost about 1 ms each.
The commit crop forces the raster of every stroke but the last, whose own raster stays deferred
until something reads its tiles. Current main paid about 1.8 s on every one of the twenty undos in
this mode (35.6 s total at cf19b6b), so the change removes nineteen of the twenty waits and leaves
the one that belongs to the browser's deferred raster. That residual is real and named here; it is
the same deferred work the 1717 investigation measured at the commit boundary, surfacing at the
first read.

Multi-finger undo matches the pre-1733 product on this browser in both modes (run 1: 387 ms total
with the pen ghost at 2 ms worst; run 2: 12 ms total with the ghost at 1 ms worst; arm Y's 319–366
ms pass on the draw-charged runner is WebKit 26.6's own patch-restore cost with no ghost at all).

## Disposition

* The gate breach is a browser-build effect and this change does not turn it green. The raw 25 ms
  contract, scenario definitions, settle and confirmation policy and `tools/perf/lib/` are
  untouched, and no product change short of the open-ended renderer work the 1750 issue scopes can
  move a 3.8 s deferred raster flush under 25 ms on WebKit 26.6.
* Whether the gate should measure on WebKit 26.6 at all, pin Playwright's WebKit for the gate job,
  or re-baseline against the physical iPad (which the 1750 diagnostics measured at a 1 ms commit
  maximum on iPadOS 26.5) is a gate-semantics decision that ships as its own stack.
* Issue 1750's undo attribution is resolved by this change; its commit-side scope is reduced to the
  browser-build finding above and remains open.
* [ADR-0140](../adrs/0140-commit-gate-host-control-and-breach-confirmation.md) carries a 2026-09
  amendment recording that the confirmed breaches were bisected to the browser build.
