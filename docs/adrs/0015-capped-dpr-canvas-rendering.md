# ADR-0015: Capped-DPR Canvas Rendering

**Status:** Active — the cap was amended from 2× to 1.5× after the 2026-07 real-screen iPad
compositing bisect; amended by ADR-0066 (2026-07): the memory math below derives from the replay-era
"baseline + tiny command log"; under snapshot undo the scale factor multiplies the paper raster +
tiered snapshot stack instead. See the amendments at the end. **Date:** 2026-06

## Context

The drawing canvas's backing store was sized in CSS pixels (`canvas.width = rect.width`).
Essentially every target device has a `devicePixelRatio` of 2–3, so the compositor upscaled every
stroke and edges rendered visibly soft. The blur was also baked into exports: `exportCanvasBlob`
composed at 2× but was interpolating already-low-res source pixels, so saved/shared PNGs could never
contain real stroke detail. For an app whose entire output is strokes, this was a quality ceiling on
the core product.

Three options were considered:

* **Keep 1× rendering.** Zero perf/memory risk, but a permanent, visible quality defect on-screen
  and in exports, on every real device.
* **Render at full `devicePixelRatio`.** Maximum sharpness, but a DPR-3 panel costs **9×** the
  pixels of 1× — for detail beyond what a finger-drawn stroke can use — and multiplies the undo
  stack's memory by the same factor.
* **Render at `min(devicePixelRatio, 2)`.** Takes the bulk of the sharpness win at 4× pixel cost
  instead of 9×. The standard tradeoff for canvas drawing apps.

This decision was deliberately sequenced **after** two engine perf changes that removed per-segment
costs the scale factor would have multiplied: the `willReadFrequently` removal from the main context
(per-stroke readbacks) and the virtual-canvas de-mirroring (full-canvas copy per pointermove → one
copy per stroke end). With those landed, the per-frame hot path is pure GPU stroking and scales
cheaply.

## Decision

Render the canvas backing store at `renderScale = min(devicePixelRatio, 1.5)`, fixed for the session
at `initDrawingCanvas()` (`src/lib/drawing/engine.ts`). The original decision used a 2× cap; the
physical-device amendment below lowered it after measuring that fill-rate cost on the real screen.

How the factor propagates — most surfaces inherit it for free:

* **Backing store:** `resizeCanvas()` sets `canvas.width/height = rect × renderScale`, and the undo
  baseline's `squareSide` scales the same way.
* **Pointer input:** adapts automatically — `rectScaleX/Y` is computed as
  `canvas.width / rect.width`, so `pointerToCanvas()` needs no change.
* **Undo baseline + command-log replay:** inherit automatically — the baseline is sized off
  `canvas.width/height` and replayed ops are in backing-store coordinates (ADR-0033/0034).
* **Stroke widths:** authored in CSS pixels (`strokeWidth.svelte.ts` levels); `startDrawing()`
  multiplies the resolved line width (including the eraser multiplier) by `renderScale` once, and
  the dot radius derives from it.
* **Empty scan:** scan dimensions divide by `renderScale` so the CPU readback loop stays the same
  size regardless of DPR.
* **Export:** `exportCanvasBlob` composes in CSS-pixel coordinates at
  `exportScale = max(devicePixelRatio, 2)`; the paper texture and overlay keep their on-screen
  proportions while the now-high-res strokes pass through with minimal resampling.

Non-obvious invariants:

* **`renderScale` is fixed per session.** A mid-session DPR change (desktop browser zoom, dragging
  between monitors) is *not* tracked: handling it would require rescaling the backing store and the
  undo baseline in place. Reload picks up the new DPR.
* **The Playwright engine specs assume `renderScale = 1`.** They read pixels at pointer coordinates
  (`pixelAt`), which only maps 1:1 because Playwright's default `deviceScaleFactor` is 1 (noted in
  the `/dev/engine` harness). Specs that set a custom `deviceScaleFactor` would need coordinate
  scaling.

## Consequences

* **+** Strokes rasterize above CSS resolution on high-DPR screens, retaining supersampled edges.
* **+** Exports contain real stroke detail instead of interpolated blur; the AI image upload also
  sends a sharper source.
