# ADR-0129: Share Invariant SVG Overlays Across Coloring-Pack Resolution Tiers

**Status:** Active — amends [ADR-0044](0044-svg-optimization-audit.md),
[ADR-0091](0091-alpha-overlays-and-worker-magic-sheets.md), and
[ADR-0103](0103-progressive-coloring-book-packs.md) **Date:** 2026-08

## Context

ADR-0091 made transparent alpha overlays the presentation format for coloring pages so full-paper
line art could use ordinary source-over composition. ADR-0103 later gave each downloadable book a
`compact` and `full` raster inventory: both variants expose the same logical paths, while compact
overlays and fills download screen-sized WebP derivatives.

A production Vectorizer.AI pilot found that one optimized SVG can replace both raster overlay tiers
for suitable line art. Across a simple pen page, a dense pen page, and one chalk page, 99.7 KB of
raw SVG replaced 169 KB of compact WebP or 237 KB of full WebP. Chromium and WebKit decoded every
sample, reported the intended 1024×1536 intrinsic dimensions, and drew and exported it through
Canvas successfully. The pilot also showed that picker covers remain smaller as raster thumbnails
and that chalk needs a separate dense-page gate before a catalog-wide campaign.

We considered three pack representations:

1. Keep compact and full WebP overlays. This preserves a uniform raster inventory but retains two
   committed presentation files for every theme and orientation.
2. Put SVG only in the full pack and keep WebP in the compact pack. This makes a logical path change
   format across variants, complicates integrity validation, and gives the resolution choice a
   second meaning unrelated to screen pixel requirements.
3. Store one SVG under the canonical logical path in both variants. This preserves the resolution
   axis for assets that actually have resolution tiers and makes vector overlays invariant pack
   members.

## Decision

Choose option 3 for catalog entries explicitly opted into vector presentation.

`books.ts` records vector eligibility by page, orientation, and resolved theme. An eligible light
overlay uses `{page}.overlay.svg`; an eligible dark overlay uses `{page}.dark.overlay.svg`. Pages
without that entry retain the WebP paths from ADR-0091, so rollout can proceed as measured slices
rather than an all-or-nothing format migration. Picker covers and thumbnails, Magic fills, authoring
outlines, and non-selected overlays remain raster assets.

Each committed Vectorizer SVG passes through `tools/vectorize/postprocess-svg.mjs`. The pinned,
multipass SVGO transformation must reach a byte-stable fixed point, and it restores intrinsic
`width` and `height` from the optimized `viewBox`. A dark derivative bakes white ink into the SVG
root; runtime presentation still uses ordinary source-over composition and no full-page CSS filter.
The read-only repository check covers both pilot keepers and runtime SVGs, following ADR-0044's
re-runnable-audit model.

Coloring-pack manifest format 3 admits SVG only at the two overlay suffixes. An SVG has the same
logical path, download path, byte length, and SHA-256 digest in `compact` and `full`; it has no
responsive derivative. Raster files keep ADR-0103's existing mapping. Pack cache namespaces remain
version-and-resolution scoped because the installed marker already fingerprints every selected file,
including its bytes and digest; vector invariance does not introduce a separate migration or cache
authority.

The initial runtime slice is Circle portrait light and Owl portrait light/dark. Broader pen or chalk
conversion remains gated by physical-iPad page selection, theme switching, Magic reveal, rotation,
overlay/fill registration, offline installation, and export checks. A watermarked free test trace
can rehearse dense-wide geometry, but its watermark becomes traced geometry and cannot approve
production size or fidelity.

## Consequences

* \+ A qualifying overlay is resolution-independent and occupies one committed runtime file instead
  of compact and full raster derivatives.
* \+ Compact and full packs retain one logical inventory and the existing atomic verification model.
* \+ Vector rollout is explicit and reversible per page, orientation, and theme; unproven art keeps
  its current WebP path.
* \+ Dark SVGs preserve ADR-0091's source-over presentation contract without runtime recoloring.
* − Manifest consumers must understand format 3 and enforce byte-identical SVG entries across tiers.
* − Native packages receive raw SVG bytes without HTTP Brotli compression, so production approval
  must use raw size rather than web transfer size.
* − Vector fidelity is close but not pixel-identical; every campaign stage still requires visual
  registration and physical-device performance evidence.
* − Theme-specific SVG files duplicate geometry when both pen and chalk are selected. Chalk remains
  a separate cost and size decision rather than an automatic consequence of the pen campaign.
