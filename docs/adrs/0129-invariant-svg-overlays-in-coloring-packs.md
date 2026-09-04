# ADR-0129: Share Invariant SVG Overlays Across Coloring-Pack Resolution Tiers

**Status:** Active — amends [ADR-0044](0044-svg-optimization-audit.md),
[ADR-0045](0045-coloring-picker-thumbnails-and-prefetch.md),
[ADR-0091](0091-alpha-overlays-and-worker-magic-sheets.md), and
[ADR-0103](0103-progressive-coloring-book-packs.md); amended by
[ADR-0152](0152-responsive-raster-coloring-selectors.md)

**Date:** 2026-08

## Context

ADR-0091 made transparent alpha overlays the presentation format for coloring pages so full-paper
line art could use ordinary source-over composition. ADR-0103 later gave each downloadable book a
`compact` and `full` raster inventory: both variants expose the same logical paths, while compact
overlays and fills download screen-sized WebP derivatives.

A production Vectorizer.AI pilot found that one optimized SVG can replace both raster overlay tiers
for suitable line art. The subsequent 96-page pen campaign produced 3,572,243 raw SVG bytes and
1,558,331 gzip transfer bytes, replacing 6,274,180 compact or 9,080,706 full WebP bytes. Every trace
passed the catalog fidelity gate: binary ink IoU remained at or above 96.34%, and alpha mean
absolute error remained at or below 2.46/255. The completed 96-page chalk campaign then produced
3,959,975 raw SVG bytes and 1,731,806 gzip bytes, replacing 4,479,786 compact or 5,361,446 full WebP
bytes. Its minimum IoU was 95.67% and maximum alpha error was 1.83/255. Chromium and WebKit decoded,
drew, and exported the simple, dense, and chalk pilot samples successfully. Picker covers remain
smaller as raster thumbnails.

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

Choose option 3 for every light- and dark-mode page overlay.

Every light overlay uses `{page}.overlay.svg`, and every dark overlay uses
`{page}.dark.overlay.svg`. These files are also the canonical page line art used by the authoring
pipeline. Picker covers and Magic fills remain raster assets. The page picker and active-page chip
use those exact theme- and orientation-matched SVG URLs without responsive candidates or CSS
line-art filters. Only book covers retain raster thumbnails.

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

The pen and chalk campaigns each passed a paid dense-landscape gate on Fairy wide before the
remaining pages were processed in book-sized batches. The final 13 chalk traces used Train wide as a
second dense gate before completing Vehicles and Station landscape. The final light catalog build
passed physical-iPad page selection, theme switching, Magic reveal, rotation, overlay/fill
registration, clearing, and export checks. The integrated dark selection then passed the
physical-iPad theme and coloring interaction rows, loaded a dark SVG directly in Safari, and
completed screenshot export. The completed 96-page dark catalog repeated that sweep after the final
13 traces: theme switching, book opening, and page selection passed, with selection at 18 ms
first-frame P95 and 20 ms post-action P95/max. The report-only screenshot maximum remained 0.5 ms
above its strict gate while broader pre-existing Settings and clear failures remained. The invariant
pack path had already passed a real offline install and relaunch with digest-matched SVG bytes. The
deployed SVG responses used gzip; the production decision therefore uses measured gzip bytes for web
and raw bytes for native. A watermarked free test trace can rehearse geometry, but its watermark
becomes traced geometry and cannot approve production size or fidelity.

The exact production recipe and every trace-source/output digest live in
`tools/vectorize/coloring-overlays.json` and `tools/vectorize/coloring-dark-overlays.json`. `npm run
vectorize:coloring:check` is the derivation drift guard, while `npm run vectorize:coloring:analyze`
re-rasterizes either SVG catalog against its authoring sources when those temporary sources are
present. The committed ledger continues to verify the canonical output inventory after those
uncommitted trace sources are removed.

## Consequences

* \+ A qualifying overlay is resolution-independent and occupies one committed runtime file instead
  of compact and full raster derivatives.
* \+ Compact and full packs retain one logical inventory and the existing atomic verification model.
* \+ Both themes have one format and one invariant asset per orientation across the catalog.
* \+ Dark SVGs preserve ADR-0091's source-over presentation contract without runtime recoloring.
* − Manifest consumers must understand format 3 and enforce byte-identical SVG entries across tiers.
* − Native packages receive raw SVG bytes without HTTP Brotli compression, so production approval
  must use raw size rather than web transfer size.
* − Vector fidelity is close but not pixel-identical; future source regeneration still requires the
  derivation, fidelity, visual-registration, and physical-device gates.
* − Theme-specific SVG files duplicate geometry between pen and chalk presentation.

## Amendment (2026-08): Make Page SVGs the Canonical Authoring Source

