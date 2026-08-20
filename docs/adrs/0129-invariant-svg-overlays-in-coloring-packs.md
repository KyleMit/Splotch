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
for suitable line art. The subsequent 96-page pen campaign produced 3,572,243 raw SVG bytes and
1,558,331 gzip transfer bytes, replacing 6,274,180 compact or 9,080,706 full WebP bytes. Every trace
passed the catalog fidelity gate: binary ink IoU remained at or above 96.34%, and alpha mean
absolute error remained at or below 2.46/255. Chromium and WebKit decoded, drew, and exported the
simple, dense, and chalk pilot samples successfully. Picker covers remain smaller as raster
thumbnails, and chalk still needs its own dense-page production gate before a broader campaign.

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

Choose option 3 for all light-mode page overlays and for dark-mode entries explicitly opted into
vector presentation.

Every light overlay uses `{page}.overlay.svg`. `books.ts` records the smaller dark eligibility set
by page and orientation; an eligible dark overlay uses `{page}.dark.overlay.svg`, while every other
dark overlay retains the WebP path from ADR-0091. Picker covers and thumbnails, Magic fills,
authoring outlines, and non-selected dark overlays remain raster assets.

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

The pen catalog passed a paid dense-landscape gate on Fairy wide before the remaining pages were
processed in book-sized batches. The final catalog build then passed physical-iPad page selection,
theme switching, Magic reveal, rotation, overlay/fill registration, clearing, and export checks. The
invariant pack path had already passed a real offline install and relaunch with digest-matched SVG
bytes. The deployed SVG responses used gzip; the production decision therefore uses measured gzip
bytes for web and raw bytes for native. A watermarked free test trace can rehearse geometry, but its
watermark becomes traced geometry and cannot approve production size or fidelity.

The exact production recipe and every source/output digest live in
`tools/vectorize/coloring-overlays.json`. `npm run vectorize:coloring:check` is the derivation drift
guard, while `npm run vectorize:coloring:analyze` re-rasterizes the SVG catalog against its
authoring outlines. The size comparison fields are populated only while the replaced WebPs are
available; the fidelity gate remains repeatable after those redundant runtime assets are removed.

## Consequences

* \+ A qualifying overlay is resolution-independent and occupies one committed runtime file instead
  of compact and full raster derivatives.
* \+ Compact and full packs retain one logical inventory and the existing atomic verification model.
* \+ Light presentation has one format and one invariant asset per orientation across the catalog;
  unproven dark art keeps its current WebP path.
* \+ Dark SVGs preserve ADR-0091's source-over presentation contract without runtime recoloring.
* − Manifest consumers must understand format 3 and enforce byte-identical SVG entries across tiers.
* − Native packages receive raw SVG bytes without HTTP Brotli compression, so production approval
  must use raw size rather than web transfer size.
* − Vector fidelity is close but not pixel-identical; future source regeneration still requires the
  derivation, fidelity, visual-registration, and physical-device gates.
* − Theme-specific SVG files duplicate geometry when both pen and chalk are selected. Chalk remains
  a separate cost and size decision rather than an automatic consequence of the pen campaign.
