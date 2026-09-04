# ADR-0086: Restore Tiled Dirty-Region Snapshots for Frame-Bounded Undo

**Status:** Active — amends [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) for production
undo; amended by [ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md) for tile visibility
snapshots; amended in 2026-08 to preserve the advertised twenty-step depth for measured large
sweeps. **Date:** 2026-07

## Context

ADR-0085 eliminated iPad live-render starvation by replacing every frequently mutated full-size
canvas with a 4×4 tile grid. Its first production undo implementation retained vector commands and
repainted the tiled base plus every surviving command after a pop. That kept the drawing interaction
fast, but moved the same unbounded replay cost to the Undo button.

The trusted physical-iPad baseline made the failure visible and causal. After twenty pen commands,
ten serial UI undo actions measured:

* `engine.undo` 1,483 ms P50, 1,778 ms P95/max.
* Action-to-next-frame 1,483 ms P50, 1,780 ms P95/max.
* Individual engine times declined with remaining history depth: 1,778, 1,711, 1,648, 1,575, 1,522,
  1,483, 1,420, 1,380, 1,138, and 905 ms.
* Live drawing still had zero starvation, 16/24/44 ms paint P95/P99/max, and at most 2 ms
  `engine.draw`. Undo replay, not input or live rendering, was the bottleneck.

Undo has a separate 60 Hz response contract:

* `engine.undo` P95 ≤20 ms, leaving time in one 16.7 ms presentation interval for surrounding UI
  work while allowing timer quantization.
* Action-to-next-frame P95 ≤33 ms.
* Action-to-next-frame max ≤50 ms.

Every undo change must also retain ADR-0085's live-drawing gates: zero render starvation in the
authoritative case, paint P95 ≤20 ms, P99 ≤33 ms, and no ≥67 ms four-frame freeze. Local Playwright
is authoritative for pixel correctness, depth, resize, and memory invariants; trusted XCUITest input
on the physical iPad is authoritative for response time.

Seventeen serial captures isolated and then hardened the fix:

| #  | Strategy / validation                                      | Engine P50/P95/max ms | Next-frame P50/P95/max ms |     Retained patches | Live paint P95/P99/max ms | Result                                       |
| -- | ---------------------------------------------------------- | --------------------: | ------------------------: | -------------------: | ------------------------: | -------------------------------------------- |
| 01 | Full vector replay on all 16 tiles                         |        1483/1778/1778 |            1483/1780/1780 |                    — |                  16/24/44 | Fail                                         |
| 02 | Skip the post-undo empty scan                              |        1256/1481/1481 |            1450/3053/3053 |                    — |                  16/28/42 | Fail; replay still dominates                 |
| 03 | Replay only tiles touched by the popped command            |         542/1052/1052 |             543/1053/1053 |                    — |                  16/25/44 | Fail                                         |
| 04 | Pop without repaint                                        |                 3/3/3 |                   4/12/12 |                    — |                  16/32/50 | Diagnostic pass; visually wrong              |
| 05 | Restore full pre-command copies of touched tiles           |                 4/6/6 |                   6/11/11 |       Up to ~400 MiB |                  16/30/47 | Timing pass; memory rejected                 |
| 06 | Crop touched-tile copies to command dirty bounds at commit |                 3/4/4 |                   5/13/13 |             19.5 MiB |                  17/29/50 | Pass; retained                               |
| 07 | Dirty patches, crayon                                      |                 3/4/4 |                   5/11/11 |             19.5 MiB |                  16/31/52 | Undo pass; repeat required for 52 ms outlier |
| 08 | Dirty patches, magic                                       |                 3/4/4 |                   5/12/12 |             19.6 MiB |                  16/20/33 | Pass                                         |
| 09 | Dirty patches, eraser                                      |                 3/4/4 |                   5/12/12 |             18.4 MiB |                  16/22/35 | Pass                                         |
| 10 | Rotate; fall back when patch tile dimensions differ        |        1098/5652/5652 |            1098/5666/5666 |             19.5 MiB |                  16/21/32 | Fail                                         |
| 11 | Rebuild patches during the existing resize replay          |              20/32/32 |                  21/33/33 |             13.0 MiB |                  16/21/29 | Fail engine gate; empty scan exposed         |
| 12 | Use captured empty state after ordinary undo               |                 0/1/1 |                         — |             13.1 MiB |                  15/20/28 | Invalid: global rAF stream was suspended     |
| 13 | Score each action with its own rAF                         |                 0/1/1 |               5/2682/2682 |             13.1 MiB |                  15/20/24 | Invalid: first click preceded visual settle  |
| 14 | Wait for two post-rotation frames, then score              |                 0/1/1 |                   5/15/15 |             13.1 MiB |                  16/19/28 | Pass; retained harness contract              |
| 15 | Thirty commands, fully compacted, twenty deep undos        |                 0/1/1 |                   5/12/13 | 19.6 + 18.3 MiB base |                  15/22/35 | Pass                                         |
| 16 | Final crayon repeat                                        |                 0/1/1 |                   5/13/13 |             19.7 MiB |                  16/32/47 | Pass                                         |
| 17 | Three-paper byte budget, normal twenty-step history        |                 0/0/0 |                   3/10/10 |             19.6 MiB |                  16/30/51 | Pass; retained                               |