* **+** Rollback is trivial if on-device profiling shows regressions: `MAX_RENDER_SCALE` is a single
  constant (set it to 1).
* **-** 2.25× the pixels and fill rate of CSS-pixel rendering on DPR-2+ screens. The live canvas,
  paper raster, and resident undo patches all pay that multiplier; ADR-0066 and ADR-0082 bound the
  undo tier by bytes.
* **-** Physical-device verification still measures more continuous compositing than the 1×
  diagnostic floor. The 1.5× cap deliberately spends some frame budget to retain supersampling.
* **-** Mid-session DPR changes render at the stale scale until reload.

## Amendment (ADR-0066, 2026-07)

ADR-0066 replaced command-replay undo with snapshot undo. At the time, that changed what the
original 2× cap's 4× pixel factor multiplied; the later physical-device amendment changes the cap
without changing these propagation rules or per-session invariants:

* The Decision's "undo baseline + command-log replay" surface is now the **paper raster + snapshot
  stack**: the paper's square side scales with `renderScale` the same way, snapshots inherit it by
  copying the paper, and ops (retained per stroke only for the commit fold and the
  magic-pending/in-flight repaint) are still recorded in backing-store coordinates.
* The memory consequence's "live backing store + the baseline (two surfaces, not twelve)" is now the
  live backing store + the paper + the resident snapshot tier, with anything past it as
  single-digit-MB lossless blobs — a managed budget inside ADR-0066's device-gated ≲ 150 MB, so more
  than two surfaces but nothing like the naïve twenty.
  [ADR-0082](0082-resident-snapshot-tier-byte-budget.md) (2026-07) resized that tier: it was a fixed
  two hot rasters, and is now a byte budget of three times the paper, so this bound roughly triples
  — up to ~85 MiB of patches on the 2732² raster rather than two ~30 MB snapshots. Measured on
  device at 28–60 MiB, still inside the gate. The encode that the old count bought was costing a
  WebKit commit its entire frame budget, which is what forced the change.
* Each commit again pays a paper-patch `drawImage` readback at pointerup — deliberate, once per
  commit rather than per gesture start. The physical-device amendment below measures its effect
  separately from continuous compositing.

## Amendment (real-screen iPad compositing bisect, 2026-07)

The 2× cap does not survive real-screen verification. On an iPad13,8 running iPadOS 26.5, hand-drawn
Safari Web Inspector Timeline recordings attributed the visible lag to compositing after the
engine's marked work returned:

| build                                           | long composites / commit | composite ms / drawing second |
| ----------------------------------------------- | -----------------------: | ----------------------------: |
| 2× baseline                                     |                     1.00 |                         543.7 |
| 2×, no snapshot capture                         |                     0.15 |                         395.9 |
| 2×, no snapshot capture, optional layers hidden |                     0.17 |                         464.1 |
| 1× diagnostic                                   |                     0.02 |                         171.4 |
| 1.5× production candidate                       |                     0.13 |                         422.6 |

Removing the always-mounted crayon, line-art, paper, and pointer-halo layers did not lower the
continuous cost and felt worse to the operator. Quartering the backing-store area nearly eliminated
long composites and felt substantially smoother. The cost is therefore proportional to canvas pixel
area, not to those optional compositing layers.

Set `MAX_RENDER_SCALE = 1.5`, so the shipped backing stores use 2.25 pixels per CSS pixel instead of
4 on DPR-2+ displays — **43.75% fewer pixels** while retaining supersampling. The 1× rung remains a
diagnostic floor rather than the product setting because it gives up the sharpness and export-detail
benefit that motivated this ADR. Exports keep their independent `exportScale`, so saved images still
compose at `max(devicePixelRatio, 2)`.

The final 1.5× production build was verified on the same device with snapshot capture enabled. It
recorded 2 long composites across 16 commits, versus 15 across 15 commits for the 2× baseline.

This amendment closes the original decision's unverified fill-rate consequence with physical-device
evidence. It also reduces the area of every paper and snapshot patch readback by the same ratio,
helping the separate per-commit cost attributed to undo snapshot capture.
