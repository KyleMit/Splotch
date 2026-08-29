# gpu-crayon — capture the GPU crayon viability spike

Runs the `/dev/gpu-crayon` harness end to end and writes the evidence a cutover decision needs: one
screenshot per renderer of the same reference scene, a magnified detail crop of the tooth, and the
per-frame timings.

## Why this exists

Splotch's crayon is a pigment simulation on the CPU — a deterministic paper-tooth field, two density
passes, and a subtractive glaze, all through `CanvasPattern` fills
(`web/src/lib/drawing/crayonBrush.ts`, ADR-0065/0146/0147/0148). The spike asks whether the same wax
can come off a GPU instead, and which stroke-geometry algorithm should carry it. It is a viability
probe, not a replacement: nothing here is wired into the production engine.

The three GPU options share one wax model and differ only in how a fragment's coverage is decided:

| id       | algorithm                                                                          |
| -------- | ---------------------------------------------------------------------------------- |
| `cpu`    | the shipping pipeline, drawn through the real `renderOp` — the baseline            |
| `stamp`  | arclength-resampled stamped tip, one instanced quad each (Procreate/Photoshop)     |
| `ciallo` | closed-form integral of a quadratic tip along the polyline (Ciallo, SIGGRAPH 2024) |
| `sdf`    | one instanced capsule quad per segment, distance measured in the fragment          |

## Entry point

```
npm run dev            # or any server with PUBLIC_ENABLE_DEV_HARNESS=true
node tools/gpu-crayon/capture.mjs --url=http://localhost:5231
```

`--url` defaults to `http://localhost:5231` and must point at a **dev-harness-enabled** build;
`/dev/*` is gated by `requireDevHarness()` and the route 404s otherwise.

## Outputs

Everything lands in `tools/gpu-crayon/output/` (gitignored):

* `<id>.png` — the full reference scene at 1120×780
* `<id>-detail.png` — the tooth crop at 3× nearest-neighbour zoom
* `<id>.webp`, `<id>-detail.webp` — inlineable siblings for a contact sheet
* `results.json` — GPU/JS/frame-interval percentiles, draw calls, primitive counts, and the renderer
  string the numbers were taken on

## Prerequisites and failure behaviour

Playwright and `sharp` (both `devDependencies`). The script **launches headed on purpose**: headless
Chromium falls back to SwiftShader, which draws the scene correctly and times it meaninglessly. It
throws if the harness reports a WebGL or shader error, and prints any page console errors after the
run rather than failing on them.

## Reading the numbers

**A Mac is `desktop-advisory`.** These timings rank the algorithms against each other; they approve
nothing. Per ADR-0085, the iPad's surface-flush cliff does not reproduce at any desktop viewport,
DPR, or CPU throttle, so the question this spike exists to answer can only be closed on a physical
device.

One asymmetry to keep in mind when reading `results.json`: the `cpu` row's `gpuMs` is zero because
it issues no WebGL commands, and its 2D raster/flush cost lands outside every clock the page can
read. That is not the CPU pipeline looking fast — it is the same blind spot ADR-0085 measured
around, where `engine.draw` stayed under 2 ms while the device lost 417 ms per drawing-second.