Trials 12 and 13 changed the measurement contract rather than the product architecture. They remain
in the table because they explain two important false conclusions: a missing next-frame sample is
not a zero-millisecond paint, and Appium can execute JavaScript while MobileSafari is still visually
suspended by an orientation transition.

The later full-app interaction sweep exposed a separate clear-action stall in the same architecture.
A one-tile pen drawing still captured and cleared all sixteen attached normal-ink surfaces. Three
physical-iPad runs measured 75–83 ms maximum frame gaps. Serial isolation retained the one-tile undo
snapshot, then changed only the pixel mutation:

| Clear strategy                                     | Frame P95 ms | Max gap ms | Result                                         |
| -------------------------------------------------- | -----------: | ---------: | ---------------------------------------------- |
| Capture and clear all sixteen live tiles           |           17 |      75–83 | Fail                                           |
| Capture and synchronously clear visible tiles only |           17 |      30–34 | Major improvement; one run missed the max gate |
| Hide the visible tile without clearing its backing |           17 |         28 | Diagnostic pass; stale backing is invalid      |
| Hide immediately; clear after two presented frames |           17 |      23–28 | Pass; retained                                 |

The clear gesture's 725–731 ms “ready observed” time includes the drag and page-turn choreography.
It is not synchronous clear work. The scored frame stream starts at trusted pointerdown and covers
the full gesture plus deferred wipe, so the retained result cannot hide a delayed long frame.

A later cross-target sweep exposed the other half of the same boundary. A stroke spanning four
visible tiles made clear create four full-tile undo snapshots in the pointerup task. The physical
iPad reached a 56 ms maximum gap and the iPad web simulator reached 37 ms. Removing clear snapshots
entirely proved that capture owned the simulator tail, but made clear undo fall back to vector
replay and was rejected. The retained implementation captures at most one visible tile per presented
frame and promotes the clear-preview opacity layer before the gesture begins:

| Target / strategy                                   | First-frame P95 ms | Frame P95 ms | Max gap ms | Result                         |
| --------------------------------------------------- | -----------------: | -----------: | ---------: | ------------------------------ |
| Physical iPad native, synchronous snapshots         |                  7 |           17 |         56 | Fail                           |
| iPad web simulator, synchronous snapshots           |                  3 |           17 |         37 | Fail                           |
| iPad web simulator, no clear snapshots              |                  4 |           17 |         32 | Diagnostic only; undo rejected |
| Physical iPad native, progressive snapshots (10×)   |                  6 |           17 |         22 | Pass; retained                 |
| Physical iPad web, progressive snapshots (5×)       |                 13 |           17 |         21 | Pass                           |
| iPad web simulator, progressive snapshots (10×)     |                  3 |           17 |         32 | Pass                           |
| Android native emulator, progressive snapshots (5×) |               15.3 |         16.7 |       16.8 | Pass                           |
| Mac WebKit, progressive snapshots (5×)              |                 15 |           19 |         31 | Pass                           |

