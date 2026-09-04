# ADR-0015: Capped-DPR Canvas Rendering (min(devicePixelRatio, 2))

**Status:** Active — amended by ADR-0066 and
[ADR-0088](0088-frame-bound-screenshot-export-on-ipad-webkit.md). The capped live scale and 2×
export floor stand unchanged; the memory and export architectures evolved around them. See the
amendments at the end. **Date:** 2026-06

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

Render the canvas backing store at `renderScale = min(devicePixelRatio, 2)`, fixed for the session
at `initDrawingCanvas()` (`src/lib/drawing/engine.ts`).

How the factor propagates — most surfaces inherit it for free:

* **Backing store:** `resizeCanvas()` sets `canvas.width/height = rect × renderScale`, and the undo
  baseline's `squareSide` scales the same way.
* **Pointer input:** adapts automatically — `rectScaleX/Y` is computed as `canvas.width /
  rect.width`, so `pointerToCanvas()` needs no change.
* **Undo baseline + command-log replay:** inherit automatically — the baseline is sized off
  `canvas.width/height` and replayed ops are in backing-store coordinates (ADR-0033/0034).
* **Stroke widths:** authored in CSS pixels (`strokeWidth.svelte.ts` levels); `startDrawing()`
  multiplies the resolved line width (including the eraser multiplier) by `renderScale` once, and
  the dot radius derives from it.
* **Empty scan:** scan dimensions divide by `renderScale` so the CPU readback loop stays the same
  size regardless of DPR.
* **Export:** `exportCanvasBlob` composes in CSS-pixel coordinates at `exportScale =
  max(devicePixelRatio, 2)`; the paper texture and overlay keep their on-screen proportions while
  the now-high-res strokes pass through with minimal resampling.

Non-obvious invariants:

* **`renderScale` is fixed per session.** A mid-session DPR change (desktop browser zoom, dragging
  between monitors) is *not* tracked: handling it would require rescaling the backing store and the
  undo baseline in place. Reload picks up the new DPR.
* **The Playwright engine specs assume `renderScale = 1`.** They read pixels at pointer coordinates
  (`pixelAt`), which only maps 1:1 because Playwright's default `deviceScaleFactor` is 1 (noted in
  the `/dev/engine` harness). Specs that set a custom `deviceScaleFactor` would need coordinate
  scaling.

## Consequences

* **+** Strokes rasterize at native (or 2×) resolution — crisp on virtually every device users own.
* **+** Exports contain real stroke detail instead of interpolated blur; the AI image upload also
  sends a sharper source.
* **+** Rollback is trivial if on-device profiling shows regressions: `MAX_RENDER_SCALE` is a single
  constant (set it to 1).
* **-** 4× the pixels on every surface. This *was* dominated by the undo stack (10 full-canvas
  snapshots, ADR-0004): roughly ~44 MB on a typical phone and up to ~160 MB on a 10″ tablet, versus
  a quarter of that at 1×. **Superseded by ADR-0033 + ADR-0034:** undo now keeps a single baseline
  raster plus a tiny command log, and the virtual canvas is gone, so the remaining 4× cost is just
  the live backing store + the baseline (two surfaces, not twelve).
* **-** 4× fill rate per stroke segment. The per-stroke full-canvas copies (snapshot, virtual-canvas
  sync) that also paid this multiplier are **both removed** — by ADR-0033 (no snapshot) and ADR-0034
  (no virtual-canvas sync). The live fill rate was expected to be absorbed by the GPU
  post-perf-work, but **not yet verified on a real device** — the `chrome://inspect` profiling
  workflow in the mobile guide (`docs/MOBILE/android.md`) is the follow-up.
* **-** Mid-session DPR changes render at the stale scale until reload.

## Amendment (ADR-0066, 2026-07)

ADR-0066 replaced command-replay undo with snapshot undo, which changes what the 4× pixel factor
multiplies — the cap itself, the propagation rules, and the per-session invariants are untouched:

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
* The fill-rate consequence's "per-stroke full-canvas copies are **both removed**" is
  half-reinstated: each commit again pays one full-canvas `drawImage` at pointerup (the snapshot
  copy) — deliberate, once per commit rather than per gesture start, and it is ADR-0066's open
  on-device perf gate.

## Amendment (ADR-0088, 2026-07)

The Decision's export scale remains `max(devicePixelRatio, 2)`, but export no longer interpolates
from a lower-resolution live backing store. When live and export scales are both 2×, the engine
transfers the tiled renderer's settled 2× pixels and composes the only full page inside a worker.
When a live cap makes the scales differ, export falls back to vector replay directly at the full
export scale. The live 1.5× cap and saved 2× quality therefore remain independent.
