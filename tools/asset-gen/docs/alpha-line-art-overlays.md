# Generate Alpha-Native Line-Art Overlays for Runtime Presentation

**Decision record — in force. Date:** 2026-07

## Context

Pen and chalk line art is authored and stored ink-on-white. That representation is ideal for Gemini
conditioning, registration scoring, the fill punch, and human review, but presenting it over the
drawing requires a full-page blend layer: multiply for the black pen or invert plus screen for white
chalk. ADR-0091 measured that WebKit compositor work as independently capable of crossing the
coloring-page selection frame gate.

Three representations were considered:

* Keep the opaque sources and tune CSS blend modes. `darken` still measured 37 ms, and only ordinary
  source-over composition passed—but left the source's white paper visible.
* Convert the image at runtime. This avoids committed derivatives but still allocates, transforms,
  and presents a full-resolution surface after selection; the worker-to-visible-element handoff also
  delays the page becoming recognizable.
* Commit transparent presentation siblings while retaining opaque sources for the pipeline. This
  makes the runtime renderer trivial and keeps the pipeline's established inputs unchanged.

Raw lossless alpha preserved every compression artifact in the opaque source's white background and
was about twice its size. Lossy WebP alpha at quality 70 was compact but introduced up to 11/255
edge error. Quantizing the alpha plane before lossless encoding produced smaller files with a
strict, predictable error bound.

## Decision

Every coloring-page orientation has two runtime presentation derivatives:

```text
{page}-{tall,wide}.outline.webp      opaque black pen on white; pipeline source
{page}-{tall,wide}.chalk.webp        opaque chalk stored ink-on-white; pipeline source
{page}-{tall,wide}.overlay.webp      transparent black pen; light runtime overlay
{page}-{tall,wide}.dark.overlay.webp transparent white chalk; dark runtime overlay
```

`npm run gen:coloring-overlays` runs `tools/asset-gen/bin/gen-coloring-overlays.mjs`. For each pen
outline it:

1. Decodes luma `L` from the pen source and writes black RGB with alpha `255 − L`.
2. Selects the chalk sibling for dark mode, falling back to the pen if no chalk exists, and writes
   white RGB with alpha `255 − L`.
3. Quantizes alpha to the nearest multiple of 8, clamped to 255, then encodes lossless WebP at
   effort 6.
4. Decodes the result, requires `hasAlpha: true`, and rejects any maximum reconstructed-channel
   error above 4/255.

The explicit RGBA buffer is load-bearing. Sharp's `joinChannel` tags a fourth band as a generic
extra channel and the WebP encoder can silently flatten it; `alphaOverlayRgba()` constructs the
four-channel buffer directly.

The presentation suffix describes runtime role rather than derivation source. `.overlay.webp` is the
default light presentation, while `.dark.overlay.webp` is the resolved dark presentation even when
it was derived from a fallback pen. This keeps `pageOverlayImage()` independent of the catalog's
optional chalk bookkeeping.

Opaque sources and alpha overlays are both committed under `web/static/coloring` and covered by
`golden/asset-manifest.sha256`. Web deployments retain both sets so the in-repo pipeline can keep
its source locations. `tools/mobile/strip-static-assets.mjs` removes the opaque full-resolution
sources from the completed native static build because native runtime code uses only alpha overlays
and picker thumbnails.

## Consequences

* \+ Runtime line art uses normal source-over composition with no filter or blend-mode layer.
* \+ The generator's 4/255 bound makes the visual tradeoff executable and deterministic rather than
  relying only on manual comparison.
* \+ The full catalog's 192 presentation overlays total 14.0 MB; web precaching excludes the 18.19
  MB of runtime-unused opaque sources, and native pruning removes them from static builds.
* \+ Pen/chalk pipeline inputs, registration gates, fill punches, and picker thumbnails keep their
  established storage polarity and code paths.
* − Any pen or chalk byte change invalidates its presentation derivative. Regenerate the affected
  category, rebuild its proof sheet, and refresh the asset manifest in the same commit.
* − Web deployments store both representations even though a browsing session precaches only alpha
  presentation assets and downloads opaque sources only if their direct URL is requested.
* − `.dark.overlay.webp` does not reveal whether chalk or fallback pen was its source; inspect the
  catalog's `chalkImages` or rerun the generator to answer that provenance question.