## Decision

Production tiled undo restores pre-command dirty-region patches. Vector commands remain, but undo
does not replay them in the ordinary path.

`web/src/lib/drawing/tiledRenderer.ts` implements the following lifecycle:

1. `beginTiledCommand` captures whether the canvas was empty before the stroke group.
2. Before a command first mutates a live tile, the renderer copies that tile once. Every subsequent
   op unions its transformed, anti-alias-padded device bounds into the command's dirty rectangle.
3. At commit, the temporary full-tile copies are cropped to those dirty rectangles. The retained
   stack maps command → tile index → cropped pre-command raster.
4. Undo pops one command and restores only its patches with `clearRect` plus `drawImage`, under an
   identity transform. LIFO ordering guarantees every pixel outside those regions is already the
   pre-command value.
5. Ordinary undo publishes the popped command's captured `wasEmpty` state. A tile scan remains only
   when another pointer is actively drawing and the captured pre-command state cannot describe the
   composite result. With an active pointer, undo takes the replay path and rebuilds that active
   command's pre-state after removing the popped history command; patch restore alone could erase
   overlapping in-flight pixels or make the removed command reappear on the next undo.
6. Clear targets only visible normal-ink tiles, because hidden tiles contain no presented committed
   pixels. It hides affected normal and crayon layers immediately, then captures at most one full
   pre-clear tile per `requestAnimationFrame`. Each captured backing clears after two further
   presented frames. A tile reused before its scheduled capture snapshots the pre-clear pixels,
   clears synchronously, and only then captures the new command's blank pre-state. Immediate undo
   restores completed patches and simply unhides still-preserved pending backings; either route
   cancels the deferred wipe. Resize resolves pending captures before changing tile geometry, while
   repaint and detach discard the pending schedule. Export snapshots include visible tiles only, so
   a hidden stale backing can never leak into a save. Clear remains one undoable command. If another
   pointer is still drawing, clear discards that active command's old patches so its continued
   segment captures the cleared paper, not the pixels clear removed.

Patch coordinates are local to the current tile backing stores. Resize or rotation can change tile
dimensions, and an asynchronous magic sheet can change what an earlier command should reveal without
changing geometry. Every existing full vector repaint therefore deletes the old undo rasters and
reconstructs the undoable tail in one chronological pass: capture the pre-command tiles, replay that
command, crop, then advance. An in-flight command is rebuilt last but remains full-tile until its
single commit-time crop; cropping it during a repaint would make later input expand bounds around an
already-cropped source. Patch cropping is also idempotent as a structural guard. Subsequent undo
returns to patch restore. The accepted physical rotation measured 45 ms of `engine.resize`; Appium's
separate system orientation transition suspended rAF for 2,736 ms, which is recorded but not
attributed to `engine.resize` or undo.

Resident patches use an adaptive byte budget:

* Normal history still caps at `MAX_UNDO_DEPTH = 20`.
* Retained patch bytes may consume at most six aggregate normal-ink papers
  (`TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE = 6`).
* At least the newest two commands remain undoable.
* When canvas-spanning commands exceed the byte budget, the oldest undo steps lose their patches and
  therefore leave the undo window. Their vector commands remain visible and fold into the tiled
  history base one at a time after 1.5 seconds idle.
* The system shortens undo depth instead of encoding patches. WebKit's `canvas.toBlob` work was
  previously measured on the interaction path, and decoding a cold entry would violate the
  frame-bounded undo contract. Drawing responsiveness wins over worst-case undo depth.

`scripts/perf/undo-action-stats.mjs` owns the undo thresholds and statistics.
`scripts/perf/ipad-xcuitest.mjs` can:

