# ADR-0087: Keep iPad Theme Changes Frame-Bound by Retiring Idle Canvas Layers

**Status:** Active — amends [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) and
[ADR-0086](0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md). **Date:** 2026-07 The
alpha-native follow-up is implemented by [ADR-0091](0091-alpha-overlays-and-worker-magic-sheets.md).
[ADR-0121](0121-recode-retained-magic-ink-with-coloring-appearance.md) later reverses this record's
immutable settled-magic rule so page and theme changes deliberately recode existing magic ink.

## Context

The tiled renderer made drawing and undo responsive on the physical iPad, but changing the Settings
theme still froze the screen for about a second. A trusted MobileSafari dark-to-light baseline took
1–2 ms to update `data-theme`, then missed animation frames for 978–1,214 ms. The event handler and
Svelte update were not slow; WebKit was flushing work caused by the theme-dependent coloring assets
and the drawing compositor stack after JavaScript returned.

Theme changes use the same generic interaction gate as other non-drawing actions: a frame gap above
33.5 ms is a long frame. The drawing and undo contracts from ADR-0085 and ADR-0086 remain
independent, stricter gates and must pass after any theme optimization.

Twenty-two serial isolations identified two independent costs. “Max gap” is the largest
`requestAnimationFrame` interval after the theme click on the same physical iPad and full-resolution
2× paper. Each architecture was applied alone and backed out before the next unless marked retained.
Ranges combine repeated runs; approximate values are called out explicitly where the isolation was
used only to locate the one-second tier.

| #  | Isolated strategy                                             | Max gap ms | Change from ~1,100 ms | Result                                      |
| -- | ------------------------------------------------------------- | ---------: | --------------------: | ------------------------------------------- |
| 01 | Production baseline                                           |  978–1,214 |                     — | Fail                                        |
| 02 | Hide only the line-art overlay                                |     ~1,100 |                    ~0 | Fail; overlay was not the dominant work     |
| 03 | Hide the canvas stack                                         |     ~1,100 |                    ~0 | Fail                                        |
| 04 | Hide every drawing and paper presentation layer               |     ~1,100 |                    ~0 | Fail                                        |
| 05 | Hide or close Settings during the mutation                    |     ~1,100 |                    ~0 | Fail                                        |
| 06 | Remove theme-color metadata and all CSS transitions           |     ~1,100 |                    ~0 | Fail                                        |
| 07 | Click the already-selected theme (no state change)            |       9–26 |       about −1,080 ms | Diagnostic pass                             |
| 08 | Set `data-theme` directly without app asset effects           |      35–46 |       about −1,060 ms | Located the async asset path                |
| 09 | Prevent the new magic-fill image from resolving               |      19–28 |       about −1,080 ms | Located the dominant asset                  |
| 10 | Prevent only the line-art sibling from resolving              |     ~1,100 |                    ~0 | Fail; magic fill still dominated            |
| 11 | Keep magic decode but skip its tiled-history repaint          |    167–182 |         about −930 ms | Major improvement, still a fail             |
| 12 | Also skip magic-sheet letterbox edge extension                |      41–46 |       about −1,060 ms | Timing pass; visually incomplete            |
| 13 | Extend edges directly from source-image strips and corners    |      42–48 |       about −1,055 ms | Correctness pass; retained                  |
| 14 | Rasterize the sheet at source-image resolution                |      42–48 |                    ~0 | No improvement; backed out                  |
| 15 | Preload and cache theme images                                |      42–48 |                    ~0 | No improvement; backed out                  |
| 16 | Cache completed sheet snapshots                               |      42–48 |                    ~0 | No improvement; backed out                  |
| 17 | Disconnect the magic sheet after the direct-source change     |      43–47 |                    ~0 | Proved the remaining work was presentation  |
| 18 | Hide all drawing presentation layers after the sheet fix      |      19–20 |                −24 ms | Diagnostic pass                             |
| 19 | Hide only the canvas stack after the sheet fix                |      26–28 |                −17 ms | Located idle canvas composition             |
| 20 | Hide only the 32 idle crayon preview canvases                 |      35–36 |                 −9 ms | Partial pass                                |
| 21 | Hide every empty live tile; show only tiles containing pixels |      29–31 |                −15 ms | Retained                                    |
| 22 | Keep two decoded line-art siblings mounted and toggle opacity |      30–31 |                  0 ms | Rejected: extra layer, no meaningful margin |