The accepted page traces made the opaque page masters redundant. All deterministic audits,
proof-sheet rendering, Gemini conditioning, and fresh/normalize/chalk regeneration now rasterize the
canonical SVG alpha onto white. New or edited page art is staged as an uncommitted
`vectorized/coloring-{,dark-}overlays/{page}.source.webp`, then traced into the canonical SVG. Cover
masters retain `.outline.webp` and `.chalk.webp` until the separate cover campaign is approved.

The fill punch chooses the SVG-alpha mask directly. The threshold is alpha greater than 105,
algebraically equivalent to the retired ink-on-white test `luma < 150`. Across all 96 pages, the new
light masks measured 96.24%–98.91% IoU against the retired raster masks; dark masks measured
95.63%–98.68%. Median mask-area ratios were 1.003 light and 1.014 dark. We considered keeping the
raster masks, repunching every fill from the new masks, and using SVG alpha only for future work.
The third option is retained: shipped fills already passed composite review under these SVGs, while
repunching 192 binary fills for subpixel edge differences would create catalog-wide churn with no
visible gain. Existing raw fills and shipped punches remain byte-stable; every future punch uses the
canonical SVG alpha.

The migration removes 96 light and 96 dark page raster masters (18,288,242 bytes). Golden catalog
format 6 freezes scores from SVG-derived rasterization. Two reviewed eye coordinates, three local
warp ceilings, two night-halo ceilings, and the chalk-ink lower-p90 default moved by bounded
rasterization noise; no creative asset was regenerated. The invented-shape audit retains its three
pre-existing flags unchanged.

Vectorization ledgers use format 2. Each record keeps the paid trace source digest and byte count as
provenance plus the canonical output digest and byte count as the live drift guard; the trace source
itself is recovery scratch and is not committed. `vectorize:coloring:check` independently enumerates
the exact canonical SVG inventory so deleting a ledger record and its file cannot pass vacuously.

Coloring-pack manifest format 3 already admits the SVG suffixes and fingerprints selected bytes. A
stale manifest that names a deleted raster master fails its fetch, writes no installed marker, and
remains retryable. The safe fail-closed behavior needs no manifest-format bump.

## Amendment (2026-08): Make Cover SVGs Canonical

The separately approved cover campaign traced all eight light and eight dark cover masters with the
same production recipe and 16 credits. Every trace passed the catalog gate: light covers measured at
least 96.62% binary ink IoU and at most 2.76/255 mean alpha error; dark covers measured at least
97.25% IoU and at most 2.56/255 error. The light SVGs total 347,803 raw / 148,128 gzip bytes versus
734,748 source WebP bytes; dark totals are 364,614 / 156,300 versus 686,942.

`cover.overlay.svg` and `cover.dark.overlay.svg` are therefore canonical line-art masters under the
same format-2 derivation ledgers as pages. The 16 opaque raster masters are removed. Cover picker
presentation remains `cover.thumb.webp` and `cover.chalk.thumb.webp`; `gen:coloring-thumbs`
deterministically rasterizes those thumbnails from the canonical SVGs, and `gen:coloring-responsive`
derives their 240 px candidates. Cover SVGs have no fill, punch, canvas, or downloaded-pack role, so
native static stripping removes both canonical masters after their thumbnail derivatives are
present.

The ledgers now contain 104 light and 104 dark records. Fidelity analysis reads the uncommitted
restart-tree `.source.webp` files rather than assuming a committed raster master. The ledger check
always binds every canonical SVG to its recorded output digest and also verifies recorded source
digests when that recovery scratch is locally present; after it is removed, those source fields are
retained provenance rather than independently verifiable inputs.

## Amendment (2026-08): Separate Canonical Authority from Runtime Presentation

ADR-0152 supersedes this amendment's full-page presentation WebPs and single-size selector. The
canonical SVG again presents the full paper; selectors use a responsive 96/240/400 px raster set.

The SVG remains the only canonical line-art source and the authority for drawing state, Magic
registration, and screenshot export. Runtime presentation may use a deterministic derivative when
that avoids repeatedly rasterizing full-page SVG inside a constrained WebKit frame.

Web page grids and the active-page chip use lossless 400 px selector WebPs. The web canvas uses a
lossless full-size presentation WebP, and compact downloadable packs map that same logical path to a
lossless 1,152 px presentation derivative. Native page grids retain the selector WebPs, while the
Capacitor canvas and export path display the canonical SVG and omit presentation WebPs from native
packs and the static export. Thus pack-resolution invariance still applies to canonical SVGs; it no
longer claims that every UI surface presents those SVG bytes directly.

Selector and presentation derivatives rasterize SVGs with the pinned `@resvg/resvg-js` renderer
before Sharp performs only the lossless WebP encoding. The generator disables system-font loading,
pins the target geometry, and the catalog gate requires every decoded derivative pixel to equal the
deterministic Resvg RGBA buffer. This removes the macOS/Linux librsvg variance without weakening the
canonical SVG fidelity contract.