* request serial UI undo actions with `--undo-count`;
* pause between them with `--undo-pause-ms`;
* allow idle history folding with `--history-settle-ms`;
* rotate before undo with `--rotate-before-undo`;
* evict old service workers and CacheStorage before every run;
* expose read-only debug seams from a `PERF_MARKS` build; and
* measure the first action-local `requestAnimationFrame`, rather than inferring it only from a
  global probe stream.

## Consequences

* \+ Normal and worst retained-depth undo become proportional to changed pixels, not command count
  or historical op volume. The final normal run measured 0 ms engine P95 and 10 ms next-frame P95.
* \+ All four brushes, post-rotation undo, and twenty deep undos after tiled-base compaction pass
  the physical-iPad response gates.
* \+ Clear improved from the original 75–83 ms maximum frame gaps to 23–28 ms, then kept a later
  four-tile case to 22 ms on physical iPad and 32 ms on the iPad web simulator by spreading undo
  capture across frames. Output scale, undo behavior, and visual quality remain intact.
* \+ Live drawing remains full-resolution and starve-free. No brush, audio, visual quality, or
  normal twenty-step depth was removed.
* \+ Typical twenty-step patch history is about 20 MiB on the target iPad. Fully compacted history
  measured 20.6 MB of patches plus a 19.2 MB tiled base.
* \+ Worst-case resident undo memory is bounded by bytes. Large marks lose old undo steps rather
  than risking memory pressure, cold decode lag, or live-render degradation.
* − Undo patch correctness depends on every brush's transformed dirty bounds containing all pixels
  it mutates. A new glow, filter, jitter radius, or op kind must widen `opPaddedUserBounds` and its
  tests in the same change.
* − The first mutation of a tile temporarily copies the full tile; commit crops it. This keeps
  retained memory small but can transiently allocate up to one aggregate paper for a canvas-spanning
  command.
* − Full repaints reconstruct patches through vector replay. They are off the ordinary drawing and
  undo paths, but their work scales with the undoable tail; resize must retain `engine.resize`
  instrumentation.
* − A pathological sequence whose patches exceed six aggregate papers can still shorten below twenty
  undo steps, but never below the newest two. This is a deliberate product tradeoff in favor of
  bounded memory, drawing, and undo responsiveness.
* \+ `/dev/engine` exposes this tiled history through the same `HistoryDebug` contract used by
  production profiling. Product-route tests still own integration with the real controls and layer
  composition.

## Re-attempting the Architectures

### Authoritative Measurement

Build an instrumented production route, start Appium/XCUITest, and drive the real Undo button:

```sh
npm run perf:build

npm run perf:ipad:xcuitest --ignore-scripts -- \
  --device-id=<udid> \
  --url=http://<mac-lan-ip>:4173/ \
  --gesture-repeats=2 \
  --undo-count=10 \
  --label=<trial-name> \
  --output=/private/tmp/<trial-name>.json
```

Use `--brush=crayon|magic|eraser` for brush coverage. Use `--gesture-repeats=3
--history-settle-ms=17000 --undo-count=20` to reproduce the fully compacted depth test. Use
`--rotate-before-undo` for the dimension-change path.

Do not score a run unless trusted-input fidelity passes. Do not reuse an old MobileSafari bundle:
the runner unregisters service workers, clears CacheStorage, and reloads a cache-busted URL for this
reason. `PUBLIC_ENABLE_DEV_HARNESS` is not a reliable client-side signal on the prerendered home
route under every preview adapter; the read-only seams therefore also compile into `PERF_MARKS`
builds and dead-code-eliminate from release builds.

Each undo action must own its next-frame measurement. Orientation can leave the global probe's rAF
loop suspended while WebDriver JavaScript still executes. For a rotated test, first wait until the
new viewport dimensions appear, then await two rAF callbacks, and only then click Undo. Record the
visual-settle wait separately from `engine.resize`, `engine.undo`, and action-to-next-frame.

### Full Vector Replay