The first bottleneck was not image decode alone. The magic fill was initially drawn into a
2,564×1,868 sheet, then `drawImage` copied thin strips from that destination canvas back into itself
and stretched them over the letterbox margins. The JavaScript calls returned in 0 ms, but WebKit
later paid for a full-size source readback/re-upload. Skipping the history repaint removed most of
the second, while skipping the self-copy removed the remaining hundred-millisecond tier.

The residual 40–50 ms was the cost of applying theme-dependent filters and blend modes while WebKit
kept 48 transparent tile canvases in the presentation tree: sixteen normal-ink tiles and two
sixteen-tile crayon preview planes. Hiding only the preview planes helped. Hiding every empty plane
and retaining only tiles with pixels brought repeated empty-paper runs to 28–31 ms. With five
real-ink tiles visible and a recorded magic operation, repeated runs measured 32–33 ms max and 9 ms
frame P95.

Keeping both theme-specific line-art images resident eliminated a cold swap outlier but stabilized
at the same 30–31 ms as the simpler decoded-sibling gate. It consumed another full-page decoded
image and compositor layer, so it was not retained. Generating alpha-native line-art assets could
remove the remaining `filter` plus `mix-blend-mode` cost. ADR-0091 later implemented that option
when coloring-page selection showed the residual cost could independently cross the frame gate.

## Decision

Theme-dependent canvas work follows four constraints.

First, `magicBrush.ts` extends a contain-fitted fill by sampling the original `HTMLImageElement`.
`edgeMargins` returns source-image strips for the four sides plus explicit corners. It must never
sample the completed full-size sheet as a `drawImage` source; destination self-copy triggers
WebKit's expensive surface flush even when each sampled strip is one pixel wide.

Second, the retained implementation at this decision's date repainted the tiled renderer only while
recorded or active magic operations lacked an immutable `magicSheet` snapshot. Settled operations
did not replay merely because the current theme's source finished decoding.
[ADR-0121](0121-recode-retained-magic-ink-with-coloring-appearance.md) replaces this constraint: a
new coloring appearance deliberately rebinds and replays retained magic operations.

Third, an empty tile is absent from the compositor:

* All normal and crayon tile elements start with `hidden`.
* A normal tile becomes visible immediately before an intersecting non-crayon operation paints it.
* A crayon preview plane is visible only while its pass buffer is dirty. Flush hides both preview
  planes and shows only normal tiles whose buffers actually flushed.
* Clear and resize hide all corresponding tile canvases.
* Undo snapshots capture and restore the normal tile's `hidden` state together with its dirty pixel
  patch. Undoing the first mark therefore retires that tile again instead of leaving a transparent
  layer resident.

Fourth, `DrawingCanvas.svelte` gates overlay replacement by composition, not theme URL. A different
page or orientation clears the displayed overlay until the newly registered art decodes. An
outline/chalk sibling of the same page keeps the current image visible until its decoded replacement
is ready. This avoids both a blank flash and two permanently resident full-page overlays.

The retained physical-device results were:

| Case                                      | Max gap ms | Frame P95 ms |
| ----------------------------------------- | ---------: | -----------: |
| Theme, empty paper, ten repeated switches |      28–31 |            9 |
| Theme, five visible ink tiles             |      32–33 |            9 |
| Theme, settled magic history              |         33 |            9 |
| Trusted pen regression                    |         20 |           10 |
| Trusted magic regression                  |         30 |           10 |
| Trusted crayon regression                 |         37 |            9 |
| Undo regression, engine / first frame     |      1 / 3 |            9 |

Crayon's 37 ms maximum matches ADR-0085's prior physical-device profile and remains below its 50 ms
maximum gate; its P95 remains within one refresh. Theme's 33 ms measurement is at the 33.5 ms
long-frame boundary with millisecond timer quantization, rather than the prior one-second freeze.

## Consequences

* \+ Theme changes no longer repaint settled drawing history or force a full-size canvas self-copy.
  The physical iPad improved from 978–1,214 ms to 28–33 ms without reducing render scale.
* \+ Idle tile topology now scales with the drawing's occupied regions rather than the renderer's
  maximum 48 canvas elements.
* \+ Pen, crayon, magic, undo, line-art registration, and 2× output quality remain unchanged.
* \+ Tile visibility is part of undo correctness and has unit coverage alongside pixel patches.
* − Every new tiled operation must define when it creates visible pixels. A future full-surface op
  cannot merely call `renderOp`; it must maintain tile visibility too.
* − `hidden` is correctness state, not cosmetic markup. Resize, clear, repaint, crayon flush, and
  undo must keep it synchronized with tile pixels.
