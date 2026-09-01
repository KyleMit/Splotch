# ADR-0153: Reject a WebGL crayon renderer — measured as additive complexity, not a deletion

**Status:** Active **Date:** 2026-08

## Context

The crayon deposition work (ADR-0146, ADR-0147, ADR-0148) left three per-runtime deposition
pipelines and an engine where the crayon is the most expensive brush. A GPU port promised to
collapse that: the 2026-08-29 `spike/gpu-crayon` session built three working WebGL2 crayon
architectures — stamped quads, an SDF stroke shader, and a Ciallo-style arclength-integral shader —
and initially recommended a cutover retiring roughly 5,700 lines of the 8,978-line engine, since
`gl.MIN` blending reproduces the crayon's subtractive glaze natively (at mix = 1 the glaze collapses
to `min(S, D)`, which removes `crayonPassBuffer.ts` and all three per-runtime deposition pipelines).

The alternatives were therefore real and implemented, not hypothetical: keep the shipping 2D-canvas
crayon, or port deposition to one of three measured WebGL architectures.

## Decision

**Keep the CPU 2D-canvas crayon. Do not ship a WebGL renderer.** The spike's own measurements
reversed its recommendation, for two independent reasons.

**GPU cost tracks the render target's attachment area, not the drawn work — so the port does not
remove the cost that matters.** An ablation series at iPad scale timed the full shader (tooth fetch

* shade + bands), a constant-colour variant, and a write-white-only variant at 0.899 / 0.897 / 0.896
  ms — indistinguishable — while an area sweep with drawn work held constant scaled linearly with
  pixel count (0.171 ms at 1120×780 → 0.898 ms at 2733×1903, 5.95× the pixels). A scissor rectangle
  bought exactly zero (0.899 → 0.899 ms, pixel-identical output): a scissor is a per-fragment test
  and does not shrink the pass's attachment. This is the same conclusion ADR-0085 reached for the 2D
  canvas, arrived at independently for a different underlying mechanism — surface area, not stroke
  work, is the cost driver on both architectures, so changing architectures does not change it.

**The no-GPU floor makes the WebGL path additive, not a replacement.** At the iPad backing store
under SwiftShader (software rasterization), every WebGL architecture was 2–3× slower than the
shipping 2D canvas — frame interval p50 8.3 ms for the CPU canvas against 16.7 (stamp), 16.7 (SDF),
and 24.8 ms (Ciallo) — and those numbers are optimistic, measured on a Mac CPU rather than an old
Android phone. Chromium is meanwhile withdrawing the safety net: "Allowing automatic fallback to
WebGL backed by SwiftShader has been deprecated and WebGL context creation will soon fail instead of
falling back to SwiftShader"
(`chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md`). So the CPU crayon cannot
be retired — it remains the fallback for GPU-less and blocklisted devices — and the GPU renderer
becomes a second implementation to maintain on top of it, not a ~5,700-line deletion.

Secondary findings, recorded so a revisit does not re-derive them:

* Chrome and Safari cap live WebGL contexts at 16 (Chrome-on-Android at 8), so a GPU port cannot
  mirror the tile grid (ADR-0085) one-context-per-tile; it must render into one context.
* Stamped and SDF renderers are indistinguishable in picture (0.108% pixel diff) and time (within
  0.002 ms at four surface sizes) despite stamp drawing 2.2× the primitives; Ciallo carries a
  consistent ~11% penalty and its integral needs a polyline window reaching backwards past the
  current frame's batch.
* Stamp spacing is not a lever: 5× fewer stamps buys 8% at authored scale (1.8% at iPad scale) and
  costs 12× the pixel change.

The spike code survives on `origin/spike/gpu-crayon` (tip 13c152be033b36feaf6047b3256fd7be493eb963,
with `-stamp`/`-ciallo`/`-sdf` sibling branches); the campaign context is
`docs/scratchpad/perf/crayon-elimination-campaign-2026-08-26.md` (idea i15).

## Consequences

* \+ A future performance campaign can rule out "port the crayon to the GPU" in one read instead of
  re-running a multi-day spike; the refutation is measured, not argued.
* \+ The `gl.MIN` glaze equivalence is on record — if the floor ever drops GPU-less devices or
  WebGPU changes the attachment-area economics, that is the one-line insight a revisit starts from,
  and re-measuring attachment-area scaling and the software-rasterizer floor is the bar it must
  clear.
* − The spike branches are unmerged and will rot against the moving engine; they document the
  architectures, not a mergeable implementation.
* − The three per-runtime deposition pipelines ADR-0146–0148 describe stay, with their maintenance
  cost — this ADR closes the cheapest-looking escape from them.