The baseline is the smallest reconstruction: pop the newest `StrokeGroupCommand`, clear every live
tile, draw the tiled base, then replay every surviving command through `renderTiledOp`. Preserve
tile clipping and magic/crayon setup or the comparison changes more than undo.

This produces the identifying history-depth curve: early undos are slowest and each later action
gets cheaper. If time is flat instead, look for a fixed readback, decode, or UI wait rather than
replay. Keep the `engine.undo` mark around the whole synchronous operation; measuring only the
history pop hides the work.

### Empty-Scan Isolation

Replace the post-undo `scanTiledRendererIsEmpty` result with the popped command's `wasEmpty` value.
That isolates the downscaled readback across sixteen tiles. It reduced replay baseline P95 from
1,778 to 1,481 ms, proving the scan mattered but was not causal.

The production optimization is safe only without active pointers. When another finger is drawing,
the restored history plus that active stroke may have a different empty state, so retain the scan
for that case. Do not reuse this shortcut for eraser pointerup; an eraser command's *post-command*
emptiness is not its pre-command `wasEmpty` value.

### Replay Only Touched Tiles

Use the popped command's padded op bounds to choose tiles, clear only those, redraw the tiled base
into them, and replay every surviving command only into that subset. This reached 1,052 ms P95.

The gotcha is historical overlap: a surviving command whose own bounds do not intersect the popped
command still needs no repaint, but every surviving command that does intersect must be replayed in
order. Replaying only the popped command's inverse is not generally defined for alpha blending,
eraser compositing, crayon mixing, or magic patterns.

### No-Repaint Diagnostic

Pop history, update button state, and deliberately leave the pixels alone. This produced 3 ms engine
P95 and 12 ms next-frame P95, proving essentially all remaining time was visual reconstruction.

This trial is never shippable: Undo becomes a history mutation with no visible result. Keep it as a
short-lived diagnostic only and back it out before correctness or memory tests.

### Full Touched-Tile Snapshots

Before the first mutation of every touched tile, copy the entire tile into an offscreen canvas. Undo
restores those copies. This was the decisive timing proof at 6 ms engine P95.

Do not retain this version. A command touching all sixteen tiles costs one aggregate paper, about 20
MiB on the measured iPad; twenty such entries approach 400 MiB before the history base, live ink,
and crayon planes. It is useful because it separates “restore rather than replay” from dirty-bound
math. Clear should be part of this control because it necessarily touches every tile.

### Cropped Dirty-Region Snapshots

The accepted implementation still takes the full touched-tile copy at first mutation, because later
ops can expand the dirty union after earlier ops have already changed pixels. At commit:

1. Transform `opPaddedUserBounds` through the tile context's current matrix.
2. Clamp to tile-local device pixels and floor/ceil the edges.
3. Union every op's bounds into the command's per-tile dirty rectangle.
4. Copy only that rectangle from the pre-command tile snapshot into a new cropped canvas.
5. Replace the temporary full copy with the crop.

Capturing only the first op's rectangle is incorrect for a long stroke. Capturing newly expanded
strips after drawing has begun can also be wrong where the expansion overlaps pixels mutated by an
earlier op. The full transient copy followed by one crop keeps the pre-command source immutable.

`crayonFlush` contributes no new dirty area; its deposited pixels are contained by the preceding
crayon geometry. A visible tile captured for `clear`, and other non-geometric full-surface ops,
captures the full tile. Geometry culling and snapshot bounds must use the same anti-alias padding.

### Frame-Bound Clear

Reconstruct the baseline by capturing every live tile for the clear command and broadcasting a
`clear` op across all sixteen tile contexts. Score the trusted drag-to-clear gesture from
pointerdown through at least one second after pointerup; the costly canvas flush appears near the
commit at the end of the drag, not at pointerdown.

To separate snapshot cost from backing-store mutation:

1. First capture only tiles whose normal-ink canvas is visible, but still clear those backings
   synchronously. The measured one-tile drawing should fall near 30–34 ms.
2. Keep the same snapshot and hide the tile without clearing its backing. A result near 28 ms
   identifies the remaining attached-surface wipe, but this version is not shippable.