* − Five occupied tiles add about 3–4 ms to a theme switch compared with a blank paper. ADR-0091
  later removed the full-page line-art blend/filter work; occupied tile cost remains independent.
* − Physical MobileSafari remains authoritative. Playwright WebKit can catch logic and large local
  regressions but does not reproduce this iPad compositor's costs.

## Re-attempting the Architectures

### Authoritative Theme Measurement

Use the production `/` route from a `PERF_MARKS` build, select a wide coloring page, open Settings,
and measure dark-to-light separately from setup:

1. Set dark theme and wait for the themed overlay and magic fill to decode.
2. Wait at least two animation frames so dialog animation is not attributed to the click.
3. Start a `requestAnimationFrame` loop recording `{ at, gap }`.
4. Click the Light option through the same trusted or WebDriver UI path a parent uses.
5. Record the first 250 ms as the interaction window. Keep a longer tail only to identify delayed
   asset work.
6. Repeat at least ten times. Report the distribution of each trial's maximum interaction gap and
   the pooled frame P95.

Measure three states: empty paper, several pen/crayon tiles occupied, and a settled magic stroke.
Afterward, run ADR-0085's trusted strokes and ADR-0086's undo action. Under this decision's original
contract, a theme win that repainted, flattened, hid, or recolored existing strokes was invalid.
ADR-0121 requires recoloring, so its retained replay and page-undo behavior must pass alongside the
same frame gates.

### Magic Repaint Isolation

The smallest causal gate is the magic host's decode callback. Temporarily make its repaint a no-op,
leaving image load and sheet rasterization intact. A large improvement means history replay or tile
mutation is dominant. Do not ship the no-op without checking unresolved magic operations: a child
can start a magic stroke before the fill decodes, and that history requires one repaint when the
sheet becomes available.

The original production gate asserted that an unresolved operation repainted once, while a theme
switch after settlement did not repaint or recolor it. ADR-0121 supersedes the second half: both
unresolved and settled operations adopt the published appearance, and the settled case must also
preserve page-change undo.

### Letterbox Edge Extension

Instrument `CanvasRenderingContext2D.drawImage` and log target size, source type, source size, and
call duration. A call returning in 0 ms does not prove it is cheap; score subsequent frame gaps.

The rejected version draws the fitted image, then calls `drawImage(sheetCanvas, ...)` for edge
strips. Reconstruct it by sampling top/bottom rows followed by full-height left/right columns from
the destination sheet. The timing cliff appears after JavaScript returns.

The retained version samples the original image:

1. Convert the destination inset to source coordinates using `bw / sourceWidth` and
   `bh / sourceHeight`.
2. Stretch a one-destination-pixel-equivalent source row into top and bottom bands.
3. Stretch corresponding source columns into left and right bands.
4. Draw four source pixels into the four corner rectangles when both axes are inset.

Test equal-aspect, horizontal-letterbox, vertical-letterbox, and doubly inset geometry. Preserve the
inward sample offset so a border outline does not smear across a margin.

### Idle Tile Visibility

Temporarily apply `display:none` to these groups one at a time:

1. All drawing and paper layers.
2. `.canvas-stack`.
3. The 32 crayon preview canvases.
4. All 48 live tile canvases.

If only the final two materially change timing, the cost is layer count rather than Svelte, dialog,
or theme-token work. Do not hide the transparent full-size `#drawingCanvas`; it is the pointer and
accessibility surface.

When productizing visibility, show a tile before drawing so its first pixels are not delayed a
frame. For crayon, inspect `dirty` before flush because the flush operation is broadcast across all
tiles; showing every tile for every flush recreates all sixteen normal layers. Capture `hidden`
before the first mutation in the same undo snapshot that captures pixels.

### Overlay Alternatives

The accepted composition-key gate strips thumbnail and presentation suffixes, including
`.overlay.webp` and `.dark.overlay.webp`, from the URL. A page or orientation change has a different
key and uses the existing hide-until-decode behavior. A theme sibling has the same key and leaves
the old image visible until decode.

The rejected dual-layer experiment appended both decoded siblings, kept both at full paper size, and
toggled opacity from a `data-theme` observer. It measured 30–31 ms, indistinguishable from the
retained version, while adding decoded memory and a potential compositor layer.

ADR-0091 and `tools/asset-gen/docs/alpha-line-art-overlays.md` implement the alpha-native option:
transparent black pen art for light mode, transparent white chalk art for dark mode, source-over
export composition, and a catalog-wide 4/255 reconstructed-channel guard.