3. Productize the diagnostic by marking the hidden tile dirty and clearing it after two
   `requestAnimationFrame` callbacks. If a new op reaches the tile first, clear before rendering
   that op. If undo restores it first, cancel the pending wipe by clearing the dirty marker.
4. Exercise more than one visible tile. If all undo copies still occur at pointerup, the four-tile
   case reproduces the later 37–56 ms regression even though the one-tile case passes. As a
   diagnostic, remove only the clear-command patch capture; a passing result attributes the tail to
   snapshots but is not shippable because undo can return to unbounded replay.
5. Queue one visible-tile snapshot per `requestAnimationFrame`. Preserve the hidden backing until
   its copy exists, then use the existing deferred wipe. Promote only the clear-preview opacity
   layer; promoting the confirmation ripple does not cover the early drag-preview composition gap.

An open crayon pass is a second presentation plane even when the normal tile is hidden. Treat a
dirty crayon buffer as affected by clear, hide both preview canvases immediately, and invalidate the
same backing. Otherwise a second finger can draw after the clear drag begins and leave wax visible
when the gesture commits. Unit coverage must exercise clear, immediate undo, reuse before the
deferred callback, one-snapshot-per-frame pacing, resize during pending capture, crayon-buffer
reuse, and visible-only export capture.

Do not infer clear completion from the Undo button: clear itself is undoable. The production action
probe waits for Screenshot to become disabled, while the frame gate—not that readiness
observation—scores responsiveness.

### Repaint, Resize, and Rotation Reconstruction

A patch stores tile-local pixels and the tile dimensions it was captured from. After a backing-store
resize, do not stretch old patches and do not let every later undo fall back to replay. Rebuild on
every existing full repaint, not just dimension changes: an asynchronously decoded magic sheet can
change the correct pre-command pixels while tile sizes stay constant.

During the repaint already required by resize:

1. Clear and seed live tiles from the tiled history base.
2. Identify the undoable tail; older non-undoable vector commands replay without snapshots.
3. For each undoable command in chronological order, capture its pre-command tiles under the new
   geometry, replay it, and crop its dirty union.
4. Rebuild an active command last if rotation occurred mid-stroke.
5. Re-apply the byte budget.

Trial 11 deliberately retained the tile scan after this rebuild and landed at 32 ms engine P95.
Removing the ordinary scan produced 1 ms engine P95. A resize correctness test must draw at least
two commands, resize the real route, undo once to leave ink, then undo again to reach blank.

A clear that lands while another pointer remains down is a related boundary. Capture the clear
command first, render clear without charging that mutation to the active stroke, delete the active
stroke's pre-clear patches, and let its next segment capture the cleared paper. Otherwise undoing
the straddling stroke can resurrect pixels the clear removed.

### Adaptive Memory Bound

Compute patch cost as the retained cropped canvases' `width × height × 4`, not their encoded file
size and not tile count. Walk newest to oldest. Keep at most twenty entries while their total stays
within six aggregate paper rasters, never keeping fewer than two.

When the next older entry would exceed the budget:

1. Delete that command's patch map and decrement the user-visible undo count.
2. Keep its vector command in chronological history so its pixels remain visible.
3. Let the existing one-command-at-a-time idle scheduler fold it into the tiled base.
4. Never rebuild patches for that non-undoable prefix during resize.

An idle fold validates that paper geometry exists before removing the prefix command from vector
history. Layout transitions can temporarily make that geometry unavailable; the command stays queued
and the scheduler retries instead of dropping ink that the oldest retained patch depends on.

The production regressions cover both sides of the adaptive contract. Twenty realistic large sweeps
must retain all twenty advertised steps under the six-paper budget, and a separate sequence of
deliberately pathological strokes must stay within that budget while reducing depth no lower than
two. Both invoke every offered undo; the pathological case also requires the older non-undoable
drawing to remain visible. Start synthetic strokes away from safe-area edge bands; otherwise the
edge-swipe guard can discard the gesture and make the memory test look artificially cheap.

Encoding old patches is the main revisitable alternative. Re-attempt it only with physical WebKit
measurements for both the `toBlob` demotion and the first cold decode. A memory win that moves
compression onto commit or makes deep undo miss 33 ms is rejected by this ADR.

### Final Regression Matrix

Before shipping a change to this architecture:

1. Run real-route Playwright flows for normal undo, clear during an active stroke, erase-to-empty,
   magic source lifetime, crayon byte exactness, resize, remount, twenty-step compaction, and the
   adaptive memory bound.
2. Confirm pen, crayon, magic, and eraser each pass physical undo.
3. Run twenty deep undos after the history base has fully compacted.
4. Rotate, wait for the visually interactive state, and run at least ten undos.
5. Re-check ADR-0085's live drawing metrics in every physical capture.
6. Reject a change that improves undo by lowering render scale, disabling a brush/audio feature, or
   reintroducing a frequently mutated full-size canvas.

## Amendment (2026-08): Preserve Twenty Steps for Realistic Large Sweeps

### Context

The original three-paper budget deliberately allowed canvas-spanning commands to reduce effective
depth to two or three. Settings simultaneously advertised “Undo now goes back 20 steps.” The
adaptive test established a memory ceiling but did not establish whether the reduced depth occurred
under realistic child input.

Issue 695 measured two separate trusted-touch cohorts on a physical iPad13,8 running iPadOS 26.5.
Each cohort began from blank paper, drew exactly twenty commands through XCUITest on the production
route, recorded `getUndoDebug()`, and then invoked every offered undo until `aria-disabled` reported
the history boundary:

| Three-paper baseline                                      | Retained depth | Patch bytes | Pending commands |
| --------------------------------------------------------- | -------------: | ----------: | ---------------: |
| Twenty zigzag sweeps crossing most of the paper           |             10 |  51,595,632 |                0 |
| Twenty short marks distributed across the paper (control) |             20 |   4,990,880 |                0 |

The aggregate paper was 17,763,392 bytes, so the baseline budget was 53,290,176 bytes. Every
retained undo completed in 0–1 ms, proving response time was healthy but the product promise was
not: a realistic large-stroke session lost half of its advertised depth.

Changing the copy to “up to 20 steps” or removing a fixed number would accurately describe the
three-paper behavior but make the feature less predictable. Compression was also rejected for this
fix: the existing WebKit evidence shows that encoding on commit or decoding on deep undo can violate
the frame-bounded interaction contract. The chosen alternative is the smallest whole-paper budget
that fits the measured twenty-command workload.

### Decision

`TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE` is six. `MAX_UNDO_DEPTH` and Settings release note remain
twenty. The same trusted-touch sweep on the final code retained all twenty commands with 103,859,876
patch bytes under the 106,580,352-byte budget; the small-stroke control again retained twenty with
4,990,880 patch bytes. All forty final undos completed in 0–1 ms and both cohorts ended at zero
snapshots with `aria-disabled=true`.

The contract is executable in two layers:

* `flows-tile-history.spec.ts` draws twenty large sweeps at the measured iPad viewport, requires
  `MAX_UNDO_DEPTH` snapshots within the six-paper ceiling, invokes all twenty undos, and requires
  blank paper plus the exhausted Undo state.
* `undoDepthContract.test.ts` reads the generated release source and requires its advertised number
  to equal `MAX_UNDO_DEPTH`.

The two-command floor remains a safety valve for inputs whose retained dirty rectangles exceed six
aggregate papers. It is not permission to calibrate the budget below the measured large-sweep
contract. Any future budget reduction must rerun the physical twenty-large/twenty-small protocol and
update the user-facing promise in the same change if twenty realistic sweeps no longer fit.

### Consequences

* \+ Realistic large sweeping input and small marks both deliver the twenty steps Settings
  advertises.
* \+ Patch restore remains frame-bounded; the change adds resident capacity without adding encode or
  decode work.
* \+ Cross-file and production-route tests prevent the copy, depth cap, and measured budget behavior
  from drifting independently.
* − The maximum patch allowance doubles from 50.8 MiB to 101.6 MiB on the measured paper. The final
  large-stroke cohort used 99.0 MiB of patches; live paper plus retained patches measured 116.0 MiB.
* − Retaining twenty commands doubles the longest undoable tail replayed with undo-patch capture
  after resize or remount. The fast performance suite measures commit latency, not this replay cost.
* − Truly full-paper commands can still exhaust six papers before twenty entries. Supporting every
  possible twenty-command sequence would require a twenty-paper worst-case allowance and was
  rejected as disproportionate memory pressure.

## Amendment (2026-08): Omit Patches for a Blank Pre-Command State

### Context

After the drawing-audio stall was removed, the first Magic stroke on blank paper still produced a
repeatable 37–39 ms frame when it crossed into additional tiles. The frame coincided with allocating
the command's pre-mutation tile canvases. Those snapshots contained only transparent pixels because
`beginTiledCommand` had already recorded `wasEmpty = true`.

Suppressing undo capture for the blank command removed the tail. The result does not weaken undo
semantics: `wasEmpty` is the authoritative pre-command state. A blank state can follow a retained
clear command, so the rule is based on the captured state rather than assuming the command is first
in history. It cannot use the existing no-patch replay path, because replaying an older drawing and
its later clear would reintroduce the unbounded ordinary undo work this ADR rejected.

### Decision

`renderTiledOpForCommand` does not capture tile patches when the active command's `wasEmpty` value
is true. The command and its undo count remain in history. Undo hides the command's presented normal
and crayon tiles immediately and marks the normal backings for lazy cleanup. It does not batch that
cleanup in later frames or replay surviving history. A later stroke clears only each tile it reaches
immediately before reuse. Clear's pending or completed patches remain available, so the next Undo
can still restore an earlier drawing. Non-blank commands retain cropped dirty-region patches and
ordinary patch restore.

Unit coverage requires the first blank-paper command to retain zero patch bytes, remain undoable,
and undo back to hidden blank tiles without synchronously clearing all tile backings. It also pins
draw → clear → draw → undo to the same no-replay path, then requires the next Undo to restore the
pre-clear drawing. On the physical iPad, the combined audio and blank-patch change kept the six-run
Magic interaction at 10/18/28 ms in MobileSafari and 8/18/29 ms in Capacitor for first-frame P95,
post-action P95, and maximum respectively. A separate six-run Capacitor Undo sweep measured 7/17/18
ms on the same final build.

### Consequences

* \+ A first blank-paper stroke avoids allocating transparent tile snapshots on the drawing path.
* \+ The Undo control and captured empty-state semantics are unchanged.
* \− Hidden backings retain stale pixels until reuse or another lifecycle operation clears or
  reallocates them. Export and empty-state scans exclude hidden tiles, a new stroke clears each
  reached tile before painting, and undo of any earlier command clears each stale backing before
  restoring its retained patch so leftover pixels cannot be composited back into view.

## Amendment (2026-08-13): the release-note layer of the contract is dropped

The Decision above made the depth contract executable in two layers. The second one,
`undoDepthContract.test.ts`, required the newest entry in `web/src/lib/releases.json` to advertise
`MAX_UNDO_DEPTH` in prose. It is deleted.

Release notes record what a version shipped; they are not a standing promise the engine owes. Since
the sentence lives in the release that raised the cap and is never repeated, the test re-pointed
itself at each new release and failed on the first one that did not mention undo — v1.5.0, three
days after the test landed. Restating the constant in whichever release is newest is not a product
contract, and changing the cap does not require appending to the changelog.

`flows-tile-history.spec.ts` remains the executable contract: it imports `MAX_UNDO_DEPTH` and
requires the engine to retain and replay exactly that many commands within the patch budget. The
"update the user-facing promise in the same change" clause above stays an editorial judgment for
whoever reduces the budget, not a gate any test enforces.
